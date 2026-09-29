/**
 * Univers (theme) tags for scenarios, stored as `game_meta.univers: string[]`.
 *
 * Free-text folksonomy tags with NO managed vocabulary. The editor offers
 * per-client autocomplete built from tags already used across the client's
 * scenarios, but any new tag can be typed. Examples from the catalog:
 * Halloween, Magie, Pâques, Western, Pirates…
 *
 * TRANSLATION MODEL - the tag itself is the canonical identity and stays a
 * plain string; only its LABEL is translated, in a sibling map
 * `game_meta.univers_i18n: { [tag]: Localized<string> }`.
 *
 * This is deliberate. Making `univers` an array of `Localized` maps would
 * silently empty it in five places that guard on the element being a string
 * (`scenarios.php` + `client_scenarios.php` catalog decode,
 * `scenarios_audience_difficulty_backfill.php`, the playground's GameList
 * parser, and `normalizeUnivers` below - which `saveOrchestrator` runs on every
 * save). It would also break all three filter-chip implementations, which key a
 * `Set<string>` on the lowercased DISPLAY text: after a language switch a
 * selected chip would stop matching, and two languages of one concept would
 * dedupe into two chips.
 *
 * So: MATCH on the canonical tag, DISPLAY via `getUniversLabel`.
 */

import type { Lang } from '../scenarios/i18n/types';
import { getLocalized } from '../scenarios/i18n/getLocalized';

/** The `game_meta` key holding per-tag localized labels. */
export const UNIVERS_I18N_KEY = 'univers_i18n';

/** `{ [canonicalTag]: { en: 'Space', es: 'Espacio' } }` */
export type UniversI18n = Record<string, Partial<Record<Lang, string>>>;

/**
 * Display label for a univers tag: the translation for `lang` when one exists,
 * otherwise the canonical tag itself. Never use the result as a match key.
 */
export function getUniversLabel(
  tag: string,
  universI18n: unknown,
  lang: Lang,
  defaultLang: Lang,
): string {
  if (typeof universI18n !== 'object' || universI18n === null) return tag;
  const entry = (universI18n as Record<string, unknown>)[tag];
  if (typeof entry !== 'object' || entry === null) return tag;
  return getLocalized(entry as Partial<Record<Lang, string>>, lang, defaultLang) || tag;
}

/**
 * Normalise a stored univers value to a clean string[]: trims, drops empties,
 * and de-duplicates case-insensitively while preserving the first-seen casing
 * and order. Accepts a single comma-separated string too (defensive).
 */
export function normalizeUnivers(raw: unknown): string[] {
  let items: string[];
  if (Array.isArray(raw)) {
    items = raw.filter((v): v is string => typeof v === 'string');
  } else if (typeof raw === 'string') {
    items = raw.split(',');
  } else {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
