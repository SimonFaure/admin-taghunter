<?php
// Admin endpoints for licensee bug reports (Studio > Bug reports). The
// playground writes them through telemetry.php (event_type 'bug_report');
// this file only reads them and lets an admin triage them.
//
// Actions:
//   list     GET   reports, newest first; ?status=open|new|in_progress|resolved|all
//                  (default open). Snapshot left out - it can be ~1 MB each.
//   detail   GET   ?id=N  one report incl. snapshot_json, plus the error_reports
//                  of ALL the licensee's devices between game start and report.
//   update   POST  { id, status?, admin_note? }
//
// Retention: a resolved report's snapshot (team/player names) is purged 6
// months after resolution. Done lazily on `list`, so no cron is needed; the
// report row itself is kept.

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/TokenManager.php';

const BUG_REPORT_STATUSES = ['new', 'in_progress', 'resolved'];
const BUG_REPORT_SNAPSHOT_RETENTION_MONTHS = 6;

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

// Same token-then-session model as telemetry_admin.php.
function requireAdminAuth(): int {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        if (strpos($header, 'Bearer ') === 0) {
            $header = substr($header, 7);
        }
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
        if ($tokenData && ($tokenData['user_type'] ?? '') === 'admin') {
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

function purgeExpiredSnapshots(object $db): void {
    $db->query(
        'UPDATE bug_reports
            SET snapshot_json = NULL, snapshot_purged_at = NOW()
          WHERE status = ? AND snapshot_json IS NOT NULL
            AND resolved_at IS NOT NULL
            AND resolved_at < DATE_SUB(NOW(), INTERVAL ' . BUG_REPORT_SNAPSHOT_RETENTION_MONTHS . ' MONTH)',
        ['resolved']
    );
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    requireAdminAuth();

    switch ($action) {

        case 'list': {
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            try {
                purgeExpiredSnapshots($db);
            } catch (Exception $e) {
                error_log('[bug_reports_admin] purge: ' . $e->getMessage());
            }

            $status = (string)($_GET['status'] ?? 'open');
            $where = '';
            $params = [];
            if ($status === 'open') {
                $where = "WHERE b.status <> 'resolved'";
            } elseif (in_array($status, BUG_REPORT_STATUSES, true)) {
                $where = 'WHERE b.status = ?';
                $params[] = $status;
            }

            $rows = $db->fetchAll(
                "SELECT
                    b.id, b.event_uuid, b.client_id, b.device_id, b.app_version,
                    b.launched_game_id, b.game_name, b.game_type, b.scenario_uniqid,
                    b.game_started_at, b.comment, b.teams_concerned_json, b.contact,
                    b.device_role, b.snapshot_error, b.snapshot_truncated,
                    b.snapshot_purged_at, b.status, b.admin_note, b.reported_at,
                    b.resolved_at, b.created_at,
                    (b.snapshot_json IS NOT NULL) AS has_snapshot,
                    LENGTH(b.snapshot_json) AS snapshot_bytes,
                    c.name AS client_name, c.email AS client_email,
                    d.display_name AS device_display_name, d.device_label,
                    d.os AS device_os, d.os_version AS device_os_version
                 FROM bug_reports b
                 LEFT JOIN clients c ON c.id = b.client_id
                 LEFT JOIN devices d ON d.id = b.device_id
                 $where
                 ORDER BY b.id DESC
                 LIMIT 300",
                $params
            );

            $counts = $db->fetchAll('SELECT status, COUNT(*) AS n FROM bug_reports GROUP BY status');

            jsonResponse(['data' => $rows, 'counts' => $counts]);
            break;
        }

        case 'detail': {
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
            if ($id <= 0) {
                jsonResponse(['error' => 'id is required'], 400);
            }

            $row = $db->fetch('SELECT * FROM bug_reports WHERE id = ?', [$id]);
            if (!$row) {
                jsonResponse(['error' => 'Not found'], 404);
            }

            // Automatic error reports from every device of the licensee during
            // the game: a child's report only carries its own console log, the
            // mother's errors reach studio through telemetry. Window = game
            // start (or 6 h before the report when unknown) → report + 1 h,
            // since errors can be delivered a little after the report itself.
            $reportedAt = $row['reported_at'] ?: $row['created_at'];
            $from = $row['game_started_at']
                ?: date('Y-m-d H:i:s', strtotime($reportedAt) - 6 * 3600);
            $to = date('Y-m-d H:i:s', strtotime($reportedAt) + 3600);

            $errors = $db->fetchAll(
                'SELECT e.id, e.device_id, e.app_version, e.error_message, e.stack_trace,
                        e.occurrence_count, e.first_seen_at, e.last_seen_at, e.context_json,
                        d.display_name AS device_display_name, d.device_label
                   FROM error_reports e
                   LEFT JOIN devices d ON d.id = e.device_id
                  WHERE e.client_id = ?
                    AND e.last_seen_at >= ? AND e.first_seen_at <= ?
                  ORDER BY e.last_seen_at DESC
                  LIMIT 100',
                [(int)$row['client_id'], $from, $to]
            );

            jsonResponse([
                'data' => $row,
                'errors' => $errors,
                'errors_window' => ['from' => $from, 'to' => $to],
            ]);
            break;
        }

        case 'update': {
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $data = getRequestData();
            $id = isset($data['id']) ? (int)$data['id'] : 0;
            if ($id <= 0) {
                jsonResponse(['error' => 'id is required'], 400);
            }
            $current = $db->fetch('SELECT id, status FROM bug_reports WHERE id = ?', [$id]);
            if (!$current) {
                jsonResponse(['error' => 'Not found'], 404);
            }

            $sets = [];
            $params = [];
            if (array_key_exists('status', $data)) {
                $status = (string)$data['status'];
                if (!in_array($status, BUG_REPORT_STATUSES, true)) {
                    jsonResponse(['error' => 'Invalid status'], 400);
                }
                $sets[] = 'status = ?';
                $params[] = $status;
                // resolved_at drives the snapshot purge: stamped on resolve,
                // cleared on reopen so a reopened report keeps its snapshot.
                if ($status === 'resolved' && $current['status'] !== 'resolved') {
                    $sets[] = 'resolved_at = NOW()';
                } elseif ($status !== 'resolved') {
                    $sets[] = 'resolved_at = NULL';
                }
            }
            if (array_key_exists('admin_note', $data)) {
                $note = $data['admin_note'] === null ? null : trim((string)$data['admin_note']);
                $sets[] = 'admin_note = ?';
                $params[] = ($note === '' ? null : $note);
            }
            if (count($sets) === 0) {
                jsonResponse(['error' => 'Nothing to update'], 400);
            }

            $params[] = $id;
            $db->query('UPDATE bug_reports SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);

            $row = $db->fetch('SELECT id, status, admin_note, resolved_at FROM bug_reports WHERE id = ?', [$id]);
            jsonResponse(['success' => true, 'data' => $row]);
            break;
        }

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    error_log('[bug_reports_admin] ' . $e->getMessage());
    jsonResponse(['error' => $e->getMessage()], 500);
}
