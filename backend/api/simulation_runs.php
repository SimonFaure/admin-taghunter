<?php
// Playground game simulator: test runs + verdicts (coverage tracking).
// Design: memory project_playground_game_simulator. Table: simulation_runs
// (backend/database/add_simulation_runs.sql - run BEFORE deploying this file).
//
// Actions:
//   record      POST  Playground (tester): store one run + its verdict
//   list        GET   Playground (tester): every recorded run (shared coverage)
//   admin_list  GET   Studio admin: every run with licensee + device labels
//   admin_delete POST Studio admin: delete runs by id ({ids: [..]})
//   admin_set_triage POST Studio admin: mark runs new / analysed / resolved
//                    ({ids: [..], status, note?}) - add_simulation_runs_triage.sql
//   admin_set_parent POST Studio admin: link runs as retries of a run, or unlink
//                    ({ids: [..], parent_id: N|null}) - add_simulation_runs_retries.sql
//   admin_import     POST Studio admin: update runs from an edited export
//                    ({rows: [{id, status?, triage_note?, verdict?, note?,
//                      analysed_at?, resolved_at?, parent_run_id?}], dry_run})
//                    dry_run (default) only reports the changes per run.
//
// Playground access is limited to tester installs: the effective update
// channel (device override, else the client's) must be 'test'. A leaked tester
// build on a stable licensee can't read or write anything here.

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/PlaygroundAuth.php';

if (!function_exists('jsonResponse')) {
    function jsonResponse($data, $statusCode = 200) {
        http_response_code($statusCode);
        echo json_encode($data);
        exit;
    }
}

function getRequestData(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

// Same as telemetry_admin.php::requireAdminAuth (token first, session fallback).
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

/** Playground client on the 'test' update channel (device override wins). */
function requireTesterClient($db): array {
    $client = requirePlaygroundClient($db);
    $row = $db->fetch(
        'SELECT c.update_channel AS client_channel, d.update_channel AS device_channel
           FROM clients c
           LEFT JOIN devices d ON d.id = ?
          WHERE c.id = ?',
        [$client['device_id'] ?: 0, $client['id']]
    );
    $channel = ($row && !empty($row['device_channel'])) ? $row['device_channel'] : ($row['client_channel'] ?? 'stable');
    if ($channel !== 'test') {
        jsonResponse(['error' => 'Forbidden - simulation runs are for tester installs only'], 403);
    }
    return $client;
}

const SIM_VERDICTS = ['pass', 'fail', 'partial'];
const SIM_TRIAGE = ['new', 'analysed', 'resolved'];

/**
 * Would making $parentId the parent of $childId create a loop? Walks up from
 * the proposed parent; $pending overrides parent links not saved yet (import).
 */
function wouldCycle($db, int $childId, int $parentId, array $pending = []): bool {
    $seen = 0;
    $p = $parentId;
    while ($p !== null && $seen++ < 10000) {
        if ($p === $childId) return true;
        if (array_key_exists($p, $pending)) {
            $p = $pending[$p];
            continue;
        }
        $row = $db->fetch('SELECT parent_run_id FROM simulation_runs WHERE id = ?', [$p]);
        $p = ($row && $row['parent_run_id'] !== null) ? (int)$row['parent_run_id'] : null;
    }
    return false;
}

function runExists($db, int $id): bool {
    return (bool)$db->fetch('SELECT id FROM simulation_runs WHERE id = ?', [$id]);
}

/**
 * Parse an imported date: ISO / "Y-m-d H:i:s" (our export) or "d/m/Y H:i"
 * (Excel FR reformat). Returns "Y-m-d H:i:s", null for empty, false if invalid.
 */
function parseImportDate($v) {
    $v = trim((string)$v);
    if ($v === '') return null;
    foreach (['Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d', 'd/m/Y H:i:s', 'd/m/Y H:i', 'd/m/Y', 'Y-m-d\TH:i:s', 'Y-m-d\TH:i'] as $f) {
        $d = DateTime::createFromFormat('!' . $f, $v);
        if ($d && $d->format($f) === $v) return $d->format('Y-m-d H:i:s');
    }
    $t = strtotime($v);
    return $t === false ? false : date('Y-m-d H:i:s', $t);
}

/** Two datetimes equal to the minute (Excel drops seconds on re-save). */
function sameMinute($a, $b): bool {
    if ($a === null || $b === null) return $a === $b;
    return substr((string)$a, 0, 16) === substr((string)$b, 0, 16);
}

const SIM_TRIAGE_ALIASES = ['analyzed' => 'analysed', 'analysé' => 'analysed', 'résolu' => 'resolved', 'nouveau' => 'new'];

/** Validated, de-duplicated positive run ids from a request body. */
function requestIds(array $d): array {
    $ids = array_values(array_unique(array_filter(
        array_map('intval', (array)($d['ids'] ?? [])),
        fn($id) => $id > 0
    )));
    if (count($ids) === 0) jsonResponse(['error' => 'ids is required'], 400);
    if (count($ids) > 5000) jsonResponse(['error' => 'Too many ids'], 400);
    return $ids;
}

function runColumns(): string {
    return 'r.id, r.client_id, r.device_id, r.game_type, r.config_key, r.config_json,
            r.scenario_uniqid, r.scenario_title, r.app_version, r.seed, r.speed,
            r.devices_count, r.teams_count, r.reads_total, r.reads_done, r.read_errors,
            r.verdict, r.note, r.tester_name, r.created_at, r.parent_run_id, r.triage_status';
}

function decodeRuns(array $rows): array {
    foreach ($rows as &$r) {
        $r['config'] = json_decode($r['config_json'] ?? '{}', true) ?: new stdClass();
        unset($r['config_json']);
        foreach (['id', 'client_id', 'seed', 'speed', 'devices_count', 'teams_count', 'reads_total', 'reads_done', 'read_errors'] as $k) {
            $r[$k] = (int)$r[$k];
        }
        $r['device_id'] = $r['device_id'] !== null ? (int)$r['device_id'] : null;
        $r['parent_run_id'] = isset($r['parent_run_id']) && $r['parent_run_id'] !== null ? (int)$r['parent_run_id'] : null;
    }
    return $rows;
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($action) {
        case 'record': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $client = requireTesterClient($db);
            $d = getRequestData();

            $gameType = strtolower(trim((string)($d['game_type'] ?? '')));
            $configKey = trim((string)($d['config_key'] ?? ''));
            $config = $d['config'] ?? null;
            $verdict = (string)($d['verdict'] ?? '');
            $appVersion = trim((string)($d['app_version'] ?? ''));
            if ($gameType === '' || $configKey === '' || !is_array($config) || $appVersion === ''
                || !in_array($verdict, SIM_VERDICTS, true)) {
                jsonResponse(['error' => 'game_type, config_key, config, app_version and verdict (pass|fail|partial) are required'], 400);
            }
            if (strlen($configKey) > 512) jsonResponse(['error' => 'config_key too long'], 400);

            $int = fn($k, $def = 0) => isset($d[$k]) ? (int)$d[$k] : $def;
            $str = fn($k, $max) => isset($d[$k]) && $d[$k] !== '' ? mb_substr((string)$d[$k], 0, $max) : null;
            // "Retry this run" on the Playground: the new run is a child of it.
            $parentId = isset($d['parent_run_id']) && (int)$d['parent_run_id'] > 0 ? (int)$d['parent_run_id'] : null;
            if ($parentId !== null && !runExists($db, $parentId)) $parentId = null;

            $db->execute(
                'INSERT INTO simulation_runs
                    (client_id, device_id, game_type, config_key, config_json, scenario_uniqid, scenario_title,
                     app_version, seed, speed, devices_count, teams_count, reads_total, reads_done, read_errors,
                     verdict, note, tester_name, parent_run_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $client['id'],
                    $client['device_id'] ?: null,
                    $gameType,
                    $configKey,
                    json_encode($config),
                    $str('scenario_uniqid', 64),
                    $str('scenario_title', 255),
                    mb_substr($appVersion, 0, 32),
                    $int('seed'),
                    max(1, $int('speed', 1)),
                    max(1, $int('devices_count', 1)),
                    $int('teams_count'),
                    $int('reads_total'),
                    $int('reads_done'),
                    $int('read_errors'),
                    $verdict,
                    $str('note', 5000),
                    $str('tester_name', 255),
                    $parentId,
                ]
            );
            jsonResponse(['id' => (int)$db->lastInsertId()]);
        }

        case 'list': {
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            requireTesterClient($db);
            // Coverage is shared across every tester install, not per client.
            $params = [];
            $where = '';
            if (!empty($_GET['game_type'])) {
                $where = 'WHERE r.game_type = ?';
                $params[] = strtolower((string)$_GET['game_type']);
            }
            $rows = $db->fetchAll(
                'SELECT ' . runColumns() . " FROM simulation_runs r $where ORDER BY r.created_at DESC, r.id DESC LIMIT 5000",
                $params
            );
            jsonResponse(['runs' => decodeRuns($rows)]);
        }

        case 'admin_list': {
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            requireAdminAuth();
            $rows = $db->fetchAll(
                'SELECT ' . runColumns() . ', c.name AS client_name, c.email AS client_email,
                        COALESCE(d.display_name, d.device_label) AS device_label,
                        r.analysed_at, r.resolved_at, r.triage_note,
                        aa.name AS analysed_by_name, ar.name AS resolved_by_name
                   FROM simulation_runs r
                   LEFT JOIN clients c ON c.id = r.client_id
                   LEFT JOIN devices d ON d.id = r.device_id
                   LEFT JOIN admin_users aa ON aa.id = r.analysed_by
                   LEFT JOIN admin_users ar ON ar.id = r.resolved_by
                  ORDER BY r.created_at DESC, r.id DESC
                  LIMIT 5000'
            );
            jsonResponse(['runs' => decodeRuns($rows)]);
        }

        case 'admin_set_triage': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $adminId = requireAdminAuth();
            $d = getRequestData();
            $ids = requestIds($d);
            $status = (string)($d['status'] ?? '');
            if (!in_array($status, SIM_TRIAGE, true)) {
                jsonResponse(['error' => 'status must be new, analysed or resolved'], 400);
            }
            // The note is only touched when sent (bulk status changes keep notes).
            $noteSql = '';
            $noteParams = [];
            if (array_key_exists('note', $d)) {
                $note = trim((string)$d['note']);
                $noteSql = ', triage_note = ?';
                $noteParams[] = $note === '' ? null : mb_substr($note, 0, 5000);
            }
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            if ($status === 'new') {
                // Back to untriaged: forget both steps.
                $sql = "UPDATE simulation_runs
                           SET triage_status = 'new', analysed_at = NULL, analysed_by = NULL,
                               resolved_at = NULL, resolved_by = NULL$noteSql
                         WHERE id IN ($placeholders)";
                $params = array_merge($noteParams, $ids);
            } elseif ($status === 'analysed') {
                // Keeps the first analysis stamp; un-resolves a resolved run.
                $sql = "UPDATE simulation_runs
                           SET triage_status = 'analysed',
                               analysed_at = COALESCE(analysed_at, NOW()),
                               analysed_by = COALESCE(analysed_by, ?),
                               resolved_at = NULL, resolved_by = NULL$noteSql
                         WHERE id IN ($placeholders)";
                $params = array_merge([$adminId], $noteParams, $ids);
            } else {
                // Resolved implies analysed: stamp the analysis too when skipped.
                $sql = "UPDATE simulation_runs
                           SET triage_status = 'resolved',
                               analysed_at = COALESCE(analysed_at, NOW()),
                               analysed_by = COALESCE(analysed_by, ?),
                               resolved_at = COALESCE(resolved_at, NOW()),
                               resolved_by = COALESCE(resolved_by, ?)$noteSql
                         WHERE id IN ($placeholders)";
                $params = array_merge([$adminId, $adminId], $noteParams, $ids);
            }
            $stmt = $db->query($sql, $params);
            jsonResponse(['updated' => $stmt->rowCount()]);
        }

        case 'admin_delete': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            requireAdminAuth();
            $ids = requestIds(getRequestData());
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $stmt = $db->query("DELETE FROM simulation_runs WHERE id IN ($placeholders)", $ids);
            jsonResponse(['deleted' => $stmt->rowCount()]);
        }

        case 'admin_set_parent': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            requireAdminAuth();
            $d = getRequestData();
            $ids = requestIds($d);
            $parentId = isset($d['parent_id']) && $d['parent_id'] !== null && (int)$d['parent_id'] > 0
                ? (int)$d['parent_id'] : null;
            if ($parentId !== null && !runExists($db, $parentId)) {
                jsonResponse(['error' => "Run #$parentId does not exist"], 400);
            }
            $updated = 0;
            $errors = [];
            foreach ($ids as $id) {
                if ($parentId !== null && ($parentId === $id || wouldCycle($db, $id, $parentId))) {
                    $errors[] = ['id' => $id, 'error' => "#$id can't be a retry of #$parentId (loop)"];
                    continue;
                }
                $updated += $db->query('UPDATE simulation_runs SET parent_run_id = ? WHERE id = ?', [$parentId, $id])->rowCount();
            }
            jsonResponse(['updated' => $updated, 'errors' => $errors]);
        }

        case 'admin_import': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $adminId = requireAdminAuth();
            $d = getRequestData();
            $rows = $d['rows'] ?? null;
            if (!is_array($rows) || count($rows) === 0) jsonResponse(['error' => 'rows is required'], 400);
            if (count($rows) > 5000) jsonResponse(['error' => 'Too many rows'], 400);
            $dryRun = !array_key_exists('dry_run', $d) || (bool)$d['dry_run'];

            $results = [];
            $pendingParents = []; // id => parent (or null) decided earlier in this file
            $updated = 0;
            foreach ($rows as $in) {
                if (!is_array($in)) continue;
                $id = (int)($in['id'] ?? 0);
                $res = ['id' => $id, 'changes' => new stdClass(), 'error' => null];
                $cur = $id > 0 ? $db->fetch(
                    'SELECT id, verdict, note, triage_status, analysed_at, analysed_by, resolved_at, resolved_by,
                            triage_note, parent_run_id
                       FROM simulation_runs WHERE id = ?', [$id]) : null;
                if (!$cur) {
                    $res['error'] = $id > 0 ? "Run #$id not found" : 'Missing id';
                    $results[] = $res;
                    continue;
                }
                $has = fn($k) => array_key_exists($k, $in);
                $txt = fn($k, $max) => ($t = trim((string)($in[$k] ?? ''))) === '' ? null : mb_substr($t, 0, $max);
                $next = $cur;
                $errs = [];

                if ($has('verdict') && trim((string)$in['verdict']) !== '') {
                    $v = strtolower(trim((string)$in['verdict']));
                    if (in_array($v, SIM_VERDICTS, true)) $next['verdict'] = $v;
                    else $errs[] = "verdict '$v' must be pass, partial or fail";
                }
                if ($has('note')) $next['note'] = $txt('note', 5000);
                if ($has('triage_note')) $next['triage_note'] = $txt('triage_note', 5000);

                $datesGiven = false;
                foreach (['analysed_at', 'resolved_at'] as $k) {
                    if (!$has($k)) continue;
                    $parsed = parseImportDate($in[$k]);
                    if ($parsed === false) {
                        $errs[] = "$k '" . $in[$k] . "' is not a date";
                        continue;
                    }
                    $datesGiven = true;
                    // Same minute = unchanged (Excel drops the seconds).
                    if (!sameMinute($parsed, $cur[$k])) $next[$k] = $parsed;
                }

                $status = null;
                if ($has('status') && trim((string)$in['status']) !== '') {
                    $sv = mb_strtolower(trim((string)$in['status']));
                    $sv = SIM_TRIAGE_ALIASES[$sv] ?? $sv;
                    if (in_array($sv, SIM_TRIAGE, true)) $status = $sv;
                    else $errs[] = "status '$sv' must be new, analysed or resolved";
                } elseif ($datesGiven) {
                    // Dates without a status: the dates decide.
                    $status = $next['resolved_at'] ? 'resolved' : ($next['analysed_at'] ? 'analysed' : 'new');
                }
                $now = date('Y-m-d H:i:s');
                if ($status === 'new') {
                    $next['analysed_at'] = null;
                    $next['resolved_at'] = null;
                } elseif ($status === 'analysed') {
                    $next['analysed_at'] = $next['analysed_at'] ?? $now;
                    $next['resolved_at'] = null;
                } elseif ($status === 'resolved') {
                    $next['analysed_at'] = $next['analysed_at'] ?? $now;
                    $next['resolved_at'] = $next['resolved_at'] ?? $now;
                }
                if ($status !== null) $next['triage_status'] = $status;
                // Who: the importing admin for a step stamped here, nobody once cleared.
                foreach (['analysed' => 'analysed_by', 'resolved' => 'resolved_by'] as $step => $by) {
                    if ($next[$step . '_at'] === null) $next[$by] = null;
                    elseif ($cur[$step . '_at'] === null || $next[$by] === null) $next[$by] = $next[$by] ?? $adminId;
                }

                if ($has('parent_run_id')) {
                    $pv = trim((string)$in['parent_run_id']);
                    $pid = $pv === '' || (int)ltrim($pv, '#') <= 0 ? null : (int)ltrim($pv, '#');
                    if ($pid !== null && $pid === $id) $errs[] = "a run can't be a retry of itself";
                    elseif ($pid !== null && !runExists($db, $pid)) $errs[] = "parent run #$pid not found";
                    elseif ($pid !== null && wouldCycle($db, $id, $pid, $pendingParents)) $errs[] = "#$id as a retry of #$pid makes a loop";
                    else $next['parent_run_id'] = $pid;
                }

                if ($errs) {
                    $res['error'] = implode('; ', $errs);
                    $results[] = $res;
                    continue;
                }
                $changes = [];
                foreach (['verdict', 'note', 'triage_status', 'analysed_at', 'resolved_at', 'triage_note', 'parent_run_id'] as $k) {
                    $a = $cur[$k] === null ? null : (string)$cur[$k];
                    $b = $next[$k] === null ? null : (string)$next[$k];
                    if (in_array($k, ['analysed_at', 'resolved_at'], true) ? !sameMinute($a, $b) : $a !== $b) {
                        $changes[$k] = [$a, $b];
                    }
                }
                if (array_key_exists('parent_run_id', $changes)) $pendingParents[$id] = $next['parent_run_id'] === null ? null : (int)$next['parent_run_id'];
                $res['changes'] = $changes ?: new stdClass();
                if (!$dryRun && $changes) {
                    $db->query(
                        'UPDATE simulation_runs
                            SET verdict = ?, note = ?, triage_status = ?, analysed_at = ?, analysed_by = ?,
                                resolved_at = ?, resolved_by = ?, triage_note = ?, parent_run_id = ?
                          WHERE id = ?',
                        [
                            $next['verdict'], $next['note'], $next['triage_status'] ?? 'new',
                            $next['analysed_at'], $next['analysed_by'], $next['resolved_at'], $next['resolved_by'],
                            $next['triage_note'], $next['parent_run_id'], $id,
                        ]
                    );
                    $updated++;
                }
                $results[] = $res;
            }
            jsonResponse(['dry_run' => $dryRun, 'updated' => $updated, 'rows' => $results]);
        }

        default:
            jsonResponse(['error' => 'Unknown action'], 400);
    }
} catch (Throwable $e) {
    error_log('[simulation_runs] ' . $e->getMessage());
    jsonResponse(['error' => 'Server error'], 500);
}
