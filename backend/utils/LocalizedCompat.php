<?php

/**
 * Stage 3 (D5) compat layer: transforms NEW-shape `scenarios.data` (where
 * translatable fields are `Localized<string>` maps inline in `game_meta`)
 * into the LEGACY shape (`game_meta` with default-lang strings + a
 * sibling `translations[lang] = {full copy}` envelope).
 *
 * Used by playground.php so the existing Tauri 2 playground keeps working
 * without any client-side change while studio leads with the new shape.
 *
 * Mirrors the TS `synthesizeLegacyTranslations` + `flattenToDefault` helpers.
 * Keep both implementations in sync if either changes.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

class LocalizedCompat
{
    private const TEXT_KEYS = [
        'text_player_starts',
        'text_card_not_empty',
        'text_team_starts_card_not_empty',
        'text_card_not_corresponding',
        'text_team_ended',
        'text_all_team_ended',
        'text_scenario_ended',
        'text_team_reached_new_level',
        'text_card_empty',
        'text_late_malus',
        'text_team_enters_top_ranking',
        'text_team_enters_podium',
        'text_team_first_place',
        'text_following_top_podium',
        'text_if_error',
        'text_is_card_empty',
    ];

    /**
     * True if `$value` is a Localized map (associative array with at least
     * one ISO-lang-shaped key), false if it's a plain string or other scalar.
     * Match-friendly with the TS `isLocalized` heuristic.
     */
    public static function isLocalizedMap($value): bool
    {
        if (!is_array($value)) return false;
        if (array_is_list($value)) return false;
        $supportedLangs = ['en','fr','es','de','it','pt','nl','pl','ru','ja','zh','ar'];
        foreach (array_keys($value) as $k) {
            if (in_array($k, $supportedLangs, true)) return true;
        }
        return false;
    }

    /**
     * Read a Localized field at `$lang`, with fallback chain:
     *   $loc[$lang] -> $loc[$defaultLang] -> first available -> ''.
     * Plain-string values are returned for $lang === $defaultLang only.
     */
    public static function getLocalized($loc, string $lang, string $defaultLang): string
    {
        if ($loc === null) return '';
        if (is_string($loc)) return $lang === $defaultLang ? $loc : '';
        if (!is_array($loc)) return '';

        if (array_key_exists($lang, $loc) && is_string($loc[$lang])) {
            return $loc[$lang];
        }
        if (array_key_exists($defaultLang, $loc) && is_string($loc[$defaultLang])) {
            return $loc[$defaultLang];
        }
        $supportedLangs = ['en','fr','es','de','it','pt','nl','pl','ru','ja','zh','ar'];
        foreach ($supportedLangs as $candidate) {
            if (array_key_exists($candidate, $loc) && is_string($loc[$candidate]) && $loc[$candidate] !== '') {
                return $loc[$candidate];
            }
        }
        return '';
    }

    /**
     * Detect whether `$data` is already in legacy shape (has `translations`
     * key) or new shape (translatable fields in game_meta are Localized maps).
     */
    public static function isLegacyShape($data): bool
    {
        if (!is_array($data)) return false;
        return array_key_exists('translations', $data);
    }

    /**
     * Transform new-shape data → legacy-shape data. Idempotent (legacy data
     * passes through unchanged). Returns a new array; does not mutate input.
     */
    public static function toLegacyShape($data): array
    {
        if (!is_array($data)) return [];
        if (self::isLegacyShape($data)) return $data;

        $defaultLang = $data['default_language'] ?? 'fr';
        $availableLanguages = $data['available_languages'] ?? [$defaultLang];
        $gameMetaIn = $data['game_meta'] ?? [];

        // Build flat (default-lang) game_meta + per-lang translations envelope.
        $flatGameMeta = $gameMetaIn;

        // Top-level translatable fields → flatten to default-lang.
        foreach (['title', 'description', 'story'] as $field) {
            if (isset($gameMetaIn[$field])) {
                $flatGameMeta[$field] = self::getLocalized($gameMetaIn[$field], $defaultLang, $defaultLang);
            }
        }
        foreach (self::TEXT_KEYS as $field) {
            if (isset($gameMetaIn[$field])) {
                $flatGameMeta[$field] = self::getLocalized($gameMetaIn[$field], $defaultLang, $defaultLang);
            }
        }

        // levels: { [k]: { name (Localized), description (Localized), points } }
        if (isset($gameMetaIn['levels']) && is_array($gameMetaIn['levels'])) {
            $flatLevels = [];
            foreach ($gameMetaIn['levels'] as $k => $level) {
                $flat = is_array($level) ? $level : [];
                if (isset($level['name'])) {
                    $flat['name'] = self::getLocalized($level['name'], $defaultLang, $defaultLang);
                }
                if (isset($level['description'])) {
                    $flat['description'] = self::getLocalized($level['description'], $defaultLang, $defaultLang);
                }
                $flatLevels[$k] = $flat;
            }
            $flatGameMeta['levels'] = $flatLevels;
        }

        // quests: only `name` translatable
        if (isset($gameMetaIn['quests']) && is_array($gameMetaIn['quests'])) {
            $flatGameMeta['quests'] = array_map(function ($q) use ($defaultLang) {
                $flat = is_array($q) ? $q : [];
                if (isset($q['name'])) {
                    $flat['name'] = self::getLocalized($q['name'], $defaultLang, $defaultLang);
                }
                return $flat;
            }, $gameMetaIn['quests']);
        }

        // enigmas: only `text` translatable
        if (isset($gameMetaIn['enigmas']) && is_array($gameMetaIn['enigmas'])) {
            $flatGameMeta['enigmas'] = array_map(function ($e) use ($defaultLang) {
                $flat = is_array($e) ? $e : [];
                if (isset($e['text'])) {
                    $flat['text'] = self::getLocalized($e['text'], $defaultLang, $defaultLang);
                }
                return $flat;
            }, $gameMetaIn['enigmas']);
        }

        // overscores: only `name_overscore_step` translatable
        if (isset($gameMetaIn['overscores']) && is_array($gameMetaIn['overscores'])) {
            $flatGameMeta['overscores'] = array_map(function ($o) use ($defaultLang) {
                $flat = is_array($o) ? $o : [];
                if (isset($o['name_overscore_step'])) {
                    $flat['name_overscore_step'] = self::getLocalized(
                        $o['name_overscore_step'], $defaultLang, $defaultLang
                    );
                }
                return $flat;
            }, $gameMetaIn['overscores']);
        }

        // Build translations envelope: per-lang, full copy of translatable surface.
        $translations = [];
        foreach ($availableLanguages as $lang) {
            $entry = [
                'title'       => self::getLocalized($gameMetaIn['title'] ?? null, $lang, $defaultLang),
                'description' => self::getLocalized($gameMetaIn['description'] ?? null, $lang, $defaultLang),
                'story'       => self::getLocalized($gameMetaIn['story'] ?? null, $lang, $defaultLang),
            ];

            if (isset($gameMetaIn['levels']) && is_array($gameMetaIn['levels'])) {
                $perLangLevels = [];
                foreach ($gameMetaIn['levels'] as $k => $level) {
                    $entryLvl = is_array($level) ? $level : [];
                    $entryLvl['name'] = self::getLocalized($level['name'] ?? null, $lang, $defaultLang);
                    $entryLvl['description'] = self::getLocalized($level['description'] ?? null, $lang, $defaultLang);
                    $perLangLevels[$k] = $entryLvl;
                }
                $entry['levels'] = $perLangLevels;
            }
            if (isset($gameMetaIn['quests']) && is_array($gameMetaIn['quests'])) {
                $entry['quests'] = array_map(function ($q, $i) use ($lang, $defaultLang) {
                    return [
                        'index' => (string)$i,
                        'name' => self::getLocalized($q['name'] ?? null, $lang, $defaultLang),
                    ];
                }, $gameMetaIn['quests'], array_keys($gameMetaIn['quests']));
            }
            if (isset($gameMetaIn['enigmas']) && is_array($gameMetaIn['enigmas'])) {
                $entry['enigmas'] = array_map(function ($e) use ($lang, $defaultLang) {
                    $copy = is_array($e) ? $e : [];
                    $copy['text'] = self::getLocalized($e['text'] ?? null, $lang, $defaultLang);
                    return $copy;
                }, $gameMetaIn['enigmas']);
            }
            if (isset($gameMetaIn['overscores']) && is_array($gameMetaIn['overscores'])) {
                $entry['overscores'] = array_map(function ($o) use ($lang, $defaultLang) {
                    return [
                        'overscore_step' => $o['overscore_step'] ?? '',
                        'name_overscore_step' => self::getLocalized($o['name_overscore_step'] ?? null, $lang, $defaultLang),
                    ];
                }, $gameMetaIn['overscores']);
            }

            $translations[$lang] = $entry;
        }

        return [
            'game_meta' => $flatGameMeta,
            'translations' => $translations,
            'default_language' => $defaultLang,
            'available_languages' => $availableLanguages,
        ];
    }

    /**
     * Inverse: transform legacy-shape data → new-shape data. Used by the
     * one-shot migration script. Idempotent (already-new data passes through).
     */
    public static function toNewShape($data, string $fallbackDefaultLang = 'fr'): array
    {
        if (!is_array($data)) return [];
        if (!self::isLegacyShape($data)) return $data;

        $defaultLang = $data['default_language'] ?? $fallbackDefaultLang;
        $translations = $data['translations'] ?? [];
        $gm = $data['game_meta'] ?? [];

        // Top-level: title (legacy game_meta + translations) / description+story (translations only)
        $gm['title'] = self::liftLocalized($gm['title'] ?? null, self::collectByLang($translations, 'title'), $defaultLang);
        $gm['description'] = self::liftLocalized(null, self::collectByLang($translations, 'description'), $defaultLang);
        // Story sometimes lives in legacy gm.scenario field
        $sourceStory = isset($gm['scenario']) && is_string($gm['scenario']) ? $gm['scenario'] : null;
        $gm['story'] = self::liftLocalized($sourceStory, self::collectByLang($translations, 'story'), $defaultLang);

        // text_*: legacy game_meta only (never translated in legacy)
        foreach (self::TEXT_KEYS as $key) {
            if (isset($gm[$key]) && is_string($gm[$key]) && $gm[$key] !== '') {
                $gm[$key] = [$defaultLang => $gm[$key]];
            }
        }

        // levels
        if (isset($gm['levels']) && is_array($gm['levels'])) {
            $newLevels = [];
            $translatedLevels = self::collectByLang($translations, 'levels');
            foreach ($gm['levels'] as $k => $level) {
                $nameByLang = [];
                $descByLang = [];
                foreach ($translatedLevels as $lang => $perLang) {
                    if (isset($perLang[$k]['name']) && is_string($perLang[$k]['name']) && $perLang[$k]['name'] !== '') {
                        $nameByLang[$lang] = $perLang[$k]['name'];
                    }
                    if (isset($perLang[$k]['description']) && is_string($perLang[$k]['description']) && $perLang[$k]['description'] !== '') {
                        $descByLang[$lang] = $perLang[$k]['description'];
                    }
                }
                $sourceLvl = is_array($level) ? $level : [];
                $sourceLvl['name'] = self::liftLocalized($sourceLvl['name'] ?? null, $nameByLang, $defaultLang);
                $sourceLvl['description'] = self::liftLocalized($sourceLvl['description'] ?? null, $descByLang, $defaultLang);
                $newLevels[$k] = $sourceLvl;
            }
            $gm['levels'] = $newLevels;
        }

        // quests
        if (isset($gm['quests']) && is_array($gm['quests'])) {
            $translatedQuests = self::collectByLang($translations, 'quests');
            $gm['quests'] = array_map(function ($q, $i) use ($translatedQuests, $defaultLang) {
                $nameByLang = [];
                foreach ($translatedQuests as $lang => $perLang) {
                    if (isset($perLang[$i]['name']) && is_string($perLang[$i]['name']) && $perLang[$i]['name'] !== '') {
                        $nameByLang[$lang] = $perLang[$i]['name'];
                    }
                }
                $copy = is_array($q) ? $q : [];
                $copy['name'] = self::liftLocalized($copy['name'] ?? null, $nameByLang, $defaultLang);
                return $copy;
            }, $gm['quests'], array_keys($gm['quests']));
        }

        // enigmas
        if (isset($gm['enigmas']) && is_array($gm['enigmas'])) {
            $translatedEnigmas = self::collectByLang($translations, 'enigmas');
            $gm['enigmas'] = array_map(function ($e, $i) use ($translatedEnigmas, $defaultLang) {
                $textByLang = [];
                foreach ($translatedEnigmas as $lang => $perLang) {
                    if (isset($perLang[$i]['text']) && is_string($perLang[$i]['text']) && $perLang[$i]['text'] !== '') {
                        $textByLang[$lang] = $perLang[$i]['text'];
                    }
                }
                $copy = is_array($e) ? $e : [];
                $copy['text'] = self::liftLocalized($copy['text'] ?? null, $textByLang, $defaultLang);
                return $copy;
            }, $gm['enigmas'], array_keys($gm['enigmas']));
        }

        // overscores
        if (isset($gm['overscores']) && is_array($gm['overscores'])) {
            $translatedOverscores = self::collectByLang($translations, 'overscores');
            $gm['overscores'] = array_map(function ($o, $i) use ($translatedOverscores, $defaultLang) {
                $nameByLang = [];
                foreach ($translatedOverscores as $lang => $perLang) {
                    if (isset($perLang[$i]['name_overscore_step']) && is_string($perLang[$i]['name_overscore_step']) && $perLang[$i]['name_overscore_step'] !== '') {
                        $nameByLang[$lang] = $perLang[$i]['name_overscore_step'];
                    }
                }
                $copy = is_array($o) ? $o : [];
                $copy['name_overscore_step'] = self::liftLocalized($copy['name_overscore_step'] ?? null, $nameByLang, $defaultLang);
                return $copy;
            }, $gm['overscores'], array_keys($gm['overscores']));
        }

        $out = $data;
        $out['game_meta'] = $gm;
        unset($out['translations']);
        return $out;
    }

    /**
     * Build a Localized map from a source-lang value + per-lang values.
     * Returns an associative array (the new-shape Localized<string>).
     */
    private static function liftLocalized($sourceValue, array $perLangValues, string $defaultLang): array
    {
        $out = [];
        foreach ($perLangValues as $lang => $value) {
            if (is_string($value) && $value !== '') {
                $out[$lang] = $value;
            }
        }
        if (is_string($sourceValue) && $sourceValue !== '' && !isset($out[$defaultLang])) {
            $out[$defaultLang] = $sourceValue;
        }
        return $out;
    }

    /** Collect `translations[lang][$key]` into `[$lang => value]`. */
    private static function collectByLang(array $translations, string $key): array
    {
        $out = [];
        foreach ($translations as $lang => $entry) {
            if (is_array($entry) && array_key_exists($key, $entry)) {
                $out[$lang] = $entry[$key];
            }
        }
        return $out;
    }
}
