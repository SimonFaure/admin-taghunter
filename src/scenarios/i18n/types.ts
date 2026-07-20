/**
 * i18n primitives for scenario authoring.
 *
 * Stage 3 - D5 (per-field Localized<T> migration). Slice 3A: foundation,
 * zero behavioral change. Nothing imports these types yet.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

/**
 * The 12 languages studio supports today, matching the LanguageSelector's
 * `LANGUAGE_NAMES` map (creator-ported/components/LanguageSelector.tsx).
 */
export const SUPPORTED_LANGS = [
  'en',
  'fr',
  'es',
  'de',
  'it',
  'pt',
  'nl',
  'pl',
  'ru',
  'ja',
  'zh',
  'ar',
] as const;

export type Lang = (typeof SUPPORTED_LANGS)[number];

/**
 * Per-field localized value. After Stage 3, every translatable field on
 * `scenarios.data.game_meta` is a `Localized<string>` instead of a plain
 * string + sibling `data.translations[lang]` mirror.
 *
 * - Map keyed by language code; values are the localized content.
 * - All keys optional. The runtime `getLocalized` helper handles fallback.
 * - Zod enforces "at least default_language has a value" for required fields
 *   at the schema layer; the TS type stays permissive.
 */
export type Localized<T> = Partial<Record<Lang, T>>;

/**
 * Type guard: returns true if `value` is a Localized map (object with
 * Lang-shaped keys), false if it's a plain string (legacy / source-only).
 */
export function isLocalized<T>(value: unknown): value is Localized<T> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  // Heuristic: at least one key is a known Lang code. Tolerates extra keys.
  return Object.keys(value as object).some((k) => (SUPPORTED_LANGS as readonly string[]).includes(k));
}
