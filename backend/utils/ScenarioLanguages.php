<?php
/**
 * Product scenarios are released to a client only in the client's language.
 *
 * A premium client (the only licence sold) implicitly holds every PUBLISHED
 * product scenario (project_premium_client_grant_blind_spot); that implicit set
 * is narrowed to the scenarios whose authored languages include the client's
 * `clients.language` (project_client_language). A scenario's languages are
 * `data.available_languages` plus `data.default_language` (flat or `data.data.…`
 * wrapped envelope); a legacy row with no language metadata counts as French,
 * the product authoring default.
 *
 * Only the IMPLICIT premium set is filtered. A client's own scenarios and any
 * explicit client_scenarios grant (hand-added by an admin, incl. GO / Spot)
 * are never narrowed - the admin chose them deliberately.
 *
 * LANGUAGE VALIDATION. An admin-owned scenario (`client_id IS NULL`, which is
 * every product) only releases the languages an admin has VALIDATED in
 * Admin > Translations > Scenarios (`scenarios.validated_languages`). A language
 * being translated is present in `data` but is stripped from every client and
 * device payload (`visibleLanguages` + `strip`), so a half-done English never
 * reaches a playground. Rules:
 *   - the default language is always validated;
 *   - NULL on an admin scenario = only the default language (the migration
 *     backfilled every existing row with its languages at the time, once);
 *   - a client's own scenario is never gated - the client is its author;
 *   - admins, and clients flagged `sees_draft_languages` (testers, for field
 *     QA on real hardware), see every language.
 * The playground can only be gated server-side: devices always authenticate as
 * a client, and LaunchGameModal scans `data` for language keys when the list is
 * missing, so hiding `available_languages` alone would not be enough.
 */
require_once __DIR__ . '/LocalizedCompat.php';

class ScenarioLanguages {
    const DEFAULT_LANG = 'fr';

    /** The 12 player-facing codes. Mirrors LocalizedCompat::LANGS. */
    const LANGS = ['en','fr','es','de','it','pt','nl','pl','ru','ja','zh','ar'];

    private static $clientLangCache = [];
    private static $seesDraftsCache = [];

    /** Lowercase 2-letter code, or null. Mirrors src/types/scenarioLanguages.ts. */
    private static function toCode($raw) {
        if (!is_string($raw)) return null;
        $code = strtolower(preg_split('/[-_]/', trim($raw))[0]);
        return preg_match('/^[a-z]{2}$/', $code) ? $code : null;
    }

    /** The languages a scenario is authored in, from its raw `data` column. */
    public static function fromData($data) {
        $obj = is_string($data) ? json_decode($data, true) : $data;
        $langs = [];
        if (is_array($obj)) {
            $root = (isset($obj['available_languages']) || isset($obj['default_language']))
                ? $obj
                : (is_array($obj['data'] ?? null) ? $obj['data'] : $obj);
            $def = self::toCode($root['default_language'] ?? null);
            if ($def) $langs[] = $def;
            foreach ((is_array($root['available_languages'] ?? null) ? $root['available_languages'] : []) as $l) {
                $c = self::toCode($l);
                if ($c) $langs[] = $c;
            }
        }
        $langs = array_values(array_unique($langs));
        return $langs ?: [self::DEFAULT_LANG];
    }

    /** The client's language (clients.language), 'fr' when unset/unknown. */
    public static function clientLanguage($db, $clientId) {
        $clientId = (int)$clientId;
        if (!isset(self::$clientLangCache[$clientId])) {
            $sql = 'SELECT language FROM clients WHERE id = ?';
            if ($db instanceof PDO) {
                $stmt = $db->prepare($sql);
                $stmt->execute([$clientId]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
            } else {
                $row = $db->fetch($sql, [$clientId]);
            }
            self::$clientLangCache[$clientId] = self::toCode($row['language'] ?? null) ?: self::DEFAULT_LANG;
        }
        return self::$clientLangCache[$clientId];
    }

    /** Does this client see unvalidated languages (`clients.sees_draft_languages`)? */
    public static function clientSeesDrafts($db, $clientId) {
        $clientId = (int)$clientId;
        if ($clientId <= 0) return false;
        if (!isset(self::$seesDraftsCache[$clientId])) {
            $sql = 'SELECT sees_draft_languages FROM clients WHERE id = ?';
            try {
                if ($db instanceof PDO) {
                    $stmt = $db->prepare($sql);
                    $stmt->execute([$clientId]);
                    $row = $stmt->fetch(PDO::FETCH_ASSOC);
                } else {
                    $row = $db->fetch($sql, [$clientId]);
                }
            } catch (Exception $e) {
                // Column not migrated yet: nobody is a tester.
                $row = null;
            }
            self::$seesDraftsCache[$clientId] = !empty($row['sees_draft_languages']);
        }
        return self::$seesDraftsCache[$clientId];
    }

    /** Is this scenario row subject to language validation (admin-owned)? */
    public static function isGated(array $row) {
        return empty($row['client_id']);
    }

    /**
     * The languages an admin has validated, resolved: authored languages
     * (`fromData`) filtered by `validated_languages`, the default always kept.
     * `$row` needs `data`, `client_id` and `validated_languages`.
     */
    public static function validatedLanguages(array $row) {
        $all = self::fromData($row['data'] ?? null);
        if (!self::isGated($row)) return $all;
        $raw = $row['validated_languages'] ?? null;
        $list = is_string($raw) ? json_decode($raw, true) : $raw;
        $ok = [];
        foreach (is_array($list) ? $list : [] as $l) {
            $c = self::toCode($l);
            if ($c) $ok[$c] = true;
        }
        // fromData puts default_language first when there is one.
        $default = $all[0];
        return array_values(array_filter($all, function ($l) use ($ok, $default) {
            return $l === $default || isset($ok[$l]);
        }));
    }

    /** Target languages of a scenario whose `target_languages` was never set. */
    const DEFAULT_TARGETS = ['fr', 'en', 'es'];

    /**
     * The languages this scenario is MEANT to exist in ("available in French
     * only" = just its own), the scenario's own language first. Never set
     * (NULL) resolves to DEFAULT_TARGETS plus everything already released, so
     * introducing the column changed nothing for any licensee.
     *
     * This is a cap on validation, enforced AT WRITE TIME by
     * scenario_translations.php (`set_language_validation` refuses a language
     * outside it, `set_target_languages` withdraws the ones it drops) - so
     * `validated_languages` always sits inside it and no read path consults
     * it. `$row` needs `data`, `client_id`, `validated_languages` and
     * `target_languages`.
     */
    public static function targetLanguages(array $row) {
        $default = self::fromData($row['data'] ?? null)[0];
        $raw = $row['target_languages'] ?? null;
        $list = is_string($raw) ? json_decode($raw, true) : $raw;
        if (!is_array($list)) {
            $list = array_merge(self::DEFAULT_TARGETS, self::validatedLanguages($row));
        }
        $out = [$default];
        foreach ($list as $l) {
            $c = self::toCode($l);
            if ($c && !in_array($c, $out, true)) $out[] = $c;
        }
        return $out;
    }

    /**
     * The languages `$row` may be served in. `$clientId` is the viewing client;
     * null means an admin viewer, who sees everything.
     */
    public static function visibleLanguages($db, array $row, $clientId) {
        if ($clientId === null || !self::isGated($row) || self::clientSeesDrafts($db, $clientId)) {
            return self::fromData($row['data'] ?? null);
        }
        return self::validatedLanguages($row);
    }

    /** True when `$visible` leaves out some of the scenario's authored languages. */
    public static function isNarrowed(array $row, array $visible) {
        return count(array_diff(self::fromData($row['data'] ?? null), $visible)) > 0;
    }

    /**
     * Remove every language not in `$keep` from a scenario `data` blob (array
     * or JSON string; returned in the same form). Every Localized map in
     * `game_meta` (text_*, levels, enigmas, univers_i18n, ...) loses the other
     * languages, a legacy `translations` envelope loses their copies, and
     * `available_languages` is rewritten. Tolerates the wrapped `data.data.…`
     * envelope.
     */
    public static function strip($data, array $keep) {
        $wasString = is_string($data);
        $obj = $wasString ? json_decode($data, true) : $data;
        if (!is_array($obj)) return $data;

        $wrapped = !isset($obj['game_meta']) && !isset($obj['available_languages']) && is_array($obj['data'] ?? null);
        $root = $wrapped ? $obj['data'] : $obj;

        $walk = function ($value) use (&$walk, $keep) {
            if (!is_array($value)) return $value;
            if (LocalizedCompat::isLocalizedMap($value)) {
                foreach (array_keys($value) as $k) {
                    if (in_array($k, self::LANGS, true) && !in_array($k, $keep, true)) unset($value[$k]);
                }
                return $value;
            }
            foreach ($value as $k => $child) {
                if ($k === 'medias' || $k === 'custom_fonts') continue;
                $value[$k] = $walk($child);
            }
            return $value;
        };
        if (isset($root['game_meta']) && is_array($root['game_meta'])) {
            $root['game_meta'] = $walk($root['game_meta']);
        }
        if (isset($root['translations']) && is_array($root['translations'])) {
            foreach (array_keys($root['translations']) as $k) {
                if (!in_array(self::toCode($k), $keep, true)) unset($root['translations'][$k]);
            }
        }
        if (isset($root['available_languages']) && is_array($root['available_languages'])) {
            $root['available_languages'] = array_values(array_filter(
                $root['available_languages'],
                function ($l) use ($keep) { return in_array(self::toCode($l), $keep, true); }
            ));
        }

        if ($wrapped) $obj['data'] = $root; else $obj = $root;
        return $wasString ? json_encode($obj, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : $obj;
    }

    /**
     * The cover visual to show a viewer whose language is `$lang`:
     * `game_visual` is the French cover; any other language gets the "other
     * languages" version `game_visual_intl` when the author uploaded one, else
     * `game_visual`. `$images` is the `medias.images` map. Null when the
     * scenario has no cover at all. Mirrors getGameVisualUrl (studio) and
     * pickGameVisual (playground).
     */
    public static function gameVisual($images, $lang) {
        if (!is_array($images)) return null;
        $code = self::toCode($lang);
        if ($code && $code !== 'fr' && !empty($images['game_visual_intl'])) return $images['game_visual_intl'];
        return !empty($images['game_visual']) ? $images['game_visual'] : null;
    }

    /**
     * Drop the cover versions of hidden languages from a `medias` column
     * (array or JSON string; returned in the same form): the legacy
     * `medias.images.game_visual_<lang>` of each language in `$hidden`, and the
     * shared "other languages" `game_visual_intl` when a non-French language is
     * hidden and none is in `$visible`. The cover of a language still being
     * translated is as unreleased as its texts.
     */
    public static function stripMedias($medias, array $hidden, array $visible = []) {
        $wasString = is_string($medias);
        $obj = $wasString ? json_decode($medias, true) : $medias;
        if (!is_array($obj) || !is_array($obj['images'] ?? null)) return $medias;
        $changed = false;
        foreach ($hidden as $l) {
            if (array_key_exists('game_visual_' . $l, $obj['images'])) {
                unset($obj['images']['game_visual_' . $l]);
                $changed = true;
            }
        }
        $notFr = function ($l) { return $l !== 'fr'; };
        if (array_key_exists('game_visual_intl', $obj['images'])
            && array_filter($hidden, $notFr) && !array_filter($visible, $notFr)) {
            unset($obj['images']['game_visual_intl']);
            $changed = true;
        }
        if (!$changed) return $medias;
        return $wasString ? json_encode($obj, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : $obj;
    }

    /**
     * The sync hash to serve. Unchanged when nothing is narrowed, so every
     * ungated or fully validated scenario keeps byte-identical hashes;
     * otherwise salted with the visible set, so validating / un-validating a
     * language, or flipping a client's tester flag, changes the hash and the
     * playground re-downloads the scenario.
     */
    public static function servedHash($hash, array $row, array $visible) {
        if ($hash === null || $hash === '' || !self::isNarrowed($row, $visible)) return $hash;
        $v = $visible;
        sort($v);
        return hash('sha256', $hash . '|langs:' . implode(',', $v));
    }

    /**
     * Narrow one scenario row for a client viewer: strip `data` (and the
     * hidden languages' cover visuals from `medias`) and salt the
     * `content_hash` / `data_hash` columns when present. The row needs
     * `data`, `client_id` and `validated_languages`.
     */
    public static function narrowRow($db, array $row, $clientId) {
        $visible = self::visibleLanguages($db, $row, $clientId);
        if (!self::isNarrowed($row, $visible)) return $row;
        foreach (['content_hash', 'data_hash'] as $col) {
            if (array_key_exists($col, $row)) $row[$col] = self::servedHash($row[$col], $row, $visible);
        }
        if (array_key_exists('medias', $row)) {
            $row['medias'] = self::stripMedias($row['medias'], array_diff(self::fromData($row['data'] ?? null), $visible), $visible);
        }
        if (array_key_exists('data', $row)) $row['data'] = self::strip($row['data'], $visible);
        return $row;
    }

    /** Is this scenario (raw `data`) authored in `$lang`? No validation gate. */
    public static function hasLanguage($data, $lang) {
        return in_array($lang, self::fromData($data), true);
    }

    /** Is `$lang` released to `$clientId` for this row (validation gate applied)? */
    public static function hasVisibleLanguage($db, array $row, $clientId, $lang) {
        return in_array($lang, self::visibleLanguages($db, $row, $clientId), true);
    }

    /**
     * Drop the PRODUCT rows of `$rows` not released in the client's language.
     * Rows need `scenario_type`, `data`, `client_id` and `validated_languages`;
     * non-product rows are kept untouched.
     */
    public static function filterProducts(array $rows, $lang, $db, $clientId) {
        return array_values(array_filter($rows, function ($r) use ($lang, $db, $clientId) {
            if (($r['scenario_type'] ?? '') !== 'product') return true;
            return self::hasVisibleLanguage($db, $r, $clientId, $lang);
        }));
    }
}
