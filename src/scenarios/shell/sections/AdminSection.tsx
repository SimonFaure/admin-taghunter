/**
 * Admin section - scenario_version, audience (age bands), difficulty (1–5 stars),
 * and univers (free-text theme tags).
 *
 * Audience is a multi-select of six age bands grouped under Enfants / Ados-Adultes;
 * the name-pool tier is derived from the bands (oldest wins) and shown read-only so
 * the author sees which team-name pool will be used. Difficulty is an integer 1–5
 * rendered as a clickable star row. Univers is a chip-style tag input with
 * per-client autocomplete.
 *
 * The derived `game_public` shadow + difficulty coercion are written centrally on
 * save (saveOrchestrator.applyMetadataDerivations) - this section only edits the
 * new source-of-truth fields.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { useScenarioEditor } from '../useScenarioEditor';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { UniversTagInput } from '../components/UniversTagInput';
import {
  AUDIENCE_BANDS,
  type AudienceBand,
  type CatalogGroup,
  normalizeBands,
  bandsToNamePoolTier,
  getBandLabel,
  getAudienceLabel,
} from '../../../types/audience';
import { DIFFICULTY_LEVELS, coerceDifficulty } from '../../../types/difficulty';
import { normalizeUnivers } from '../../../types/univers';
import { authFetch } from '../../../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

const BAND_GROUPS: { group: CatalogGroup; bands: AudienceBand[] }[] = [
  { group: 'enfants', bands: AUDIENCE_BANDS.filter((b) => b.group === 'enfants').map((b) => b.value) },
  { group: 'ados_adultes', bands: AUDIENCE_BANDS.filter((b) => b.group === 'ados_adultes').map((b) => b.value) },
];

export function AdminSection() {
  const { t } = useTranslation('editorSections1');
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const setKey = (k: string, v: unknown) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [k]: v }) as typeof m);

  const bands = normalizeBands(meta.audience_bands);
  const bandSet = new Set(bands);
  const difficulty = coerceDifficulty(meta.difficulty);
  const univers = normalizeUnivers(meta.univers);
  const derivedTier = bandsToNamePoolTier(bands);

  const toggleBand = (band: AudienceBand) => {
    const next = bandSet.has(band) ? bands.filter((b) => b !== band) : [...bands, band];
    setKey('audience_bands', normalizeBands(next));
  };

  // Per-client univers autocomplete pool: distinct tags across the scenarios the
  // current account can see (own scenarios for a client, all for an admin).
  const [universPool, setUniversPool] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/scenarios.php?action=list`, { credentials: 'include' });
        if (!res.ok) return;
        const json = await res.json();
        const pool = new Set<string>();
        for (const s of json.scenarios || []) {
          const raw = s.data ?? s.game_data;
          if (!raw) continue;
          try {
            const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const u = obj?.game_meta?.univers ?? obj?.data?.game_meta?.univers;
            for (const tag of normalizeUnivers(u)) pool.add(tag);
          } catch {
            /* skip malformed */
          }
        }
        if (!cancelled) setUniversPool(Array.from(pool).sort((a, b) => a.localeCompare(b)));
      } catch {
        /* autocomplete is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(() => universPool, [universPool]);

  return (
    <CollapsibleSection title={t('admin.sectionTitle')}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700 mb-1 block">{t('admin.scenarioVersion')}</span>
            {/* Read-only mirror of the DB column scenarios.version (auto-bumped
                +0.1 on every save) so this matches the scenarios details page.
                NOT editable - the bump is owned by the save orchestrator. */}
            <input
              type="text"
              value={editor.scenarioVersion || '-'}
              readOnly
              disabled
              className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-500 rounded-md text-sm cursor-not-allowed"
            />
          </label>

          <div className="block">
            <span className="text-xs font-medium text-gray-700 mb-1 block">{t('admin.difficulty')}</span>
            <div className="flex items-center gap-1 h-[38px]">
              {DIFFICULTY_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setKey('difficulty', level)}
                  aria-label={`${level} / ${DIFFICULTY_LEVELS.length}`}
                  className="p-0.5 text-amber-500 hover:scale-110 transition-transform"
                >
                  <Star className={`w-6 h-6 ${level <= difficulty ? 'fill-amber-400' : 'fill-none text-gray-300'}`} />
                </button>
              ))}
              <span className="ml-2 text-xs text-gray-500">{difficulty} / {DIFFICULTY_LEVELS.length}</span>
            </div>
          </div>
        </div>

        <div className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">{t('admin.audience')}</span>
          <div className="space-y-2">
            {BAND_GROUPS.map(({ group, bands: groupBands }) => (
              <div key={group}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  {t(`admin.audienceGroups.${group}`)}
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {groupBands.map((band) => {
                    const active = bandSet.has(band);
                    return (
                      <button
                        key={band}
                        type="button"
                        onClick={() => toggleBand(band)}
                        className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {getBandLabel(band, t)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {bands.length === 0 ? (
            <p className="mt-1.5 text-xs text-amber-600">{t('admin.audienceEmptyWarning')}</p>
          ) : (
            <p className="mt-1.5 text-xs text-gray-500">
              {t('admin.namePoolHint', { tier: getAudienceLabel(derivedTier, t) })}
            </p>
          )}
        </div>

        <div className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">{t('admin.univers')}</span>
          <UniversTagInput
            value={univers}
            onChange={(next) => setKey('univers', next)}
            suggestions={suggestions}
            placeholder={t('admin.universPlaceholder')}
          />
        </div>
      </div>
    </CollapsibleSection>
  );
}
