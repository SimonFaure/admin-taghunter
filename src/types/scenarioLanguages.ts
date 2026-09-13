/**
 * The languages a scenario is authored in.
 *
 * Source of truth is `data.available_languages` (the list the editor's language
 * bar maintains); `data.default_language` is folded in so a single-language
 * scenario still reports one code. Codes come back lowercase, default language
 * first, then alphabetical - stable enough to render as chips on a card.
 *
 * Kept separate from `i18n/languages.ts`, which describes the languages the
 * *chrome* can run in; a scenario can be authored in languages the UI doesn't
 * ship (project_app_i18n_translator_workflow).
 */

const LANG_CODE = /^[a-z]{2}$/;

function toCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toLowerCase().split(/[-_]/)[0];
  return LANG_CODE.test(code) ? code : null;
}

/**
 * Resolve a scenario's language list from its `available_languages` array plus
 * its `default_language`. Either may be missing; an empty result means the
 * scenario carries no language metadata at all (legacy import) and callers
 * should render nothing rather than guess.
 */
export function resolveScenarioLanguages(available: unknown, defaultLang?: unknown): string[] {
  const fallback = toCode(defaultLang);
  const rest = (Array.isArray(available) ? available : [])
    .map(toCode)
    .filter((c): c is string => c !== null && c !== fallback)
    .sort((a, b) => a.localeCompare(b));
  const all = fallback ? [fallback, ...rest] : rest;
  return Array.from(new Set(all));
}

/**
 * Same, but from a scenario's raw `data` column (JSON string or parsed object),
 * tolerating the flat and `data.data.…` wrapped envelopes.
 */
export function scenarioLanguagesFromData(dataSource: unknown): string[] {
  if (!dataSource) return [];
  try {
    const obj = typeof dataSource === 'string' ? JSON.parse(dataSource) : dataSource;
    const root = (obj?.available_languages || obj?.default_language ? obj : obj?.data) ?? obj;
    return resolveScenarioLanguages(root?.available_languages, root?.default_language);
  } catch {
    return [];
  }
}

/** Display form for a language chip - the uppercase ISO code ("fr" → "FR"). */
export function formatLangCode(code: string): string {
  return code.toUpperCase();
}
