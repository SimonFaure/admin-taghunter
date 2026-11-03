<?php
/**
 * Licensee Mystery scoring defaults (clients.mystery_scoring, add_client_mystery_scoring.sql).
 *
 * Shape (every level optional; a missing key = "not set", falls through):
 *   {
 *     "by_age":      { "<age band>": { <field>: int, ... } },
 *     "by_scenario": { "<scenario uniqid>": { <field>: int, ... } }
 *   }
 * Fields mirror the scenario's own keys so the playground can patch them 1:1:
 *   malus_both_answers_biped, malus_no_answer (game_meta, signed, added once per enigma)
 *   good_answer_points, wrong_answer_points (every game_enigmas[] row; wrong is signed <= 0)
 *
 * The playground resolves per field: by_scenario[uniqid] > by_age[youngest band] > scenario.
 */

require_once __DIR__ . '/AudienceCompat.php';

class MysteryScoring
{
    public const FIELDS = [
        'malus_both_answers_biped',
        'malus_no_answer',
        'good_answer_points',
        'wrong_answer_points',
    ];

    /** One field set: ints only, blanks dropped, wrong points folded to <= 0. */
    public static function normalizeSet($raw): array
    {
        if (!is_array($raw)) return [];
        $out = [];
        foreach (self::FIELDS as $f) {
            if (!array_key_exists($f, $raw)) continue;
            $v = $raw[$f];
            if ($v === null || (is_string($v) && trim($v) === '')) continue;
            if (!is_numeric($v)) continue;
            $n = (int) round((float) $v);
            $n = max(-10000, min(10000, $n));
            // Same convention as the scenario editor: a wrong answer is a penalty.
            if ($f === 'wrong_answer_points') $n = -abs($n);
            $out[$f] = $n;
        }
        return $out;
    }

    /**
     * Whole blob. `$allowedUniqids` (optional) drops scenario rows the licensee
     * cannot play. Returns arrays; use toJson() to keep empty maps as {}.
     */
    public static function normalize($raw, ?array $allowedUniqids = null): array
    {
        $byAge = [];
        $byScenario = [];
        if (is_array($raw)) {
            foreach ((is_array($raw['by_age'] ?? null) ? $raw['by_age'] : []) as $band => $set) {
                if (!in_array($band, AudienceCompat::BANDS, true)) continue;
                $n = self::normalizeSet($set);
                if ($n) $byAge[$band] = $n;
            }
            foreach ((is_array($raw['by_scenario'] ?? null) ? $raw['by_scenario'] : []) as $uniqid => $set) {
                $uniqid = (string) $uniqid;
                if (!preg_match('/^[A-Za-z0-9_.-]{1,64}$/', $uniqid)) continue;
                if ($allowedUniqids !== null && !in_array($uniqid, $allowedUniqids, true)) continue;
                $n = self::normalizeSet($set);
                if ($n) $byScenario[$uniqid] = $n;
            }
        }
        return ['by_age' => $byAge, 'by_scenario' => $byScenario];
    }

    /** JSON-ready copy: empty maps / sets serialize as {} (never []). */
    public static function forJson(array $norm): array
    {
        $wrap = function (array $map) {
            if (!$map) return new stdClass();
            $o = [];
            foreach ($map as $k => $set) $o[$k] = (object) $set;
            return (object) $o;
        };
        return [
            'by_age' => $wrap($norm['by_age'] ?? []),
            'by_scenario' => $wrap($norm['by_scenario'] ?? []),
        ];
    }

    /** Stored value for a client, normalized. Null when the column is not migrated yet. */
    public static function load($db, $clientId): ?array
    {
        try {
            $row = $db->fetch('SELECT mystery_scoring FROM clients WHERE id = ?', [$clientId]);
        } catch (Exception $e) {
            return null; // column missing (migration not run)
        }
        if (!$row) return null;
        $raw = $row['mystery_scoring'] ? json_decode($row['mystery_scoring'], true) : [];
        return self::normalize($raw);
    }
}
