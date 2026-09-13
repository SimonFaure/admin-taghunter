<?php
// Admin-side read endpoints for the telemetry data uploaded via telemetry.php.
//
// Auth model differs from telemetry.php: this is for the Studio admin UI,
// which runs in a browser with a PHP session cookie. Mirrors the pattern used
// by clients.php / logs.php (requireAuth on $_SESSION['user_id']).
//
// Actions:
//   list_devices          GET   all devices (or ?client_id=N), with error_count_7d, attached client
//   device_detail         GET   one device + its recent errors + game launches
//   list_errors           GET   fleet-wide error feed, grouped by fingerprint
//   error_detail          GET   every report row behind one feed group (drill-down)
//
// All actions are read-only. No writes from the admin UI; the playground is
// the only writer (via telemetry.php).

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/DeviceManager.php';
require_once __DIR__ . '/../utils/TokenManager.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

// Token takes precedence; the session is only a fallback. The studio admin is
// token-based (secure_auth.php sets no PHP session), so without bridging the
// X-Auth-Token here these read-only admin views 401 unless a sibling endpoint
// happened to set the session first. Mirrors scenarios.php::requireAuth().
function requireAdminAuth(): int {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        if (strpos($header, 'Bearer ') === 0) {
            $header = substr($header, 7);
        }
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
        if ($tokenData && ($tokenData['user_type'] ?? '') === 'admin') {
            // Overwrite any stale session with the authoritative token values.
            $_SESSION['user_id'] = $tokenData['user_id'];
            $_SESSION['user_type'] = 'admin';
            return (int)$tokenData['user_id'];
        }
    }

    if (isset($_SESSION['user_id']) && ($_SESSION['user_type'] ?? '') === 'admin') {
        return (int)$_SESSION['user_id'];
    }

    jsonResponse(['error' => 'Unauthorized'], 401);
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    // Every action requires an authenticated admin. Per-action method checks
    // live in each case below: the read actions are GET, rename_device is POST.
    requireAdminAuth();

    switch ($action) {

        case 'list_devices': {
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            // One row per device with the most-recent client info and a
            // 7-day error count. Sort by last_seen so freshly-active devices
            // surface first. Optional ?client_id= scopes the list to one
            // client (used by the Studio client detail page).
            $clientFilter = isset($_GET['client_id']) ? (int)$_GET['client_id'] : 0;
            $where = '';
            $params = [];
            if ($clientFilter > 0) {
                $where = 'WHERE d.client_id = ?';
                $params[] = $clientFilter;
            }

            $rows = $db->fetchAll(
                "SELECT
                    d.id,
                    d.device_uniq,
                    d.device_label,
                    d.display_name,
                    d.os,
                    d.os_version,
                    d.playground_version AS app_version,
                    d.cards_file_version,
                    d.is_default_mother,
                    d.operator_only,
                    d.update_channel,
                    d.billing_reprieve_until,
                    d.last_seen_at,
                    d.created_at,
                    d.updated_at,
                    c.id AS client_id,
                    c.email AS client_email,
                    c.name AS client_name,
                    (SELECT COUNT(DISTINCT e.fingerprint_hash) FROM error_reports e
                       WHERE e.device_id = d.id
                         AND e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    ) AS error_count_7d,
                    (SELECT COUNT(*) FROM device_sync_failures sf
                       WHERE sf.device_id = d.id AND sf.status = 'failed'
                    ) AS active_sync_failures
                 FROM devices d
                 LEFT JOIN clients c ON c.id = d.client_id
                 $where
                 ORDER BY d.last_seen_at DESC, d.created_at DESC",
                $params
            );

            jsonResponse(['data' => $rows]);
            break;
        }

        case 'device_detail': {
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $deviceId = isset($_GET['device_id']) ? (int)$_GET['device_id'] : 0;
            if ($deviceId <= 0) {
                jsonResponse(['error' => 'device_id is required'], 400);
            }

            $device = $db->fetch(
                "SELECT
                    d.id, d.device_uniq, d.device_label, d.display_name, d.os, d.os_version,
                    d.playground_version AS app_version,
                    d.last_seen_at, d.created_at, d.updated_at,
                    d.cards_file_version, d.operator_only,
                    c.id AS client_id, c.email AS client_email, c.name AS client_name
                 FROM devices d
                 LEFT JOIN clients c ON c.id = d.client_id
                 WHERE d.id = ?",
                [$deviceId]
            );
            if (!$device) {
                jsonResponse(['error' => 'Device not found'], 404);
            }

            // Recent errors grouped by fingerprint (latest 50 distinct
            // fingerprints, ordered by last occurrence).
            $errors = $db->fetchAll(
                "SELECT
                    fingerprint_hash,
                    MAX(error_message) AS error_message,
                    MAX(stack_trace) AS stack_trace,
                    SUM(occurrence_count) AS total_count,
                    MIN(first_seen_at) AS first_seen_at,
                    MAX(last_seen_at) AS last_seen_at,
                    MAX(app_version) AS app_version
                 FROM error_reports
                 WHERE device_id = ?
                 GROUP BY fingerprint_hash
                 ORDER BY MAX(last_seen_at) DESC
                 LIMIT 50",
                [$deviceId]
            );

            $launches = $db->fetchAll(
                "SELECT id, scenario_uniqid, duration_seconds, teams_count,
                        started_at, ended_at, created_at
                 FROM game_launches
                 WHERE device_id = ?
                 ORDER BY started_at DESC, created_at DESC
                 LIMIT 50",
                [$deviceId]
            );

            // Per-item content-sync failures: all currently-failed items, plus
            // any that recovered in the last 7 days. Failed sort to the top.
            // Guarded - an un-migrated studio simply returns an empty list.
            $syncFailures = [];
            try {
                $syncFailures = $db->fetchAll(
                    "SELECT item_key, kind, label, version, status, error_type, http_status,
                            error_message, times_failed, resolution,
                            first_failed_at, last_failed_at, resolved_at
                     FROM device_sync_failures
                     WHERE device_id = ?
                       AND (status = 'failed' OR resolved_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
                     ORDER BY (status = 'failed') DESC, last_failed_at DESC
                     LIMIT 200",
                    [$deviceId]
                );
            } catch (Exception $e) {
                error_log('[telemetry_admin.device_detail] sync_failures: ' . $e->getMessage());
            }

            jsonResponse([
                'data' => [
                    'device' => $device,
                    'errors' => $errors,
                    'launches' => $launches,
                    'sync_failures' => $syncFailures,
                ]
            ]);
            break;
        }

        case 'list_errors': {
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            // Fleet-wide error feed, grouped by client + device + fingerprint so
            // each row identifies the specific device that reported the error.
            // This lets the admin UI show the device name and sort by client /
            // device. A bug hitting several devices now yields one row per
            // device (rows with a NULL device_id collapse to one "unknown"
            // group per client+fingerprint).
            //
            // ?days=N widens/narrows the window (default 30, max 365).
            $days = isset($_GET['days']) ? (int)$_GET['days'] : 30;
            if ($days <= 0) $days = 30;
            if ($days > 365) $days = 365;

            $rows = $db->fetchAll(
                "SELECT
                    e.client_id,
                    e.device_id,
                    e.fingerprint_hash,
                    MAX(e.error_message) AS error_message,
                    MAX(e.stack_trace) AS stack_trace,
                    SUM(e.occurrence_count) AS total_count,
                    COUNT(*) AS report_count,
                    MIN(e.first_seen_at) AS first_seen_at,
                    MAX(e.last_seen_at) AS last_seen_at,
                    MAX(e.app_version) AS app_version,
                    MAX(e.id) AS latest_report_id,
                    c.email AS client_email,
                    c.name AS client_name,
                    d.device_label,
                    d.display_name,
                    d.device_uniq,
                    d.os AS device_os,
                    d.os_version AS device_os_version,
                    d.playground_version AS device_current_version
                 FROM error_reports e
                 LEFT JOIN clients c ON c.id = e.client_id
                 LEFT JOIN devices d ON d.id = e.device_id
                 WHERE e.created_at >= DATE_SUB(NOW(), INTERVAL $days DAY)
                 GROUP BY e.client_id, e.device_id, e.fingerprint_hash
                 ORDER BY MAX(e.last_seen_at) DESC
                 LIMIT 200"
            );

            // The grouped MAX() above picks a lexicographically-largest message
            // / stack, which is arbitrary when a fingerprint drifts. Pull the
            // newest actual report row per group (MAX(id) - the table is
            // append-only with an auto-increment id) so the feed shows the most
            // recent occurrence verbatim, and attach context_json, which the
            // ingest has always stored but this endpoint never returned. That
            // context carries the crash's origin (window.error /
            // unhandledrejection / rust_panic / sync_cycle + phase), which is
            // usually the single most useful field for triage.
            $latestIds = [];
            foreach ($rows as $r) {
                if (!empty($r['latest_report_id'])) $latestIds[] = (int)$r['latest_report_id'];
            }
            $latestById = [];
            if (count($latestIds) > 0) {
                $ph = implode(',', array_fill(0, count($latestIds), '?'));
                $latest = $db->fetchAll(
                    "SELECT id, event_uuid, error_message, stack_trace, app_version,
                            occurrence_count, context_json, created_at
                     FROM error_reports WHERE id IN ($ph)",
                    $latestIds
                );
                foreach ($latest as $l) {
                    $latestById[(int)$l['id']] = $l;
                }
            }
            foreach ($rows as &$r) {
                $l = $latestById[(int)($r['latest_report_id'] ?? 0)] ?? null;
                if ($l === null) {
                    $r['context_json'] = null;
                    continue;
                }
                if (($l['error_message'] ?? '') !== '') {
                    $r['error_message'] = $l['error_message'];
                }
                // A newer report without a stack shouldn't hide an older one
                // that had one.
                if ($l['stack_trace'] !== null && $l['stack_trace'] !== '') {
                    $r['stack_trace'] = $l['stack_trace'];
                }
                $r['context_json'] = $l['context_json'];
                $r['latest_event_uuid'] = $l['event_uuid'];
                $r['latest_reported_at'] = $l['created_at'];
            }
            unset($r);

            jsonResponse(['data' => $rows]);
            break;
        }

        case 'error_detail': {
            // Drill-down for one feed row: every individual report row behind a
            // (client, device, fingerprint) group, newest first. Each row is one
            // delivered outbox event, so its context_json / app_version /
            // occurrence_count describe that specific episode rather than the
            // whole group.
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $clientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : 0;
            $fingerprint = (string)($_GET['fingerprint'] ?? '');
            if ($clientId <= 0 || strlen($fingerprint) !== 64 || !ctype_xdigit($fingerprint)) {
                jsonResponse(['error' => 'client_id and a 64-hex fingerprint are required'], 400);
            }
            // device_id is part of the group key; an absent/empty value means
            // the "unknown device" group (device_id IS NULL), which is distinct
            // from any real device.
            $rawDevice = $_GET['device_id'] ?? '';
            $hasDevice = ($rawDevice !== '' && $rawDevice !== 'none' && (int)$rawDevice > 0);

            $sql = "SELECT id, event_uuid, device_id, app_version, error_message, stack_trace,
                           occurrence_count, first_seen_at, last_seen_at, context_json, created_at
                    FROM error_reports
                    WHERE client_id = ? AND fingerprint_hash = ?
                      AND device_id " . ($hasDevice ? '= ?' : 'IS NULL') . "
                    ORDER BY id DESC
                    LIMIT 100";
            $params = [$clientId, $fingerprint];
            if ($hasDevice) $params[] = (int)$rawDevice;

            jsonResponse(['data' => $db->fetchAll($sql, $params)]);
            break;
        }

        case 'rename_device': {
            // Admin sets the display_name of any client's device. Unlike the
            // playground/client rename (devices.php / secure_auth), this is not
            // scoped to the caller - an admin may rename any device by id.
            // device_label (the OS hostname) is left untouched.
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $deviceId = isset($data['device_id']) ? (int)$data['device_id'] : 0;
            if ($deviceId <= 0) {
                jsonResponse(['error' => 'device_id is required'], 400);
            }

            // Normalise: trim, empty → null (clears the name), enforce max length.
            $displayName = $data['display_name'] ?? null;
            if ($displayName !== null) {
                $displayName = trim((string)$displayName);
                if ($displayName === '') {
                    $displayName = null;
                } elseif (mb_strlen($displayName) > 120) {
                    jsonResponse(['error' => 'display_name max 120 chars'], 400);
                }
            }

            $ok = DeviceManager::setDisplayName($db, $deviceId, $displayName);
            if (!$ok) {
                jsonResponse(['error' => 'Device not found'], 404);
            }

            jsonResponse(['success' => true, 'display_name' => $displayName]);
            break;
        }

        case 'set_device_channel': {
            // Admin per-device app-update channel override. An empty/"inherit"
            // value clears it (the device falls back to its client's channel).
            // Design: project_client_tester_update_channel.
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $deviceId = isset($data['device_id']) ? (int)$data['device_id'] : 0;
            if ($deviceId <= 0) {
                jsonResponse(['error' => 'device_id is required'], 400);
            }

            // null / '' / 'inherit' -> clear the override; otherwise constrain to
            // the known channel set ('test' is the only non-stable override that
            // makes sense to pin per-device).
            $raw = $data['update_channel'] ?? null;
            $channel = null;
            if ($raw !== null && $raw !== '' && $raw !== 'inherit') {
                $channel = in_array($raw, ['stable', 'test'], true) ? $raw : 'stable';
            }

            $exists = $db->fetch('SELECT id FROM devices WHERE id = ?', [$deviceId]);
            if (!$exists) {
                jsonResponse(['error' => 'Device not found'], 404);
            }
            $db->query('UPDATE devices SET update_channel = ? WHERE id = ?', [$channel, $deviceId]);

            jsonResponse(['success' => true, 'update_channel' => $channel]);
            break;
        }

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    error_log('[telemetry_admin] ' . $e->getMessage());
    jsonResponse(['error' => $e->getMessage()], 500);
}
