/**
 * "Default layouts" - the studio-wide starting point every scenario of a game
 * type inherits.
 *
 * WHY THIS PAGE EXISTS
 * Quest's HUD geometry was authored in code (`defaultLayout.ts`, mirrored as the
 * playground's bundled `defaultLayout.json`) and the per-role text size/colour
 * only ever existed per scenario. So "the timer sits 2 % too far left on every
 * scenario" meant a code change plus a release, and a studio-wide look had to be
 * re-entered by hand on each scenario. This page owns both as DEFAULTS:
 *
 *   - positions: drag/resize the real HUD; saved per element id, so the code
 *     layout stays the skeleton and only what an admin moved is stored;
 *   - text size / colour / background: the same eleven roles as the scenario
 *     panel, with a scenario's own values layered on top of these field by field.
 *
 * Persistence is the two `default_config` rows named in `useTagquestDefaults`,
 * the same mechanism the admin Translations page uses. `playground.php` ships
 * them in the sync manifest, so the projector resolves them identically.
 *
 * Only Quest is implemented. The other three types are listed and disabled on
 * purpose: Mystery has a per-scenario in-game layout editor and Tracks/Clash
 * have per-scenario `scenario_layout` editors, so a defaults layer for them is a
 * separate piece of work rather than a missing switch here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Move, RotateCcw, Save, Type } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { defaultTagquestLayout } from '../../scenarios/bodies/tagquest/defaultLayout';
import {
  TAGQUEST_MAIN_IMAGE_MARGIN_MAX,
  applyTagquestLayoutOverrides,
  pruneTagquestLayoutOverrides,
  readTagquestLayoutOverrides,
  type TagquestElementOverride,
  type TagquestLayoutOverrides,
} from '../../scenarios/bodies/tagquest/layoutOverrides';
import {
  readTagquestTypography,
  type TagquestTypography,
} from '../../scenarios/bodies/tagquest/typographyCategories';
import { TagquestPreviewRenderer, type PreviewQuest } from '../../scenarios/preview/TagquestPreviewRenderer';
import { TagquestTypographyPanel } from '../../scenarios/preview/TagquestTypographyPanel';
import type { TagquestTextCategoryId } from '../../scenarios/bodies/tagquest/typographyCategories';
import { getPreviewLabels } from '../../scenarios/preview/previewLabels';
import { useAdminTranslations } from '../../scenarios/preview/useAdminTranslations';
import {
  TAGQUEST_LAYOUT_META,
  TAGQUEST_TYPOGRAPHY_META,
  fetchDefaultConfigValue,
  invalidateTagquestDefaults,
} from '../../scenarios/preview/useTagquestDefaults';
import { DEFAULT_VIEWPORT } from '../../scenarios/preview/viewportTypes';
import type { Lang } from '../../scenarios/i18n/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

/** The game types the page lists. Only `tagquest` is wired up (see header). */
const GAME_TYPES = [
  { code: 'tagquest', labelKey: 'types.tagquest', enabled: true },
  { code: 'mystery', labelKey: 'types.mystery', enabled: false },
  { code: 'tracks', labelKey: 'types.tracks', enabled: false },
  { code: 'clash', labelKey: 'types.clash', enabled: false },
] as const;

type SidebarTab = 'positions' | 'typography';

/**
 * Mock scenario the HUD is drawn against. There is no scenario on this page, so
 * the template falls back to the bundled default artwork and the six quest rows
 * are populated just enough for every text element to be on screen - an element
 * the author cannot see is an element they cannot place.
 */
const MOCK_QUESTS: PreviewQuest[] = Array.from({ length: 6 }, (_, i) => ({
  name: `Quest ${i + 1}`,
}));

const MOCK_GAME_META = {
  use_default_template: true,
  combo_6_quests: '60',
  combo_4_quests: '40',
  combo_2_quests: '20',
} as const;

function noMedia(): string {
  return '';
}

export function DefaultLayoutsView() {
  const { t } = useTranslation('defaultLayouts');
  const { token, user } = useAuth();
  const adminLabels = useAdminTranslations();

  const [gameType, setGameType] = useState<string>('tagquest');
  const [tab, setTab] = useState<SidebarTab>('positions');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [layout, setLayout] = useState<TagquestLayoutOverrides>({ elements: {} });
  const [typography, setTypography] = useState<TagquestTypography>({});
  // `default_config.php?action=create` wants the version it is replacing.
  const [versions, setVersions] = useState<Record<string, number>>({});

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<TagquestTextCategoryId | null>(null);

  const authHeaders = useMemo(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['X-Auth-Token'] = token;
    return h;
  }, [token]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [layoutCfg, typoCfg] = await Promise.all([
          fetchDefaultConfigValue(TAGQUEST_LAYOUT_META, token).catch(() => null),
          fetchDefaultConfigValue(TAGQUEST_TYPOGRAPHY_META, token).catch(() => null),
        ]);
        if (!active) return;
        setLayout(readTagquestLayoutOverrides(layoutCfg?.value));
        setTypography(readTagquestTypography(typoCfg?.value));
        setVersions({
          [TAGQUEST_LAYOUT_META]: layoutCfg?.version ?? 1,
          [TAGQUEST_TYPOGRAPHY_META]: typoCfg?.version ?? 1,
        });
      } catch (err) {
        if (active) setMessage({ type: 'error', text: (err as Error).message || t('loadFailed') });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // The HUD the author is looking at: the code skeleton with their moves applied.
  const elements = useMemo(
    () => applyTagquestLayoutOverrides(defaultTagquestLayout.elements, layout),
    [layout],
  );
  const placeable = useMemo(
    () => elements.filter((el) => el.id !== 'tagquest_template'),
    [elements],
  );
  const selectedElement = useMemo(
    () => elements.find((el) => el.id === selectedElementId) ?? null,
    [elements, selectedElementId],
  );

  const patchElement = useCallback((id: string, patch: TagquestElementOverride) => {
    setLayout((prev) => ({
      elements: { ...prev.elements, [id]: { ...(prev.elements[id] ?? {}), ...patch } },
    }));
  }, []);

  const setMainImageMargin = useCallback((n: number | undefined) => {
    setLayout((prev) => ({ ...prev, mainImageMargin: n }));
  }, []);

  const resetElement = useCallback((id: string) => {
    setLayout((prev) => {
      const next = { ...prev.elements };
      delete next[id];
      return { elements: next };
    });
  }, []);

  async function saveConfig(meta: string, value: unknown): Promise<number> {
    const res = await fetch(`${API_BASE_URL}/default_config.php?action=create`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        user_email: user?.email,
        meta,
        version: versions[meta] ?? 1,
        value,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || t('saveFailedOne', { meta, status: res.status }));
    return Number(json.version) || (versions[meta] ?? 1) + 1;
  }

  const handleSave = async () => {
    if (!user?.email) {
      setMessage({ type: 'error', text: t('mustBeAdmin') });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      // Prune first: an element dragged back to its code position should drop out
      // of the blob, not freeze today's code values into it forever.
      const pruned = pruneTagquestLayoutOverrides(defaultTagquestLayout.elements, layout);
      const layoutVersion = await saveConfig(TAGQUEST_LAYOUT_META, pruned);
      const typoVersion = await saveConfig(TAGQUEST_TYPOGRAPHY_META, typography);
      setLayout(pruned);
      setVersions({
        [TAGQUEST_LAYOUT_META]: layoutVersion,
        [TAGQUEST_TYPOGRAPHY_META]: typoVersion,
      });
      // Scenario previews cache these at module scope; drop it so an Aperçu
      // opened next shows what was just saved.
      invalidateTagquestDefaults();
      setMessage({ type: 'success', text: t('saved') });
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message || t('saveFailed') });
    } finally {
      setSaving(false);
    }
  };

  const movedCount = Object.keys(layout.elements).length;
  const styledCount = Object.keys(typography).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {GAME_TYPES.map((gt) => (
            <button
              key={gt.code}
              type="button"
              disabled={!gt.enabled}
              onClick={() => setGameType(gt.code)}
              title={gt.enabled ? undefined : t('notAvailableYet')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                gameType === gt.code && gt.enabled
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-800'
              }`}
            >
              {t(gt.labelKey)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {t('summary', { moved: movedCount, styled: styledCount })}
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t('save')}
          </button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-slate-400">{t('intro')}</p>

      {message && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-900/40 text-emerald-200'
              : 'bg-red-900/40 text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-slate-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {t('loading')}
        </div>
      ) : (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 lg:h-[calc(100vh-19rem)] lg:flex-row">
          {/* The real HUD. In `layoutEditMode` every element carries a drag box. */}
          <div className="min-h-[360px] flex-1">
            <TagquestPreviewRenderer
              gameMeta={MOCK_GAME_META as Record<string, unknown>}
              quests={MOCK_QUESTS}
              resolveMediaUrl={noMedia}
              canonicalWidth={DEFAULT_VIEWPORT.width}
              canonicalHeight={DEFAULT_VIEWPORT.height}
              selectedQuestIndex={0}
              questView="pieces"
              showMalusOverlay
              showLateMalusOverlay
              readLocalized={(value) => (typeof value === 'string' ? value : '')}
              labels={getPreviewLabels('fr' as Lang, 'fr' as Lang)}
              lang={'fr' as Lang}
              defaultLang={'fr' as Lang}
              adminLabels={adminLabels}
              typographyDefaults={typography}
              layoutOverrides={layout}
              layoutEditMode={tab === 'positions'}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
              onElementGeometry={patchElement}
              onMainImageMargin={(pct) => setMainImageMargin(pct > 0 ? pct : undefined)}
              textEditMode={tab === 'typography'}
              selectedTextCategory={selectedCategory}
              onSelectTextCategory={setSelectedCategory}
            />
          </div>

          <div className="flex w-full shrink-0 flex-col border-t border-slate-700 bg-white lg:w-[320px] lg:border-l lg:border-t-0">
            <div className="flex shrink-0 border-b border-gray-200">
              {(
                [
                  { id: 'positions' as SidebarTab, icon: Move, labelKey: 'tabs.positions' },
                  { id: 'typography' as SidebarTab, icon: Type, labelKey: 'tabs.typography' },
                ]
              ).map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setTab(x.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-semibold ${
                    tab === x.id
                      ? 'border-b-2 border-blue-600 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <x.icon className="h-3.5 w-3.5" />
                  {t(x.labelKey)}
                </button>
              ))}
            </div>

            {tab === 'positions' ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <p className="border-b border-gray-200 px-3 py-2 text-[11px] leading-snug text-gray-500">
                  {t('positionsHint')}
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
                  {placeable.map((el) => {
                    const isSel = selectedElementId === el.id;
                    const overridden = layout.elements[el.id] !== undefined;
                    return (
                      <div
                        key={el.id}
                        onClick={() => setSelectedElementId(el.id)}
                        className={`cursor-pointer rounded-md border px-2 py-1.5 ${
                          isSel
                            ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-200'
                            : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="flex-1 truncate text-xs font-medium text-gray-700">
                            {el.name}
                          </span>
                          {overridden && (
                            <span className="rounded bg-amber-100 px-1 py-px text-[9px] font-semibold uppercase text-amber-700">
                              {t('moved')}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              resetElement(el.id);
                            }}
                            disabled={!overridden}
                            title={t('resetElement')}
                            aria-label={t('resetElement')}
                            className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {isSel && (
                          <div
                            className="mt-1.5 grid grid-cols-2 gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(
                              [
                                ['x', el.x],
                                ['y', el.y],
                                ['width', el.width],
                                ['height', el.height],
                              ] as const
                            ).map(([field, current]) => (
                              <label key={field} className="flex items-center gap-1">
                                <span className="w-10 text-[10px] uppercase text-gray-400">
                                  {t(`fields.${field}`)}
                                </span>
                                <input
                                  type="number"
                                  step={0.1}
                                  // A keyword dimension ('auto' on the malus
                                  // icons) has no number to show or nudge; typing
                                  // one would silently freeze the artwork ratio.
                                  value={typeof current === 'number' ? current : ''}
                                  placeholder={typeof current === 'string' ? current : ''}
                                  disabled={typeof current !== 'number'}
                                  onChange={(e) => {
                                    const raw = e.target.value.trim();
                                    if (raw === '') return;
                                    const n = Number(raw);
                                    if (!Number.isFinite(n)) return;
                                    patchElement(el.id, { [field]: n } as TagquestElementOverride);
                                  }}
                                  className="w-full rounded border border-gray-300 px-1 py-0.5 text-right text-xs disabled:bg-gray-100"
                                />
                              </label>
                            ))}
                            {/* The one inner geometry on the HUD: room for the
                                green/red status glow, which follows the artwork's
                                alpha and otherwise bleeds onto the template. */}
                            {el.id === 'animation_quest_image' && (
                              <div className="col-span-2 mt-0.5 border-t border-gray-200 pt-1.5">
                                <label className="flex items-center gap-1">
                                  <span className="flex-1 text-[10px] uppercase text-gray-400">
                                    {t('mainImageMargin')}
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={TAGQUEST_MAIN_IMAGE_MARGIN_MAX}
                                    step={0.5}
                                    value={layout.mainImageMargin ?? 0}
                                    onChange={(e) => {
                                      const raw = e.target.value.trim();
                                      if (raw === '') {
                                        setMainImageMargin(undefined);
                                        return;
                                      }
                                      const n = Number(raw);
                                      if (!Number.isFinite(n)) return;
                                      setMainImageMargin(n > 0 ? n : undefined);
                                    }}
                                    className="w-[58px] rounded border border-gray-300 px-1 py-0.5 text-right text-xs"
                                  />
                                  <span className="text-[10px] text-gray-400">%</span>
                                </label>
                                <p className="mt-1 text-[10px] leading-snug text-gray-400">
                                  {t('mainImageMarginHint')}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {selectedElement && (
                  <p className="shrink-0 border-t border-gray-200 px-3 py-2 text-[11px] text-gray-400">
                    {t('selectedHint', { name: selectedElement.name })}
                  </p>
                )}
              </div>
            ) : (
              <TagquestTypographyPanel
                selected={selectedCategory}
                onSelect={setSelectedCategory}
                value={typography}
                onChange={setTypography}
                title={t('typographyTitle')}
                subtitle={t('typographySubtitle')}
                footerHint={t('typographyFooter')}
                className="flex min-h-0 flex-1 flex-col bg-white"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
