<?php
// Shared helpers for game-type availability (enable/disable).
//
// Two layers; the per-client setting OVERRIDES the global default (tri-state):
//   - game_types.enabled (global default, 1 = enabled).
//   - client_game_type_overrides.enabled (per-client tri-state):
//       NULL = inherit the global default (follows global changes),
//       1    = force-enabled for this client (even if globally disabled),
//       0    = force-disabled for this client (even if globally enabled).
//   - Effective availability = override.enabled (when set) ELSE global.enabled.
//
// So a client can be granted a globally-disabled type (e.g. an early-access pilot for
// `clash`) by setting an explicit per-client enable. This helper returns the set of
// game-type codes a given client must NOT see — used to filter scenarios, patterns,
// tutorial videos, etc. server-side (the authoritative gate). The studio UI mirrors this
// cosmetically via game_types.php?action=list.
//
// One place so client_scenarios.php, playground.php and game_types.php all compute the
// same effective set. See plans/disable-game-types.md.

class GameTypes {
    /**
     * Game-type codes globally disabled (game_types.enabled = 0). Affects everyone.
     * @return string[]
     */
    public static function globallyDisabled($pdo): array {
        $rows = $pdo->query('SELECT code FROM game_types WHERE enabled = 0')->fetchAll(PDO::FETCH_COLUMN);
        return array_values(array_map('strval', $rows ?: []));
    }

    /**
     * Effective set of game-type codes a client must NOT see. Per type:
     *   effective = override.enabled (when the client has a NON-NULL override)
     *             ELSE game_types.enabled (the global default).
     * A type is "disabled for client" when that effective value is falsy. So an
     * explicit per-client enable (override = 1) makes a globally-disabled type
     * available to that one client.
     * @return string[]
     */
    public static function disabledForClient($pdo, $clientId): array {
        // code => global enabled (0/1)
        $globalEnabled = $pdo->query('SELECT code, enabled FROM game_types')->fetchAll(PDO::FETCH_KEY_PAIR);

        // code => per-client override (only rows where enabled IS NOT NULL count)
        $stmt = $pdo->prepare(
            'SELECT game_type_code, enabled FROM client_game_type_overrides
             WHERE client_id = ? AND enabled IS NOT NULL'
        );
        $stmt->execute([$clientId]);
        $override = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $override[$r['game_type_code']] = (int)$r['enabled'];
        }

        $disabled = [];
        foreach ($globalEnabled as $code => $gEnabled) {
            $effective = array_key_exists($code, $override) ? $override[$code] : (int)$gEnabled;
            if (!$effective) {
                $disabled[] = (string)$code;
            }
        }
        return $disabled;
    }

    /**
     * The update channel a device resolves to: its own override, else its
     * client's channel, else 'stable'. Mirrors PlaygroundAuthState::build.
     */
    public static function deviceChannel($pdo, $clientId, $deviceId): string {
        $channel = null;
        if ($deviceId) {
            $stmt = $pdo->prepare('SELECT update_channel FROM devices WHERE id = ?');
            $stmt->execute([$deviceId]);
            $channel = $stmt->fetchColumn() ?: null;
        }
        if (!$channel && $clientId) {
            $stmt = $pdo->prepare('SELECT update_channel FROM clients WHERE id = ?');
            $stmt->execute([$clientId]);
            $channel = $stmt->fetchColumn() ?: null;
        }
        return in_array($channel, ['stable', 'test'], true) ? $channel : 'stable';
    }

    /**
     * Effective set of game-type codes a DEVICE must NOT see. Resolution per type,
     * most-specific wins:
     *   device override ?? client override
     *     ?? test-channel override (only when the device's channel is 'test')
     *     ?? global game_types.enabled.
     * A type is disabled when that effective value is falsy. This is the gate the
     * playground sync uses so per-device and all-testers grants actually reach the
     * device. Falls back to disabledForClient when no device is known.
     * @return string[]
     */
    public static function disabledForDevice($pdo, $clientId, $deviceId, $channel = null): array {
        if (!$deviceId) {
            return self::disabledForClient($pdo, $clientId);
        }
        if ($channel === null) {
            $channel = self::deviceChannel($pdo, $clientId, $deviceId);
        }

        $globalEnabled = $pdo->query('SELECT code, enabled FROM game_types')->fetchAll(PDO::FETCH_KEY_PAIR);

        $deviceOverride = self::overrideMap(
            $pdo,
            'SELECT game_type_code, enabled FROM device_game_type_overrides WHERE device_id = ? AND enabled IS NOT NULL',
            [$deviceId]
        );
        $clientOverride = self::overrideMap(
            $pdo,
            'SELECT game_type_code, enabled FROM client_game_type_overrides WHERE client_id = ? AND enabled IS NOT NULL',
            [$clientId]
        );
        $channelOverride = $channel === 'test'
            ? self::overrideMap(
                $pdo,
                'SELECT game_type_code, enabled FROM channel_game_type_overrides WHERE channel = ? AND enabled IS NOT NULL',
                [$channel]
            )
            : [];

        $disabled = [];
        foreach ($globalEnabled as $code => $gEnabled) {
            if (array_key_exists($code, $deviceOverride)) {
                $effective = $deviceOverride[$code];
            } elseif (array_key_exists($code, $clientOverride)) {
                $effective = $clientOverride[$code];
            } elseif (array_key_exists($code, $channelOverride)) {
                $effective = $channelOverride[$code];
            } else {
                $effective = (int)$gEnabled;
            }
            if (!$effective) {
                $disabled[] = (string)$code;
            }
        }
        return $disabled;
    }

    /** code => (int)enabled, for a tri-state override query (only non-NULL rows). */
    private static function overrideMap($pdo, string $sql, array $params): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $out[$r['game_type_code']] = (int)$r['enabled'];
        }
        return $out;
    }

    /**
     * Build a SQL fragment + bound params that exclude the given game-type codes from a
     * column. Returns ['', []] when nothing is disabled (so callers can append safely).
     *
     * Usage:
     *   [$clause, $params] = GameTypes::notInClause(GameTypes::disabledForClient($pdo, $cid), 's.game_type');
     *   $sql = "SELECT ... WHERE foo = ?" . $clause;  // $clause starts with " AND ..."
     *   $stmt->execute(array_merge([$foo], $params));
     *
     * @param string[] $codes
     * @return array{0:string,1:string[]}  [sqlFragment, params]
     */
    public static function notInClause(array $codes, string $column): array {
        $codes = array_values(array_unique(array_filter($codes, 'strlen')));
        if (empty($codes)) {
            return ['', []];
        }
        $placeholders = implode(',', array_fill(0, count($codes), '?'));
        return [" AND ($column IS NULL OR $column NOT IN ($placeholders))", $codes];
    }
}
