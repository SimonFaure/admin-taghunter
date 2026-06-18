/**
 * Univers (theme) tags for scenarios, stored as `game_meta.univers: string[]`.
 *
 * Free-text, plain-string tags (NOT localized, NO managed vocabulary) that
 * behave like folksonomy tags. The editor offers per-client autocomplete built
 * from tags already used across the client's scenarios, but any new tag can be
 * typed. Examples from the catalog: Halloween, Magie, Pâques, Western, Pirates…
 */

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
