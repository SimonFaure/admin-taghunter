<?php
// Licensee notifications: the bell on the licensee home (/my/home).
// Schema: backend/database/add_licensee_notifications.sql.
//
// Recording: the admin code paths call onScenarioSaved() / onReleaseOnChannel()
// when something happens; game types are detected by diffing what each licensee
// can use against what it already knew (catches the global, per-licensee and
// test-channel switches alike). Recording never fails its caller.
//
// Reading: listFor() merges those rows with the admin updates on the licensee's
// equipment requests (order_request_events) and decides visibility at read time
// (apps, update channel, language, disabled game types, scenario still live).

require_once __DIR__ . '/GameTypes.php';
require_once __DIR__ . '/ScenarioLanguages.php';
require_once __DIR__ . '/PlaygroundReleaseSettings.php';

class LicenseeNotifications {
    const WINDOW_DAYS = 90;
    const LIMIT = 30;
    // Scenario events of one scenario this close together show as one line.
    const MERGE_SECONDS = 86400;

    public static function migrated($db): bool {
        try {
            $db->fetch('SELECT 1 FROM licensee_notification_state LIMIT 1');
            return true;
        } catch (Throwable $e) {
            return false;
        }
    }

    // ── Recording ─────────────────────────────────────────────────────────

    private static function record($db, string $type, string $key, ?int $clientId, ?int $refId, array $payload): void {
        try {
            $db->execute(
                'INSERT IGNORE INTO licensee_notifications (type, dedupe_key, client_id, ref_id, payload) VALUES (?, ?, ?, ?, ?)',
                [$type, $key, $clientId, $refId, json_encode($payload, JSON_UNESCAPED_UNICODE)]
            );
        } catch (Throwable $e) {
            // Table not migrated yet, or any other hiccup: never break the save.
            error_log('LicenseeNotifications::record failed (non-fatal): ' . $e->getMessage());
        }
    }

    /** game_meta of a scenarios.data blob; both the flat and the wrapped shapes exist. */
    public static function gameMeta($data): array {
        $arr = is_array($data) ? $data : ((is_string($data) && $data !== '') ? json_decode($data, true) : null);
        $gm = is_array($arr) ? ($arr['game_meta'] ?? ($arr['data']['game_meta'] ?? null)) : null;
        return is_array($gm) ? $gm : [];
    }

    private static function isProduct(array $row): bool {
        return ($row['scenario_type'] ?? '') === 'product' || empty($row['client_id']);
    }

    /**
     * After a scenario save. $before is the row before the save (null on create),
     * $after the saved values; both need status, scenario_type, client_id, data.
     * Fires once per scenario and kind, on the transition only:
     *   - a product becomes published               -> scenario_published
     *   - a published product becomes GO / Spot-capable -> scenario_go / scenario_spot
     */
    public static function onScenarioSaved($db, ?array $before, array $after): void {
        try {
            if (!self::isProduct($after) || ($after['status'] ?? '') !== 'published') return;
            $wasPublished = $before !== null && ($before['status'] ?? '') === 'published';
            $gmBefore = $wasPublished ? self::gameMeta($before['data'] ?? null) : [];
            $gmAfter = self::gameMeta($after['data'] ?? null);
            $id = (int)$after['id'];
            if ($id <= 0) return;
            $payload = ['title' => (string)($after['title'] ?? ''), 'game_type' => (string)($after['game_type'] ?? '')];

            if (!$wasPublished) {
                self::record($db, 'scenario_published', "scenario_published:$id", null, $id, $payload);
            }
            foreach (['go' => 'adaptable_go', 'spot' => 'adaptable_spot'] as $app => $flag) {
                if (!empty($gmAfter[$flag]) && empty($gmBefore[$flag])) {
                    self::record($db, "scenario_$app", "scenario_$app:$id", null, $id, $payload);
                }
            }
        } catch (Throwable $e) {
            error_log('LicenseeNotifications::onScenarioSaved failed (non-fatal): ' . $e->getMessage());
        }
    }

    /** A Playground version now exists on a channel (upload, or moved by set_channel). */
    public static function onReleaseOnChannel($db, string $version, string $channel): void {
        if ($version === '' || !in_array($channel, ['stable', 'test'], true)) return;
        self::record($db, 'playground_release', "playground_release:$channel:$version", null, null,
            ['version' => $version, 'channel' => $channel]);
    }

    // ── Reading ───────────────────────────────────────────────────────────

    /** Licensee on the test channel: the account itself or any of its devices. */
    private static function isTester($db, array $client): bool {
        if (($client['update_channel'] ?? 'stable') === 'test') return true;
        try {
            return (bool)$db->fetch("SELECT 1 FROM devices WHERE client_id = ? AND update_channel = 'test' LIMIT 1", [(int)$client['id']]);
        } catch (Throwable $e) {
            return false;
        }
    }

    /**
     * Game types this licensee can use: its own override, else (testers) the
     * all-testers layer, else the global switch. code => display name.
     */
    private static function availableGameTypes($db, int $clientId, bool $tester): array {
        $pdo = $db->getConnection();
        $types = $pdo->query('SELECT code, name, enabled FROM game_types')->fetchAll(PDO::FETCH_ASSOC);
        $override = [];
        $stmt = $pdo->prepare('SELECT game_type_code, enabled FROM client_game_type_overrides WHERE client_id = ? AND enabled IS NOT NULL');
        $stmt->execute([$clientId]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) $override[$r['game_type_code']] = (int)$r['enabled'];
        $channel = [];
        if ($tester) {
            try {
                $rows = $pdo->query("SELECT game_type_code, enabled FROM channel_game_type_overrides WHERE channel = 'test' AND enabled IS NOT NULL")->fetchAll(PDO::FETCH_ASSOC);
                foreach ($rows as $r) $channel[$r['game_type_code']] = (int)$r['enabled'];
            } catch (Throwable $e) {
                // channel layer not migrated: ignore it
            }
        }
        $out = [];
        foreach ($types as $t) {
            $code = (string)$t['code'];
            $effective = $override[$code] ?? $channel[$code] ?? (int)$t['enabled'];
            if ($effective) $out[$code] = (string)$t['name'];
        }
        ksort($out);
        return $out;
    }

    /**
     * Record a game_type row for every type that became available since the last
     * read. The very first read only takes a snapshot (no backlog of old types).
     */
    private static function syncGameTypes($db, int $clientId, bool $tester, ?array $state): void {
        try {
            $available = self::availableGameTypes($db, $clientId, $tester);
            $known = ($state && $state['game_types_known'] !== null) ? json_decode($state['game_types_known'], true) : null;
            if (is_array($known)) {
                foreach ($available as $code => $name) {
                    if (!in_array($code, $known, true)) {
                        self::record($db, 'game_type', "game_type:$clientId:$code", $clientId, null, ['code' => $code, 'name' => $name]);
                    }
                }
            }
            $codes = array_keys($available);
            if (!is_array($known) || $known !== $codes) {
                $db->execute(
                    'INSERT INTO licensee_notification_state (client_id, game_types_known) VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE game_types_known = VALUES(game_types_known)',
                    [$clientId, json_encode($codes)]
                );
            }
        } catch (Throwable $e) {
            error_log('LicenseeNotifications::syncGameTypes failed (non-fatal): ' . $e->getMessage());
        }
    }

    /** Does a release (version, channel) still have a build licensees can get? */
    private static function releaseVisible($db, string $version, string $channel, bool $androidVisible): bool {
        $targets = $db->fetchAll('SELECT DISTINCT target FROM playground_releases WHERE version = ? AND channel = ?', [$version, $channel]);
        foreach ($targets as $t) {
            if ($t['target'] !== 'android' || $androidVisible) return true;
        }
        return false;
    }

    /**
     * The licensee's feed, newest first:
     *   ['items' => [...], 'unread_count' => int]
     * Each item: key, type (scenario|release|game_type|order), created_at, unread,
     * link, plus its own fields (mirrored by src/types/notifications.ts).
     */
    public static function listFor($db, int $clientId): array {
        $client = $db->fetch(
            'SELECT id, license_type, playground_enabled, go_enabled, spot_enabled, update_channel FROM clients WHERE id = ?',
            [$clientId]
        );
        if (!$client) return ['items' => [], 'unread_count' => 0];
        $apps = [
            // playground_enabled absent/NULL = ON, as getAppAccess() does.
            'playground' => !isset($client['playground_enabled']) || (int)$client['playground_enabled'] === 1,
            'go' => !empty($client['go_enabled']),
            'spot' => !empty($client['spot_enabled']),
        ];
        $tester = self::isTester($db, $client);

        $items = [];
        $seenAt = null;
        $migrated = self::migrated($db);
        if ($migrated) {
            $state = $db->fetch('SELECT seen_at, game_types_known FROM licensee_notification_state WHERE client_id = ?', [$clientId]) ?: null;
            $seenAt = $state['seen_at'] ?? null;
            if ($apps['playground']) self::syncGameTypes($db, $clientId, $tester, $state);
            $items = self::eventItems($db, $client, $apps, $tester);
        }
        $items = array_merge($items, self::orderItems($db, $clientId));

        usort($items, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));
        $items = array_slice($items, 0, self::LIMIT);
        $seenTs = $seenAt ? strtotime($seenAt) : 0;
        $unread = 0;
        foreach ($items as &$it) {
            // Without the state table there is no "seen" mark: never show a dot.
            $it['unread'] = $migrated && strtotime($it['created_at']) > $seenTs;
            if ($it['unread']) $unread++;
        }
        unset($it);
        return ['items' => $items, 'unread_count' => $unread];
    }

    private static function eventItems($db, array $client, array $apps, bool $tester): array {
        $clientId = (int)$client['id'];
        $rows = $db->fetchAll(
            'SELECT id, type, ref_id, payload, created_at FROM licensee_notifications
             WHERE (client_id IS NULL OR client_id = ?) AND created_at >= DATE_SUB(NOW(), INTERVAL ' . self::WINDOW_DAYS . ' DAY)
             ORDER BY id DESC LIMIT 300',
            [$clientId]
        );
        if (!$rows) return [];

        $pdo = $db->getConnection();
        $disabledTypes = GameTypes::disabledForClient($pdo, $clientId);
        $clientLang = ScenarioLanguages::clientLanguage($db, $clientId);
        $androidVisible = PlaygroundReleaseSettings::androidVisibleToClients($db);

        // Scenarios referenced by scenario_* rows, loaded once.
        $ids = array_values(array_unique(array_filter(array_map(
            fn($r) => strpos($r['type'], 'scenario_') === 0 ? (int)$r['ref_id'] : 0, $rows))));
        $scenarios = [];
        $held = [];
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            foreach ($db->fetchAll(
                "SELECT id, uniqid, title, game_type, scenario_type, status, data, client_id, validated_languages FROM scenarios WHERE id IN ($in)",
                $ids
            ) as $s) {
                $scenarios[(int)$s['id']] = $s;
            }
            foreach ($db->fetchAll("SELECT DISTINCT scenario_id FROM client_scenarios WHERE client_id = ? AND scenario_id IN ($in)",
                array_merge([$clientId], $ids)) as $g) {
                $held[(int)$g['scenario_id']] = true;
            }
        }
        $premiumPlayground = $apps['playground'] && ($client['license_type'] ?? '') === 'premium';

        $items = [];
        $byScenario = []; // scenario id => index in $items, for merging
        $releaseSeen = [];
        $availableTypes = null;
        foreach ($rows as $r) {
            $payload = json_decode($r['payload'] ?? 'null', true) ?: [];
            switch ($r['type']) {
                case 'scenario_published':
                case 'scenario_go':
                case 'scenario_spot': {
                    $app = $r['type'] === 'scenario_published' ? 'playground' : substr($r['type'], 9);
                    if (!$apps[$app]) break;
                    $s = $scenarios[(int)$r['ref_id']] ?? null;
                    if (!$s || ($s['status'] ?? '') !== 'published' || !self::isProduct($s)) break;
                    if (in_array($s['game_type'] ?? '', $disabledTypes, true)) break;
                    $sid = (int)$s['id'];
                    if ($clientLang !== null && !isset($held[$sid]) && !ScenarioLanguages::hasVisibleLanguage($db, $s, $clientId, $clientLang)) break;
                    if ($app !== 'playground' && empty(self::gameMeta($s['data'])['adaptable_' . $app])) break;

                    if (isset($byScenario[$sid])) {
                        $i = $byScenario[$sid];
                        if (abs(strtotime($items[$i]['created_at']) - strtotime($r['created_at'])) <= self::MERGE_SECONDS) {
                            if (!in_array($app, $items[$i]['apps'], true)) $items[$i]['apps'][] = $app;
                            break;
                        }
                    }
                    $ownsIt = isset($held[$sid]) || ($premiumPlayground && $app === 'playground');
                    $items[] = [
                        'key' => 'n' . $r['id'],
                        'type' => 'scenario',
                        'created_at' => $r['created_at'],
                        'title' => $s['title'],
                        'game_type' => $s['game_type'],
                        'apps' => [$app],
                        'link' => $ownsIt && $s['uniqid'] ? '/my/scenarios/' . $s['uniqid'] : '/my/catalog',
                    ];
                    $byScenario[$sid] = count($items) - 1;
                    break;
                }
                case 'playground_release': {
                    $version = (string)($payload['version'] ?? '');
                    $channel = (string)($payload['channel'] ?? 'stable');
                    if (!$apps['playground'] || ($channel === 'test' && !$tester)) break;
                    if (isset($releaseSeen["$channel:$version"])) break;
                    $releaseSeen["$channel:$version"] = true;
                    if (!self::releaseVisible($db, $version, $channel, $androidVisible)) break;
                    $items[] = [
                        'key' => 'n' . $r['id'],
                        'type' => 'release',
                        'created_at' => $r['created_at'],
                        'version' => $version,
                        'channel' => $channel,
                        'link' => '/my/releases',
                    ];
                    break;
                }
                case 'game_type': {
                    $code = (string)($payload['code'] ?? '');
                    // Still usable now (same resolution as the detection, test layer included).
                    if (!$apps['playground'] || $code === '') break;
                    if ($availableTypes === null) $availableTypes = self::availableGameTypes($db, $clientId, $tester);
                    if (!isset($availableTypes[$code])) break;
                    $items[] = [
                        'key' => 'n' . $r['id'],
                        'type' => 'game_type',
                        'created_at' => $r['created_at'],
                        'code' => $code,
                        'name' => (string)($payload['name'] ?? $code),
                        'link' => '/my/catalog',
                    ];
                    break;
                }
            }
        }
        $order = ['playground' => 0, 'go' => 1, 'spot' => 2];
        foreach ($items as &$it) {
            if (isset($it['apps'])) usort($it['apps'], fn($a, $b) => $order[$a] <=> $order[$b]);
        }
        unset($it);
        return $items;
    }

    /** Taghunter's updates on the licensee's equipment requests (Commandes). */
    private static function orderItems($db, int $clientId): array {
        try {
            $rows = $db->fetchAll(
                "SELECT e.id, e.type, e.status, e.note, e.created_at, r.id AS request_id, r.number, r.kind
                 FROM order_request_events e
                 JOIN order_requests r ON r.id = e.request_id
                 WHERE r.client_id = ? AND e.actor = 'admin'
                   AND e.created_at >= DATE_SUB(NOW(), INTERVAL " . self::WINDOW_DAYS . " DAY)
                 ORDER BY e.id DESC LIMIT " . self::LIMIT,
                [$clientId]
            );
        } catch (Throwable $e) {
            return []; // Commandes not migrated
        }
        return array_map(fn($e) => [
            'key' => 'o' . $e['id'],
            'type' => 'order',
            'created_at' => $e['created_at'],
            'event' => $e['type'],          // status | edited
            'status' => $e['status'],
            'note' => $e['note'],
            'number' => $e['number'],
            'kind' => $e['kind'],
            'link' => '/my/orders/requests/' . (int)$e['request_id'],
        ], $rows);
    }

    /** The bell was opened: everything up to now is read, on every browser. */
    public static function markSeen($db, int $clientId): void {
        if (!self::migrated($db)) return;
        $db->execute(
            'INSERT INTO licensee_notification_state (client_id, seen_at) VALUES (?, NOW())
             ON DUPLICATE KEY UPDATE seen_at = NOW()',
            [$clientId]
        );
    }
}
