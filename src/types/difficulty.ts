/**
 * Canonical difficulty scale for scenarios, stored as `game_meta.difficulty`.
 *
 * Difficulty is an **integer 1–5** rendered as stars (the "Scenarios TH" catalog
 * model). It replaces the legacy easy/medium/hard enum; legacy string values are
 * coerced on read (`easy→1`, `medium→3`, `hard→5`) so older scenarios and any
 * un-backfilled rows still resolve to a star level.
 *
 * Single source of truth shared by the editor's star picker (AdminSection), the
 * scenarios list / catalog (ScenariosView, ScenarioCatalogView) and the
 * playground card (GameList).
 */
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 5;

/** The five star levels, low→high, for picker/iteration. */
export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;

/** Default star level when difficulty is unset/unparseable. */
export const DEFAULT_DIFFICULTY = 3;

/**
 * Coerce any stored difficulty value (new int, numeric string, or legacy enum
 * slug) to an integer 1–5. Unset / unrecognised → DEFAULT_DIFFICULTY (3).
 *
 * Legacy mapping: easy/simple/facile → 1, medium/normal/moyen → 3,
 * hard/difficult/expert/difficile → 5.
 */
export function coerceDifficulty(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clampDifficulty(Math.round(raw));
  }
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === '') return DEFAULT_DIFFICULTY;
  // Numeric string ("1".."5", or out-of-range to clamp).
  if (/^-?\d+(\.\d+)?$/.test(s)) return clampDifficulty(Math.round(Number(s)));
  // Legacy enum slugs.
  if (s === 'easy' || s === 'simple' || s === 'facile') return 1;
  if (s === 'medium' || s === 'normal' || s === 'moyen') return 3;
  if (s === 'hard' || s === 'difficult' || s === 'expert' || s === 'difficile') return 5;
  return DEFAULT_DIFFICULTY;
}

function clampDifficulty(n: number): number {
  if (n < MIN_DIFFICULTY) return MIN_DIFFICULTY;
  if (n > MAX_DIFFICULTY) return MAX_DIFFICULTY;
  return n;
}

/**
 * A text star rendering of a difficulty value — e.g. 3 → "★★★☆☆". Works in any
 * context (list cells, badges, client views) without a dedicated component.
 */
export function formatDifficultyStars(raw: unknown): string {
  const level = coerceDifficulty(raw);
  return '★'.repeat(level) + '☆'.repeat(MAX_DIFFICULTY - level);
}

/**
 * Human label for a difficulty value. Kept for the existing call sites
 * (client ScenarioDetailView / MyScenariosView) that pass the value through a
 * label helper; now returns the star string. The optional `t` is accepted for
 * signature compatibility but unused (stars are language-neutral).
 */
export function getDifficultyLabel(raw: unknown, _t?: (key: string) => string): string {
  if (raw === null || raw === undefined || raw === '') return '';
  return formatDifficultyStars(raw);
}

/**
 * Tailwind classes for a difficulty badge — green (1–2) / amber (3) / red (4–5),
 * mirroring the playground's colour coding.
 */
export function getDifficultyBadgeClass(raw: unknown): string {
  const level = coerceDifficulty(raw);
  if (level <= 2) return 'text-green-700 bg-green-50';
  if (level === 3) return 'text-amber-700 bg-amber-50';
  return 'text-red-700 bg-red-50';
}
