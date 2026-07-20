/**
 * Canonical audience taxonomy for scenarios.
 *
 * Two layers:
 *
 * 1. **Age bands** (`game_meta.audience_bands: string[]`) - the new source of
 *    truth. Six fine-grained bands a scenario can target several of, matching the
 *    "Scenarios TH" catalog columns (4-5 / 6-7 / 8-10 / 11-12 / +13 / Adultes).
 *
 * 2. **Name-pool tier** (`game_meta.game_public`) - the legacy trio
 *    (mini_kids / kids / ado_adultes). Kept as a DERIVED shadow written from the
 *    bands on save (`bandsToNamePoolTier`, oldest band wins). The team-name-pool
 *    machinery (studio editor, cloud `add_team`, LAN Rust draw), legacy ZIP
 *    imports and storefront patterns all keep reading `game_public` unchanged.
 *
 * The Enfants / Ados-Adultes split shown in the catalog is a DERIVED display
 * label (`bandsToCatalogGroup`), never stored.
 */

/* -------------------------------------------------------------------------- */
/* Name-pool tier - the legacy trio (kept)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Canonical name-pool tier trio. Still the keying for team-name pools
 * (TeamNamePoolModal) and the value written to `game_meta.game_public`.
 */
export const AUDIENCE_OPTIONS = [
  { value: 'mini_kids', label: 'Mini Kids' },
  { value: 'kids', label: 'Kids' },
  { value: 'ado_adultes', label: 'Teens/Adults' },
] as const;

export type AudienceValue = (typeof AUDIENCE_OPTIONS)[number]['value'];

/**
 * Collapses older / mislabelled tier values onto the canonical trio so existing
 * scenarios still resolve to a bucket - e.g. legacy 'adults' / 'teens' → 'ado_adultes'.
 */
export function normalizeAudience(raw: string): string {
  const v = (raw || '').toLowerCase();
  if (v === 'adults' || v === 'adult' || v === 'adultes' || v === 'teens' || v === 'ado') {
    return 'ado_adultes';
  }
  return v;
}

/**
 * Human label for a name-pool tier value, normalising first. Pass a `t`
 * (i18next TFunction) to localize via the `taxonomy:audience.*` keys.
 */
export function getAudienceLabel(raw: string, t?: (key: string) => string): string {
  if (!raw) return '';
  const normalized = normalizeAudience(raw);
  const match = AUDIENCE_OPTIONS.find((o) => o.value === normalized);
  if (match) return t ? t(`taxonomy:audience.${normalized}`) : match.label;
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/* -------------------------------------------------------------------------- */
/* Age bands - the new source of truth                                        */
/* -------------------------------------------------------------------------- */

export type AudienceBand =
  | 'age_4_5'
  | 'age_6_7'
  | 'age_8_10'
  | 'age_11_12'
  | 'age_13_plus'
  | 'age_adultes';

export type CatalogGroup = 'enfants' | 'ados_adultes';

/**
 * The six age bands, youngest → oldest, each carrying its name-pool tier and its
 * catalog group. `label` is the English fallback; localized labels resolve via
 * the `taxonomy:band.*` keys when a `t` is passed to `getBandLabel`.
 */
export const AUDIENCE_BANDS = [
  { value: 'age_4_5', label: '4-5', tier: 'mini_kids', group: 'enfants' },
  { value: 'age_6_7', label: '6-7', tier: 'mini_kids', group: 'enfants' },
  { value: 'age_8_10', label: '8-10', tier: 'kids', group: 'enfants' },
  { value: 'age_11_12', label: '11-12', tier: 'kids', group: 'enfants' },
  { value: 'age_13_plus', label: '+13', tier: 'ado_adultes', group: 'ados_adultes' },
  { value: 'age_adultes', label: 'Adultes', tier: 'ado_adultes', group: 'ados_adultes' },
] as const satisfies ReadonlyArray<{
  value: AudienceBand;
  label: string;
  tier: AudienceValue;
  group: CatalogGroup;
}>;

const BAND_VALUES = new Set<string>(AUDIENCE_BANDS.map((b) => b.value));

/** Keep only recognised band slugs, de-duplicated and in canonical (young→old) order. */
export function normalizeBands(raw: unknown): AudienceBand[] {
  if (!Array.isArray(raw)) return [];
  const present = new Set(raw.filter((v): v is string => typeof v === 'string' && BAND_VALUES.has(v)));
  return AUDIENCE_BANDS.filter((b) => present.has(b.value)).map((b) => b.value);
}

/** Localized label for a single band (English fallback without `t`). */
export function getBandLabel(band: AudienceBand, t?: (key: string) => string): string {
  const match = AUDIENCE_BANDS.find((b) => b.value === band);
  if (!match) return band;
  return t ? t(`taxonomy:band.${band}`) : match.label;
}

/** The name-pool tier a single band belongs to. */
export function bandTier(band: AudienceBand): AudienceValue {
  return AUDIENCE_BANDS.find((b) => b.value === band)?.tier ?? 'ado_adultes';
}

/**
 * The set of name-pool tiers any of the given bands fall into. Used by the
 * playground's three coarse audience pills (a scenario shows under every tier
 * any of its bands belong to). Returned in trio order.
 */
export function bandsToTiers(bands: AudienceBand[]): AudienceValue[] {
  const tiers = new Set(bands.map(bandTier));
  return AUDIENCE_OPTIONS.map((o) => o.value).filter((v) => tiers.has(v));
}

/**
 * The single name-pool tier to draw team names from - **oldest band wins**
 * (mixed groups skew to older, safer names). Empty bands → 'ado_adultes'.
 * This is the value written to the `game_public` shadow on save.
 */
export function bandsToNamePoolTier(bands: AudienceBand[]): AudienceValue {
  const ordered = normalizeBands(bands);
  if (ordered.length === 0) return 'ado_adultes';
  // AUDIENCE_BANDS is young→old, so the last present band is the oldest.
  const oldest = ordered[ordered.length - 1];
  return bandTier(oldest);
}

/**
 * The catalog group (Enfants vs Ados/Adultes): a scenario is "enfants" if it
 * targets any child band (≤ 11-12), otherwise "ados_adultes". Empty → 'ados_adultes'.
 */
export function bandsToCatalogGroup(bands: AudienceBand[]): CatalogGroup {
  const ordered = normalizeBands(bands);
  if (ordered.length === 0) return 'ados_adultes';
  const hasChildBand = ordered.some((b) => {
    const g = AUDIENCE_BANDS.find((x) => x.value === b)?.group;
    return g === 'enfants';
  });
  return hasChildBand ? 'enfants' : 'ados_adultes';
}

/**
 * Derive bands from a legacy name-pool tier - the read-side compat fallback for
 * scenarios that still only have `game_public` and no `audience_bands`
 * (un-backfilled rows, legacy ZIP imports). Mirrors the one-time backfill.
 */
export function deriveBandsFromTier(rawTier: string): AudienceBand[] {
  switch (normalizeAudience(rawTier)) {
    case 'mini_kids':
      return ['age_4_5', 'age_6_7'];
    case 'kids':
      return ['age_8_10', 'age_11_12'];
    case 'ado_adultes':
      return ['age_13_plus', 'age_adultes'];
    default:
      return [];
  }
}

/**
 * Resolve a scenario's bands with the read-side fallback: use stored
 * `audience_bands` when present, else synthesize from the `game_public` tier.
 */
export function resolveBands(audienceBands: unknown, gamePublic: unknown): AudienceBand[] {
  const stored = normalizeBands(audienceBands);
  if (stored.length > 0) return stored;
  return deriveBandsFromTier(typeof gamePublic === 'string' ? gamePublic : '');
}
