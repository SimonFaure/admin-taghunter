<?php

/**
 * Per-file app restriction for scenario files (`scenario_files.apps`).
 *
 * An admin can restrict a downloadable file to some apps (Playground, GO,
 * Spot). A licensee then sees it on the Studio portal only if they hold the
 * scenario through one of those apps. Stored on the PRIMARY file: language
 * variants follow their primary. NULL = every app.
 *
 * "Held apps" is either null (owner or admin: sees every file) or a list of
 * app codes (may be empty = no access at all).
 */
class ScenarioFileApps {
    const APPS = ['playground', 'go', 'spot'];

    /** Stored value -> list of apps, or null when the file is not restricted. */
    public static function parse($raw) {
        if ($raw === null || $raw === '') return null;
        $apps = array_values(array_intersect(self::APPS, explode(',', (string)$raw)));
        if (!$apps || count($apps) === count(self::APPS)) return null;
        return $apps;
    }

    /**
     * Admin input -> stored value. Throws on an empty list or an unknown code.
     * Every app ticked = NULL (no restriction).
     */
    public static function encode($apps) {
        if (!is_array($apps) || !$apps) {
            throw new InvalidArgumentException('Pick at least one app');
        }
        foreach ($apps as $a) {
            if (!in_array($a, self::APPS, true)) {
                throw new InvalidArgumentException('Unknown app');
            }
        }
        // Canonical order, no duplicates.
        $apps = array_values(array_intersect(self::APPS, $apps));
        return count($apps) === count(self::APPS) ? null : implode(',', $apps);
    }

    /**
     * The apps through which a CLIENT holds this scenario: its grant modes, plus
     * `playground` when it reaches a product through its premium licence.
     * Null when the client owns the scenario (owner sees every file).
     *
     * $scenario needs: id, client_id, scenario_type, game_type.
     * $premiumProductAccess: the caller already knows the premium+product case
     * applies (language checks differ per endpoint, so they stay there).
     */
    public static function heldByClient(PDO $pdo, $clientId, array $scenario, $premiumProductAccess = false) {
        if ($scenario['client_id'] !== null && (int)$scenario['client_id'] === (int)$clientId) return null;

        $stmt = $pdo->prepare('SELECT DISTINCT mode FROM client_scenarios WHERE client_id = ? AND scenario_id = ?');
        $stmt->execute([$clientId, $scenario['id']]);
        $held = [];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $mode) {
            // Pre-GO grants carry an empty mode: they are Playground grants.
            $mode = $mode ?: 'playground';
            if (in_array($mode, self::APPS, true)) $held[] = $mode;
        }
        if ($premiumProductAccess) $held[] = 'playground';
        $held = array_values(array_unique($held));
        // The restriction only exists for Mystery scenarios (the only type
        // shared by Playground, GO and Spot): elsewhere any holder sees every file.
        if ($held && !self::appliesTo($scenario)) return null;
        return $held;
    }

    /** Is the per-file app restriction used for this scenario? Needs game_type. */
    public static function appliesTo(array $scenario) {
        return ($scenario['game_type'] ?? '') === 'mystery';
    }

    /** May a file restricted to `$fileApps` (stored value) be shown to `$held`? */
    public static function visible($fileApps, $held) {
        if ($held === null) return true;
        $apps = self::parse($fileApps);
        if ($apps === null) return true;
        return (bool)array_intersect($apps, $held);
    }

    /**
     * Drop the documents `$held` may not see. Rows need id, parent_file_id and
     * apps. A variant follows its primary; a variant whose primary is gone is
     * judged on its own value.
     */
    public static function filter(array $files, $held) {
        if ($held === null) return $files;
        $primaryApps = [];
        foreach ($files as $f) {
            if ($f['parent_file_id'] === null) $primaryApps[(int)$f['id']] = $f['apps'] ?? null;
        }
        return array_values(array_filter($files, function ($f) use ($primaryApps, $held) {
            $apps = $f['parent_file_id'] !== null && array_key_exists((int)$f['parent_file_id'], $primaryApps)
                ? $primaryApps[(int)$f['parent_file_id']]
                : ($f['apps'] ?? null);
            return self::visible($apps, $held);
        }));
    }

    /** Number of documents (variants collapsed) of a scenario `$held` may see. */
    public static function countDocuments(PDO $pdo, $scenarioId, $held) {
        $stmt = $pdo->prepare('SELECT id, parent_file_id, apps FROM scenario_files WHERE scenario_id = ?');
        $stmt->execute([$scenarioId]);
        $docs = [];
        foreach (self::filter($stmt->fetchAll(PDO::FETCH_ASSOC), $held) as $f) {
            $docs[$f['parent_file_id'] !== null ? (int)$f['parent_file_id'] : (int)$f['id']] = true;
        }
        return count($docs);
    }
}
