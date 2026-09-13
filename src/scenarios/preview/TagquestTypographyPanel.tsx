/**
 * Tagquest typography panel - size, colour and background for the eleven HUD
 * text roles.
 *
 * This REPLACES the old "Textes du jeu : taille et couleur" section of the
 * scenario editor. The roles are abstract read on their own ("combo data",
 * "chrome titles"), so the form made the author guess which text on screen
 * they were about to change; the retour asked for it to live in the layout
 * editor instead. Here the author picks a role by CLICKING the text on the
 * rendered HUD - `TagquestPreviewRenderer` in `textEditMode` reports the
 * clicked element's role - and this panel is the numeric side of that
 * selection, kept in sync both ways.
 *
 * CONTROLLED, and used at two altitudes:
 *   - the scenario editor's Aperçu modal edits `game_meta.tagquest_typography`
 *     and passes the studio-wide defaults as `inherited`, so an untouched row
 *     shows the value the scenario will actually draw and "reset" returns to
 *     inheriting rather than to the code value;
 *   - the admin "Default layouts" page edits those defaults themselves, with no
 *     `inherited` layer under them.
 *
 * Sizes are percentages of the authored size on purpose - see
 * typographyCategories.ts for why an absolute size per role would break the
 * artwork alignment.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import {
  TAGQUEST_TEXT_CATEGORIES,
  TAGQUEST_SIZE_MAX,
  TAGQUEST_SIZE_MIN,
  tagquestSizeFactor,
  type TagquestTextCategoryId,
  type TagquestTextStyle,
  type TagquestTypography,
} from '../bodies/tagquest/typographyCategories';

/** `<input type="color">` only accepts `#rrggbb` - drop any alpha byte. */
function toPickerColor(value: string | undefined, fallback: string): string {
  const v = (value ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{8}$/i.test(v)) return v.slice(0, 7);
  return fallback;
}

/**
 * Split a stored background into the picker's `#rrggbb` and a 0-100 opacity.
 * A plate over the template artwork is almost always wanted semi-transparent,
 * and `<input type="color">` cannot express alpha - so the panel carries the
 * opacity separately and recombines it into `#rrggbbaa` on the way out.
 */
function splitAlpha(value: string | undefined): { hex: string; alpha: number } {
  const v = (value ?? '').trim();
  if (/^#[0-9a-f]{8}$/i.test(v)) {
    return { hex: v.slice(0, 7), alpha: Math.round((parseInt(v.slice(7, 9), 16) / 255) * 100) };
  }
  if (/^#[0-9a-f]{6}$/i.test(v)) return { hex: v, alpha: 100 };
  return { hex: '#000000', alpha: 60 };
}

function joinAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(100, Math.round(alpha)));
  if (a >= 100) return hex;
  return hex + Math.round((a / 100) * 255).toString(16).padStart(2, '0');
}

interface TagquestTypographyPanelProps {
  /** Role currently selected on the canvas (null = none picked yet). */
  selected: TagquestTextCategoryId | null;
  onSelect: (id: TagquestTextCategoryId) => void;
  /** The map being edited. */
  value: TagquestTypography;
  onChange: (next: TagquestTypography) => void;
  /** Layer underneath (the studio-wide defaults). Absent on the admin page. */
  inherited?: TagquestTypography;
  /** Font used in the sample swatches (the scenario's, where there is one). */
  fontFamily?: string;
  /** Heading + hints. Default to the scenario-editor wording. */
  title?: string;
  subtitle?: string;
  footerHint?: string;
  /**
   * Shell classes. The Aperçu modal docks this as its own 320px sidebar; the
   * admin page puts it inside a sidebar that already has the width and border.
   */
  className?: string;
}

export function TagquestTypographyPanel({
  selected,
  onSelect,
  value,
  onChange,
  inherited,
  fontFamily,
  title,
  subtitle,
  footerHint,
  className,
}: TagquestTypographyPanelProps) {
  const { t } = useTranslation();
  const typography = value;

  // Clicking a text on the HUD scrolls its row into view here, so the numbers
  // for the role the author just picked are always visible.
  const rowRefs = useRef<Partial<Record<TagquestTextCategoryId, HTMLDivElement | null>>>({});
  useEffect(() => {
    if (!selected) return;
    rowRefs.current[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  /** Write one category, dropping it entirely when it goes back to default. */
  const setCategory = (id: TagquestTextCategoryId, patch: TagquestTextStyle | null) => {
    const next: TagquestTypography = { ...typography };
    if (patch === null) {
      delete next[id];
    } else {
      const merged = { ...(next[id] ?? {}), ...patch };
      if (
        merged.size === undefined &&
        merged.color === undefined &&
        merged.background === undefined
      ) {
        delete next[id];
      } else {
        next[id] = merged;
      }
    }
    onChange(next);
  };

  const touched = Object.keys(typography).length > 0;

  return (
    <aside
      className={
        className ?? 'w-[320px] shrink-0 border-l border-gray-200 bg-white flex flex-col min-h-0'
      }
    >
      <div className="px-3 py-2 border-b border-gray-200">
        <h3 className="text-xs font-semibold text-gray-800">
          {title ?? t('editorTagquest:typography.sectionTitle')}
        </h3>
        <p className="mt-1 text-[11px] leading-snug text-gray-500">
          {subtitle ?? t('editorTagquest:typography.clickHint')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {TAGQUEST_TEXT_CATEGORIES.map((cat) => {
          const own = typography[cat.id];
          const base = inherited?.[cat.id];
          // What the game draws for this role right now: the row's own value,
          // else the inherited default, else the layout's authored value.
          const effective: TagquestTextStyle = { ...base, ...own };
          const factor = tagquestSizeFactor(effective.size);
          const sizePercent = effective.size ?? 100;
          const colorActive = own?.color !== undefined;
          const bgActive = own?.background !== undefined;
          const catDefault = toPickerColor(cat.defaultColor, '#000000');
          const effectiveColor = toPickerColor(effective.color, catDefault);
          const bg = splitAlpha(effective.background);
          const isDefault = own === undefined;
          // Untouched here but set by the admin defaults: say so, otherwise the
          // author reads the shown numbers as this scenario's own.
          const inheritedOnly = isDefault && base !== undefined;
          const isSelected = selected === cat.id;

          return (
            <div
              key={cat.id}
              ref={(node) => {
                rowRefs.current[cat.id] = node;
              }}
              onClick={() => onSelect(cat.id)}
              className={`rounded-md border px-2.5 py-2 cursor-pointer ${
                isSelected
                  ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-200'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-1.5">
                <span
                  className={`flex-1 min-w-0 text-xs font-medium leading-snug ${
                    isSelected ? 'text-blue-800' : 'text-gray-700'
                  }`}
                >
                  {t(`editorTagquest:typography.categories.${cat.i18nKey}`)}
                  {inheritedOnly && (
                    <span className="ml-1 align-middle rounded bg-amber-100 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                      {t('editorTagquest:typography.inherited')}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCategory(cat.id, null);
                  }}
                  disabled={isDefault}
                  title={t('editorTagquest:typography.reset')}
                  aria-label={t('editorTagquest:typography.reset')}
                  className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:hover:text-gray-400"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Live sample at the resolved size, colour and plate. */}
              <span
                className="mt-1 inline-block max-w-full truncate rounded px-1.5 leading-tight"
                style={{
                  // The swatch shows the ROLE's reference size scaled by the
                  // author's percentage, mapped into a readable editor range
                  // (the HUD's real px sizes are stage-relative, not CSS px).
                  fontSize: `${Math.min(30, Math.max(9, cat.baseSize * 0.55 * factor))}px`,
                  fontFamily: fontFamily || 'Arial Black, Arial, sans-serif',
                  color: effectiveColor,
                  // The author's plate when they set one; otherwise a backdrop
                  // matching the template behind that role, so a white title
                  // stays readable here. The fallback is editor-only.
                  background: effective.background ?? (cat.onDark ? '#3b3546' : '#f1f2f5'),
                }}
              >
                {cat.sample}
              </span>

              <div className="mt-1.5 flex items-center gap-2">
                <label className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <span className="text-[11px] text-gray-500">
                    {t('editorTagquest:typography.size')}
                  </span>
                  <input
                    type="number"
                    min={TAGQUEST_SIZE_MIN}
                    max={TAGQUEST_SIZE_MAX}
                    step={5}
                    value={sizePercent}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw === '') {
                        setCategory(cat.id, { size: undefined });
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n)) return;
                      setCategory(cat.id, { size: n === 100 ? undefined : n });
                    }}
                    className="w-[62px] px-1.5 py-1 border border-gray-300 rounded-md text-sm text-right"
                  />
                  <span className="text-[11px] text-gray-400">%</span>
                </label>

                {/* Colour, opt-in so an untouched role keeps the layout's own. */}
                <label
                  className="ml-auto flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={colorActive}
                    onChange={(e) =>
                      setCategory(cat.id, {
                        color: e.target.checked ? effectiveColor : undefined,
                      })
                    }
                    className="rounded"
                    aria-label={t('editorTagquest:typography.customColor')}
                  />
                  <input
                    type="color"
                    value={effectiveColor}
                    disabled={!colorActive}
                    onChange={(e) => setCategory(cat.id, { color: e.target.value })}
                    className="h-7 w-10 border border-gray-300 rounded disabled:opacity-40"
                    aria-label={t('editorTagquest:typography.color')}
                  />
                </label>
              </div>

              {/* Plate behind the text. Off on every role by default - the
                  template artwork already carries the plaques. The centre quest
                  name is the one that floats free and usually wants one. */}
              <div className="mt-1.5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={bgActive}
                    onChange={(e) =>
                      setCategory(cat.id, {
                        background: e.target.checked ? joinAlpha(bg.hex, bg.alpha) : undefined,
                      })
                    }
                    className="rounded"
                    aria-label={t('editorTagquest:typography.background')}
                  />
                  <span className="text-[11px] text-gray-500">
                    {t('editorTagquest:typography.background')}
                  </span>
                  <input
                    type="color"
                    value={bg.hex}
                    disabled={!bgActive}
                    onChange={(e) =>
                      setCategory(cat.id, { background: joinAlpha(e.target.value, bg.alpha) })
                    }
                    className="h-7 w-10 border border-gray-300 rounded disabled:opacity-40"
                    aria-label={t('editorTagquest:typography.background')}
                  />
                </label>
                <label className="ml-auto flex items-center gap-1">
                  <span className="text-[11px] text-gray-500">
                    {t('editorTagquest:typography.backgroundOpacity')}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={bg.alpha}
                    disabled={!bgActive}
                    onChange={(e) => {
                      const n = Number(e.target.value.trim());
                      if (!Number.isFinite(n)) return;
                      setCategory(cat.id, { background: joinAlpha(bg.hex, n) });
                    }}
                    className="w-[58px] px-1.5 py-1 border border-gray-300 rounded-md text-sm text-right disabled:opacity-40"
                  />
                  <span className="text-[11px] text-gray-400">%</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-200 px-3 py-2">
        <p className="text-[11px] leading-snug text-gray-400">
          {footerHint ?? t('editorTagquest:typography.hint')}
        </p>
        {touched && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            {t('editorTagquest:typography.resetAll')}
          </button>
        )}
      </div>
    </aside>
  );
}
