/**
 * Tagquest HUD typography categories - the author-facing font size + colour
 * controls for the in-game HUD (retours #1 and #2).
 *
 * WHY CATEGORIES AND NOT PER-ELEMENT FIELDS
 * The HUD has 40+ text elements (6 quest rows × 3 cells, 3 combo columns × 3
 * cells, …) but only a handful of *roles*. Authors think in roles - "the combo
 * numbers are too small" - so the editor exposes one control per role, the same
 * way the Tracks layout editor exposes text categories. The controls live in
 * the Aperçu modal (`preview/TagquestTypographyPanel.tsx`): the role is picked
 * by clicking the text on the rendered HUD, so its abstract name never has to
 * be matched to a spot on screen by hand.
 *
 * WHY A PERCENTAGE AND NOT AN ABSOLUTE SIZE ("work in proportions")
 * Elements inside one category do NOT share a base size: a combo multiplicator
 * is authored at 25 and its points at 31; malus is 21.21 while late malus is
 * 20.21. Setting one absolute value per category would flatten those ratios and
 * break the artwork alignment. So a category carries a SCALE (percent, 100 =
 * as authored) that multiplies each element's own `fontSize` from
 * `defaultLayout.ts`, preserving the authored proportions. The layout's sizes
 * are themselves proportional (authored against a 1920-wide stage and scaled by
 * `stage.width / 1920`), so the result stays resolution-independent.
 *
 * ONE MIRROR must move in lockstep with this file:
 *   ../../../../../../taghunter_playground/src/scenarios/tagquest/typography.ts
 * The studio preview and the playground runtime BOTH resolve through these
 * rules; if they drift, the preview lies about the game.
 *
 * Stored in `game_meta.tagquest_typography`. Absent / empty object = every
 * category at its authored size and colour, which is what every existing
 * scenario has - so this is purely additive.
 */

/** The eleven author-facing roles. Ids are persisted - never rename one. */
export type TagquestTextCategoryId =
  | 'chrome_titles'
  | 'malus_data'
  | 'combo_titles'
  | 'combo_data'
  | 'quest_titles'
  | 'quest_data'
  | 'active_quest_name'
  | 'timer'
  | 'team_name'
  | 'score_title'
  | 'score_data';

/** Per-category overrides. Every field absent = use the layout's own values. */
export interface TagquestTextStyle {
  /** Font size as a percentage of the authored size. 100 = unchanged. */
  size?: number;
  /** Hex colour (`#rrggbb`). Absent = the layout element's own colour. */
  color?: string;
  /**
   * Colour painted behind the text's own box (`#rrggbb` or `#rrggbbaa`).
   * Absent = nothing drawn, which is what every role has by default - the
   * template artwork already provides the plaques. Added for the centre
   * active-quest name, which floats on the artwork with no plaque of its own,
   * but offered on every role: a custom template may need a plate anywhere.
   */
  background?: string;
}

export type TagquestTypography = Partial<Record<TagquestTextCategoryId, TagquestTextStyle>>;

export interface TagquestTextCategory {
  id: TagquestTextCategoryId;
  /** i18n key under `editorTagquest:typography.categories`. */
  i18nKey: string;
  /** True when this layout element id belongs to the category. */
  match: (elementId: string) => boolean;
  /** Text drawn in the section's preview swatch, at the resolved size/colour. */
  sample: string;
  /**
   * Reference size used by the editor swatch (the authored size of the
   * category's most representative element, from `defaultLayout.ts`).
   */
  baseSize: number;
  /**
   * The colour these elements have with no override - i.e. what
   * `defaultLayout.ts` gives them. Keep in step with that file: it is what the
   * colour picker opens on, so the author starts from the real current value.
   */
  defaultColor: string;
  /**
   * True when the role sits on a DARK plaque of the default template (the title
   * banners and the orange pills). Drives the swatch backdrop only, so white
   * text is legible in the editor - it changes nothing in the game.
   */
  onDark?: boolean;
}

/**
 * Order matters only for display - `match` predicates are mutually exclusive,
 * and `tagquestTextCategoryFor` asserts that by returning the FIRST match.
 */
const DARK_TEXT = '#000000ff';
const LIGHT_TEXT = '#ffffff';

export const TAGQUEST_TEXT_CATEGORIES: readonly TagquestTextCategory[] = [
  {
    id: 'timer',
    i18nKey: 'timer',
    match: (id) => id === 'timer',
    sample: '00:00:00',
    baseSize: 44,
    defaultColor: DARK_TEXT,
  },
  {
    id: 'team_name',
    i18nKey: 'teamName',
    match: (id) => id === 'team_name_text',
    sample: 'TEAM 1',
    baseSize: 37,
    defaultColor: DARK_TEXT,
  },
  {
    id: 'score_title',
    i18nKey: 'scoreTitle',
    match: (id) => id === 'score_label',
    sample: 'SCORE',
    baseSize: 12,
    defaultColor: LIGHT_TEXT,
    onDark: true,
  },
  {
    id: 'score_data',
    i18nKey: 'scoreData',
    match: (id) => id === 'score',
    sample: '1250',
    baseSize: 41,
    defaultColor: DARK_TEXT,
  },
  {
    // The "MALUS" / "LATE MALUS" / "COMBO POINTS" headings above their blocks.
    id: 'chrome_titles',
    i18nKey: 'chromeTitles',
    match: (id) =>
      id === 'malus_label' || id === 'late_malus_label' || id === 'combo_points_label',
    sample: 'MALUS',
    baseSize: 12,
    defaultColor: LIGHT_TEXT,
    onDark: true,
  },
  {
    // Both malus blocks share one control: the report asks for "malus data"
    // and there is no separate late-malus data category, so the two blocks
    // scale together (their 21.21 / 20.21 authored ratio is preserved).
    id: 'malus_data',
    i18nKey: 'malusData',
    match: (id) => /^(late_)?malus_(multiplicator|points)$/.test(id),
    sample: 'x3  -30',
    baseSize: 21.21,
    defaultColor: DARK_TEXT,
  },
  {
    id: 'combo_titles',
    i18nKey: 'comboTitles',
    match: (id) => /^combo_[642]_title$/.test(id),
    sample: 'COMBO 6',
    baseSize: 11,
    defaultColor: LIGHT_TEXT,
    onDark: true,
  },
  {
    id: 'combo_data',
    i18nKey: 'comboData',
    match: (id) => /^combo_[642]_(multiplicator|points)$/.test(id),
    sample: 'x2  120',
    baseSize: 25,
    defaultColor: DARK_TEXT,
  },
  {
    // Anchored so it never swallows `animation_quest_name`.
    id: 'quest_titles',
    i18nKey: 'questTitles',
    match: (id) => /^quest_\d+_name$/.test(id),
    sample: 'Quête 1',
    baseSize: 11,
    defaultColor: DARK_TEXT,
  },
  {
    id: 'quest_data',
    i18nKey: 'questData',
    match: (id) => /^quest_\d+_(multiplicator|points)$/.test(id),
    sample: 'x1  50',
    baseSize: 25,
    defaultColor: DARK_TEXT,
  },
  {
    // The large active-quest name under the central grid - its own control,
    // it is read from across the room while the strip names are not.
    id: 'active_quest_name',
    i18nKey: 'activeQuestName',
    match: (id) => id === 'animation_quest_name',
    sample: 'Quête 1',
    baseSize: 18,
    defaultColor: DARK_TEXT,
  },
];

/** The category a layout element belongs to, or null (images, template, …). */
export function tagquestTextCategoryFor(elementId: string): TagquestTextCategoryId | null {
  const id = (elementId || '').toLowerCase();
  for (const cat of TAGQUEST_TEXT_CATEGORIES) {
    if (cat.match(id)) return cat.id;
  }
  return null;
}

/** Percent → multiplier, clamped to a sane range. Bad input reads as 100 %. */
export function tagquestSizeFactor(size: number | undefined): number {
  if (size == null) return 1;
  const n = typeof size === 'number' ? size : Number(size);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(400, Math.max(25, n)) / 100;
}

/** Editor bounds for the percentage input (also enforced by the clamp above). */
export const TAGQUEST_SIZE_MIN = 25;
export const TAGQUEST_SIZE_MAX = 400;

/** Read `game_meta.tagquest_typography` defensively (it is authored JSON). */
export function readTagquestTypography(value: unknown): TagquestTypography {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: TagquestTypography = {};
  for (const cat of TAGQUEST_TEXT_CATEGORIES) {
    const raw = (value as Record<string, unknown>)[cat.id];
    if (!raw || typeof raw !== 'object') continue;
    const rec = raw as Record<string, unknown>;
    const style: TagquestTextStyle = {};
    if (typeof rec.size === 'number' || typeof rec.size === 'string') {
      const n = Number(rec.size);
      if (Number.isFinite(n) && n > 0) style.size = n;
    }
    if (typeof rec.color === 'string' && rec.color.trim()) style.color = rec.color.trim();
    if (typeof rec.background === 'string' && rec.background.trim()) {
      style.background = rec.background.trim();
    }
    if (style.size !== undefined || style.color !== undefined || style.background !== undefined) {
      out[cat.id] = style;
    }
  }
  return out;
}

/**
 * Resolve one layout text element's final size + colour.
 *
 * `baseFontSize` is the element's authored `fontSize` (still expressed against
 * the 1920-wide canonical stage - the caller applies the stage scaling after).
 * `baseColor` is the element's own colour, used when the category sets none.
 */
export function resolveTagquestTextStyle(
  elementId: string,
  typography: TagquestTypography | undefined,
  baseFontSize: number | undefined,
  baseColor: string | undefined,
): { fontSize: number | undefined; color: string | undefined; background: string | undefined } {
  const catId = tagquestTextCategoryFor(elementId);
  const style = catId && typography ? typography[catId] : undefined;
  const factor = tagquestSizeFactor(style?.size);
  return {
    fontSize: baseFontSize != null ? baseFontSize * factor : undefined,
    color: style?.color || baseColor,
    background: style?.background || undefined,
  };
}

/**
 * Lay a scenario's typography over the studio-wide defaults, FIELD BY FIELD.
 *
 * The defaults are authored once on the admin "Default layouts" page and stored
 * in the `default_config` row `default_typography_tagquest`; a scenario's own
 * `game_meta.tagquest_typography` overrides them. Merging per FIELD rather than
 * per role matters: a default colour on `active_quest_name` must survive a
 * scenario that only changes that role's size.
 *
 * Feed the result to `resolveTagquestTextStyle` - the studio preview and the
 * playground runtime both do exactly that, so neither can drift.
 */
export function mergeTagquestTypography(
  defaults: TagquestTypography | undefined,
  scenario: TagquestTypography | undefined,
): TagquestTypography {
  if (!defaults) return scenario ?? {};
  if (!scenario) return defaults;
  const out: TagquestTypography = { ...defaults };
  for (const [id, style] of Object.entries(scenario) as [
    TagquestTextCategoryId,
    TagquestTextStyle,
  ][]) {
    out[id] = { ...(out[id] ?? {}), ...style };
  }
  return out;
}
