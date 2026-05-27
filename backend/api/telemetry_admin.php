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
//
// All actions are read-only. No writes from the admin UI; the playground is
// the only writer (via telemetry.php).

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/DeviceManager.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

function requireAdminAuth(): int {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
    return (int)$_SESSION['user_id'];
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
                    d.last_seen_at,
                    d.created_at,
                    d.updated_at,
                    c.id AS client_id,
                    c.email AS client_email,
                    c.name AS client_name,
                    (SELECT COUNT(DISTINCT e.fingerprint_hash) FROM error_reports e
                       WHERE e.device_id = d.id
                         AND e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    ) AS error_count_7d
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
                    d.cards_file_version,
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

            jsonResponse([
                'data' => [
                    'device' => $device,
                    'errors' => $errors,
                    'launches' => $launches,
                ]
            ]);
            break;
        }

        case 'list_errors': {
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            // Fleet-wide error feed, grouped by client + fingerprint so a bug
            // affecting many devices collapses to one row showing total count
            // and how many devices saw it.
            $rows = $db->fetchAll(
                "SELECT
                    e.client_id,
                    e.fingerprint_hash,
                    MAX(e.error_message) AS error_message,
                    MAX(e.stack_trace) AS stack_trace,
                    SUM(e.occurrence_count) AS total_count,
                    COUNT(DISTINCT e.device_id) AS device_count,
                    MIN(e.first_seen_at) AS first_seen_at,
                    MAX(e.last_seen_at) AS last_seen_at,
                    MAX(e.app_version) AS app_version,
                    c.email AS client_email,
                    c.name AS client_name
                 FROM error_reports e
                 LEFT JOIN clients c ON c.id = e.client_id
                 WHERE e.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                 GROUP BY e.client_id, e.fingerprint_hash
                 ORDER BY MAX(e.last_seen_at) DESC
                 LIMIT 200"
            );

            jsonResponse(['data' => $rows]);
            break;
        }

        case 'rename_device': {
            // Admin sets the display_name of any client's device. Unlike the
            // playground/client rename (devices.php / secure_auth), this is not
            // scoped to the caller — an admin may rename any device by id.
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

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    error_log('[telemetry_admin] ' . $e->getMessage());
    jsonResponse(['error' => $e->getMessage()], 500);
}
