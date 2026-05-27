/**
 * Canonical audience taxonomy for scenarios, stored as `game_meta.game_public`.
 *
 * Three buckets — mini kids, kids, and teens/adults. The teens/adults bucket
 * keeps the legacy `ado_adultes` slug so it round-trips with the storefront
 * pattern bundles and legacy ZIP imports (see ZipImportDocs: the documented
 * game_public values are `kids, mini_kids, ado_adultes`).
 *
 * This is the single source of truth shared by the editor's audience picker
 * (AdminSection) and the scenarios list filter pills / badges (ScenariosView).
 */
export const AUDIENCE_OPTIONS = [
  { value: 'mini_kids', label: 'Mini Kids' },
  { value: 'kids', label: 'Kids' },
  { value: 'ado_adultes', label: 'Teens/Adults' },
] as const;

export type AudienceValue = (typeof AUDIENCE_OPTIONS)[number]['value'];

/**
 * Collapses older / mislabelled values onto the canonical trio so existing
 * scenarios still resolve to a bucket — e.g. the legacy tracks default
 * 'adults' (and the short-lived 'teens') both map to 'ado_adultes'.
 */
export function normalizeAudience(raw: string): string {
  const v = (raw || '').toLowerCase();
  if (v === 'adults' || v === 'adult' || v === 'adultes' || v === 'teens' || v === 'ado') {
    return 'ado_adultes';
  }
  return v;
}

/**
 * Human label for an audience value, normalising first so legacy values get the
 * canonical label, and falling back to title-case for anything off-list.
 */
export function getAudienceLabel(raw: string): string {
  if (!raw) return '';
  const normalized = normalizeAudience(raw);
  const match = AUDIENCE_OPTIONS.find((o) => o.value === normalized);
  if (match) return match.label;
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
