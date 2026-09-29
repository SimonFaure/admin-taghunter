<?php

/**
 * Structural read/write of a `Localized<string>` inside `game_meta` by path.
 *
 * This is deliberately NOT a copy of the TS translatable-path registry
 * (src/scenarios/i18n/translatablePaths.ts). It knows only the SHAPE of a path
 * and two flat whitelists, so a new translatable field added in TS needs a
 * one-line addition to LEAF_FIELDS here and nothing else. Keeping a second copy
 * of the full registry in PHP is exactly the mirror-drift that already bit this
 * codebase (see LocalizedCompat's header).
 *
 * PATH GRAMMAR (mirrors src/scenarios/i18n/paths.ts):
 *   <scalar>                        "title" | "text_if_error"
 *   <collection>/<segment>/<field>  "levels/1/name" | "enigmas/1/text"
 *   univers/<ordinal>               "univers/1"  (1-based; writes univers_i18n)
 *
 * Segment resolution: `levels` is a keyed record (segment = the record key);
 * array collections resolve by `id` when the item has one, else by a 1-BASED
 * ordinal.
 *
 * Plan: C:\Users\faure\.claude\plans\here-is-a-translation-transient-boot.md
 */

require_once __DIR__ . '/LocalizedCompat.php';

class LocalizedPath
{
    /**
     * Every leaf property name a translatable path may end in. Mirrors
     * TRANSLATABLE_LEAF_FIELDS in src/scenarios/i18n/translatablePaths.ts.
     */
    private const LEAF_FIELDS = [
        'title', 'description', 'story',
        'text_player_starts', 'text_card_not_empty', 'text_team_starts_card_not_empty',
        'text_card_not_corresponding', 'text_team_ended', 'text_all_team_ended',
        'text_scenario_ended', 'text_team_reached_new_level', 'text_card_empty',
        'text_late_malus', 'text_team_enters_top_ranking', 'text_team_enters_podium',
        'text_team_first_place', 'text_following_top_podium', 'text_if_error',
        'text_is_card_empty', 'text_team_cheating',
        'event_text_conquest', 'event_text_attack', 'event_text_neutralized',
        'event_text_purge', 'ranking_title',
        'purge_text_already_used', 'purge_text_own_territory', 'purge_text_no_target',
        'name', 'text', 'spot_question', 'name_overscore_step',
    ];

    /** Collections stored as a keyed record: the segment is the record key. */
    private const RECORD_COLLECTIONS = ['levels'];

    /** Collections stored as a list: segment is an `id` or a 1-based ordinal. */
    private const ARRAY_COLLECTIONS = [
        'enigmas', 'quests', 'overscores', 'checkpoints',
        'clans', 'territories', 'text_elements',
    ];

    /** The `game_meta` key holding per-tag localized univers labels. */
    public const UNIVERS_I18N_KEY = 'univers_i18n';

    /** A path segment must be a plain identifier - no traversal, no injection. */
    private static function validSegment(string $s): bool
    {
        return $s !== '' && preg_match('/^[A-Za-z0-9_\-]+$/', $s) === 1;
    }

    /**
     * Canonical univers tags (plain strings) in authored order.
     * The tag is the identity every catalog filter matches on; only its LABEL
     * is translated. See src/types/univers.ts for why.
     */
    private static function universTags(array $gameMeta): array
    {
        if (!isset($gameMeta['univers']) || !is_array($gameMeta['univers'])) return [];
        $out = [];
        foreach ($gameMeta['univers'] as $tag) {
            if (is_string($tag) && trim($tag) !== '') $out[] = $tag;
        }
        return $out;
    }

    /** Resolve an array index from an `id` or a 1-based ordinal. Returns -1 if absent. */
    private static function indexOfSegment(array $list, string $segment): int
    {
        foreach ($list as $i => $item) {
            if (is_array($item) && isset($item['id']) && $item['id'] === $segment) {
                return (int)$i;
            }
        }
        if (ctype_digit($segment)) {
            $ordinal = (int)$segment;
            if ($ordinal >= 1 && $ordinal <= count($list)) return $ordinal - 1;
        }
        return -1;
    }

    /**
     * Set one language of the Localized value at `$path`.
     *
     * Returns TRUE when applied, FALSE when the path is malformed, not
     * whitelisted, or does not resolve. A path pointing at a deleted enigma is
     * a FALSE (reported to the caller as "skipped") - never a silent create,
     * which would resurrect a ghost item in the author's scenario.
     */
    public static function apply(array &$gameMeta, string $path, string $lang, string $value, string $defaultLang): bool
    {
        $segments = explode('/', $path);
        foreach ($segments as $s) {
            if (!self::validSegment($s)) return false;
        }

        // univers/<ordinal> -> the label map for that canonical tag.
        if (count($segments) === 2 && $segments[0] === 'univers') {
            $tags = self::universTags($gameMeta);
            if (!ctype_digit($segments[1])) return false;
            $ordinal = (int)$segments[1];
            if ($ordinal < 1 || $ordinal > count($tags)) return false;
            $tag = $tags[$ordinal - 1];

            $labels = isset($gameMeta[self::UNIVERS_I18N_KEY]) && is_array($gameMeta[self::UNIVERS_I18N_KEY])
                ? $gameMeta[self::UNIVERS_I18N_KEY]
                : [];
            $entry = isset($labels[$tag]) && is_array($labels[$tag]) ? $labels[$tag] : [];
            $entry[$lang] = $value;
            $labels[$tag] = $entry;
            $gameMeta[self::UNIVERS_I18N_KEY] = $labels;
            return true;
        }

        if (count($segments) === 1) {
            $key = $segments[0];
            if (!in_array($key, self::LEAF_FIELDS, true)) return false;
            $gameMeta[$key] = self::liftAndSet($gameMeta[$key] ?? null, $lang, $value, $defaultLang);
            return true;
        }

        if (count($segments) !== 3) return false;
        [$collection, $segment, $field] = $segments;
        if (!in_array($field, self::LEAF_FIELDS, true)) return false;

        $isRecord = in_array($collection, self::RECORD_COLLECTIONS, true);
        $isArray  = in_array($collection, self::ARRAY_COLLECTIONS, true);
        if (!$isRecord && !$isArray) return false;
        if (!isset($gameMeta[$collection]) || !is_array($gameMeta[$collection])) return false;

        if ($isRecord) {
            if (!isset($gameMeta[$collection][$segment]) || !is_array($gameMeta[$collection][$segment])) {
                return false;
            }
            $gameMeta[$collection][$segment][$field] = self::liftAndSet(
                $gameMeta[$collection][$segment][$field] ?? null, $lang, $value, $defaultLang
            );
            return true;
        }

        $i = self::indexOfSegment($gameMeta[$collection], $segment);
        if ($i < 0 || !is_array($gameMeta[$collection][$i])) return false;
        $gameMeta[$collection][$i][$field] = self::liftAndSet(
            $gameMeta[$collection][$i][$field] ?? null, $lang, $value, $defaultLang
        );
        return true;
    }

    /**
     * Coerce a legacy plain string to a Localized map anchored at the default
     * language, then set `$lang`. The PHP twin of TS `setLocalized`.
     */
    private static function liftAndSet($current, string $lang, string $value, string $defaultLang): array
    {
        $map = [];
        if (is_string($current) && $current !== '') {
            $map[$defaultLang] = $current;
        } elseif (is_array($current)) {
            $map = $current;
        }
        $map[$lang] = $value;
        return $map;
    }

    /**
     * Every language that has a value anywhere in the translatable surface,
     * used to keep `available_languages` honest after a write. Always includes
     * `$defaultLang` so a scenario never reports zero languages.
     */
    public static function unionLangs(array $gameMeta, string $defaultLang): array
    {
        $seen = [$defaultLang => true];

        $walk = function ($value) use (&$walk, &$seen) {
            if (!is_array($value)) return;
            if (LocalizedCompat::isLocalizedMap($value)) {
                foreach ($value as $lang => $v) {
                    if (is_string($v) && $v !== '') $seen[$lang] = true;
                }
                return;
            }
            foreach ($value as $child) $walk($child);
        };

        foreach ($gameMeta as $key => $value) {
            // `medias` and friends can hold deep non-text structures; walking
            // them is harmless (isLocalizedMap gates on lang-shaped keys) but
            // pointless, so skip the obvious bulk.
            if ($key === 'medias' || $key === 'custom_fonts') continue;
            $walk($value);
        }

        return array_values(array_keys($seen));
    }
}
