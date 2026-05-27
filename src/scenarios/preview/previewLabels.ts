/**
 * Localized chrome labels for the tagquest preview.
 *
 * These four labels (plus a `pts` suffix) are baked into the parchment-frame
 * PNGs in French today (`MALUS`, `MALUS RETARD`, `SCORE`, `POINTS COMBO`).
 * The renderer overlays localized text on top so the chrome reads correctly
 * in non-French scenarios. When label-free PNGs replace the current ones,
 * the overlay is the only label visible — same code path either way.
 *
 * Defaults shipped: 6 European languages (fr/en/es/de/it/pt). Other
 * supported langs (nl/pl/ru/ja/zh/ar) fall through to `defaultLanguage`,
 * then to fr. Future admin UI can supply custom labels per-language without
 * any renderer change — `<TagquestPreviewRenderer>` accepts labels as a
 * prop.
 *
 * Plan: C:\Users\faure\.claude\plans\we-need-a-preview-refactored-pretzel.md
 *       (decisions Q1–Q4 from the second /grill-me round)
 */

import type { Lang, Localized } from '../i18n/types';

export interface PreviewLabels {
  score: string;
  malus: string;
  lateMalus: string;
  comboPoints: string;
  /**
   * Suffix appended to numeric values (`150 pts`, `-8 pts`). All 6 shipped
   * European entries use `pts`; future ja/zh/ar fills via admin UI may
   * supply local conventions (`点`, `分`, `نقطة`).
   */
  ptsSuffix: string;
  /**
   * Shown in the tagquest in-game timer once the game clock hits 0, counting
   * down to the next late-malus tick. The `{s}` placeholder is replaced with
   * the seconds remaining (e.g. `Next malus in 42 s`).
   */
  nextMalus: string;
}

export const DEFAULT_PREVIEW_LABELS: Partial<Record<Lang, PreviewLabels>> = {
  fr: {
    score: 'SCORE',
    malus: 'MALUS',
    lateMalus: 'MALUS RETARD',
    comboPoints: 'POINTS COMBO',
    ptsSuffix: 'pts',
    nextMalus: 'Prochain malus dans {s} s',
  },
  en: {
    score: 'SCORE',
    malus: 'PENALTY',
    lateMalus: 'LATE PENALTY',
    comboPoints: 'COMBO POINTS',
    ptsSuffix: 'pts',
    nextMalus: 'Next malus in {s} s',
  },
  es: {
    score: 'PUNTUACIÓN',
    malus: 'PENALIZACIÓN',
    lateMalus: 'PENALIZACIÓN TARDÍA',
    comboPoints: 'PUNTOS COMBO',
    ptsSuffix: 'pts',
    nextMalus: 'Próxima penalización en {s} s',
  },
  de: {
    score: 'PUNKTE',
    malus: 'STRAFE',
    lateMalus: 'VERSPÄTUNGSSTRAFE',
    comboPoints: 'KOMBO-PUNKTE',
    ptsSuffix: 'pts',
    nextMalus: 'Nächste Strafe in {s} s',
  },
  it: {
    score: 'PUNTEGGIO',
    malus: 'PENALITÀ',
    lateMalus: 'PENALITÀ IN RITARDO',
    comboPoints: 'PUNTI COMBO',
    ptsSuffix: 'pts',
    nextMalus: 'Prossima penalità tra {s} s',
  },
  pt: {
    score: 'PONTUAÇÃO',
    malus: 'PENALIDADE',
    lateMalus: 'PENALIDADE TARDIA',
    comboPoints: 'PONTOS COMBO',
    ptsSuffix: 'pts',
    nextMalus: 'Próxima penalidade em {s} s',
  },
};

/**
 * Resolve a labels object for the current language. Fallback chain:
 *   currentLanguage → defaultLanguage → fr (always present in defaults).
 *
 * Callers may supply a custom `source` to override (or substitute) the
 * static defaults — that's where future admin-configured labels plug in.
 */
export function getPreviewLabels(
  currentLanguage: Lang,
  defaultLanguage: Lang,
  source: Partial<Record<Lang, PreviewLabels>> = DEFAULT_PREVIEW_LABELS,
): PreviewLabels {
  return (
    source[currentLanguage] ??
    source[defaultLanguage] ??
    source.fr ??
    DEFAULT_PREVIEW_LABELS.fr!
  );
}

/**
 * Keys of the admin-managed global tagquest translations stored in
 * `default_config` row `tagquest_translations`. These keys are wired to
 * specific layout elements in the renderer (e.g. `score_label`) — adding a
 * new key here requires a corresponding layout element + renderer mapping.
 */
export type AdminLabelKey = 'score' | 'malus' | 'late_malus' | 'combo_points' | 'next_malus';

/**
 * Shape of the `tagquest_translations` admin row's `value` JSON. Each
 * top-level key holds a `Localized<string>` map (per-language overrides).
 * Missing languages fall back to `DEFAULT_PREVIEW_LABELS` via
 * `resolveAdminLabel`.
 */
export type PreviewLabelsMap = Record<AdminLabelKey, Localized<string>>;

const DEFAULT_KEY_MAP: Record<AdminLabelKey, keyof PreviewLabels> = {
  score: 'score',
  malus: 'malus',
  late_malus: 'lateMalus',
  combo_points: 'comboPoints',
  next_malus: 'nextMalus',
};

/**
 * Resolve a single admin label. Render order:
 *   adminLabels[key][lang] →
 *   adminLabels[key][defaultLang] →
 *   first available admin lang →
 *   DEFAULT_PREVIEW_LABELS[lang] →
 *   DEFAULT_PREVIEW_LABELS[defaultLang] →
 *   DEFAULT_PREVIEW_LABELS.fr →
 *   ''.
 *
 * `adminLabels` may be undefined (cache miss, fetch in flight, or admin has
 * never saved) — in that case we fall straight through to the built-in
 * defaults.
 */
export function resolveAdminLabel(
  adminLabels: PreviewLabelsMap | undefined,
  key: AdminLabelKey,
  lang: Lang,
  defaultLang: Lang,
): string {
  const adminEntry = adminLabels?.[key];
  if (adminEntry) {
    const override =
      adminEntry[lang] ??
      adminEntry[defaultLang] ??
      Object.values(adminEntry).find((v) => typeof v === 'string' && v.length > 0);
    if (override) return override;
  }
  const defaultProp = DEFAULT_KEY_MAP[key];
  return (
    DEFAULT_PREVIEW_LABELS[lang]?.[defaultProp] ??
    DEFAULT_PREVIEW_LABELS[defaultLang]?.[defaultProp] ??
    DEFAULT_PREVIEW_LABELS.fr![defaultProp]
  );
}
