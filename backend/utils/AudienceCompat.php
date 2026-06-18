<?php
/**
 * Audience/difficulty compat helpers — the PHP mirror of
 * studio-taghunter/src/types/audience.ts + difficulty.ts.
 *
 * Used by playground.php (derive-on-read passthrough) and the one-time
 * scenarios backfill so both produce the same canonical metadata shape.
 */

class AudienceCompat
{
    /** Canonical age bands, young → old. */
    public const BANDS = ['age_4_5', 'age_6_7', 'age_8_10', 'age_11_12', 'age_13_plus', 'age_adultes'];

    /** Band → name-pool tier (mini_kids / kids / ado_adultes). */
    private const BAND_TIER = [
        'age_4_5' => 'mini_kids',
        'age_6_7' => 'mini_kids',
        'age_8_10' => 'kids',
        'age_11_12' => 'kids',
        'age_13_plus' => 'ado_adultes',
        'age_adultes' => 'ado_adultes',
    ];

    /** Collapse legacy/mislabelled tier slugs onto the canonical trio. */
    public static function normalizeTier(?string $raw): string
    {
        $v = strtolower(trim((string) $raw));
        if (in_array($v, ['adults', 'adult', 'adultes', 'teens', 'ado'], true)) {
            return 'ado_adultes';
        }
        return $v;
    }

    /** Derive bands from a legacy name-pool tier — the read-side fallback + backfill. */
    public static function bandsFromTier(?string $rawTier): array
    {
        switch (self::normalizeTier($rawTier)) {
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

    /** Keep only recognised band slugs, de-duped and in canonical order. */
    public static function normalizeBands($raw): array
    {
        if (!is_array($raw)) {
            return [];
        }
        $present = [];
        foreach ($raw as $v) {
            if (is_string($v) && in_array($v, self::BANDS, true)) {
                $present[$v] = true;
            }
        }
        $out = [];
        foreach (self::BANDS as $band) {
            if (isset($present[$band])) {
                $out[] = $band;
            }
        }
        return $out;
    }

    /** Name-pool tier — oldest band wins; empty → ado_adultes. */
    public static function bandsToTier(array $bands): string
    {
        $ordered = self::normalizeBands($bands);
        if (empty($ordered)) {
            return 'ado_adultes';
        }
        $oldest = end($ordered);
        return self::BAND_TIER[$oldest] ?? 'ado_adultes';
    }

    /** Coerce any difficulty value (int, numeric string, legacy enum) to int 1–5. */
    public static function coerceDifficulty($raw): int
    {
        if (is_int($raw) || is_float($raw)) {
            return self::clamp((int) round($raw));
        }
        $s = strtolower(trim((string) $raw));
        if ($s === '') {
            return 3;
        }
        if (preg_match('/^-?\d+(\.\d+)?$/', $s)) {
            return self::clamp((int) round((float) $s));
        }
        if (in_array($s, ['easy', 'simple', 'facile'], true)) {
            return 1;
        }
        if (in_array($s, ['medium', 'normal', 'moyen'], true)) {
            return 3;
        }
        if (in_array($s, ['hard', 'difficult', 'expert', 'difficile'], true)) {
            return 5;
        }
        return 3;
    }

    private static function clamp(int $n): int
    {
        if ($n < 1) {
            return 1;
        }
        if ($n > 5) {
            return 5;
        }
        return $n;
    }
}
