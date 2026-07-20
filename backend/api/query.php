<?php
// Generic query dispatcher for the Creator's db-adapter (PhpQueryBuilder).
// Exposes a whitelisted subset of tables and operations. Authenticated.
//
// Request (POST JSON):
//   {
//     "table": "scenarios",
//     "op": "select" | "insert" | "update" | "delete" | "upsert",
//     "select": "*" | "id, name, …",           // select only
//     "where": [["col", "eq", value], …],       // select/update/delete
//     "order": [["col", "asc" | "desc"], …],    // select only
//     "limit": 100,                              // select only
//     "single": true,                            // select: expect exactly one row (error if 0)
//     "maybeSingle": true,                       // select: expect 0 or 1 row (null if 0)
//     "values": {...} | [{...}, ...],            // insert/update/upsert
//     "onConflict": "meta",                      // upsert only: unique column
//     "returning": true                          // insert/update/upsert: return affected rows
//   }
//
// Supported operators: eq, neq, gt, gte, lt, lte, in, is.
// "is" expects null / "null" / "not null".

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ScenarioHashes.php';

function respond($payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function requireAuth() {
    // Bearer/X-Auth-Token takes precedence - a stale session cookie from a
    // prior admin login must not shadow the current user's token.
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
        if ($tokenData) return $tokenData;
    }
    // Fallback: legacy session auth. Requires BOTH user_id and user_type to be
    // set - no defaulting user_type to 'admin' (the old bug that let clients
    // escalate if their session predated this code).
    if (isset($_SESSION['user_id']) && isset($_SESSION['user_type'])) {
        return ['user_id' => $_SESSION['user_id'], 'user_type' => $_SESSION['user_type']];
    }
    respond(['error' => 'Authentication required'], 401);
}

// Whitelist: which tables Creator may read/write via this endpoint.
$ALLOWED_TABLES = [
    'scenarios',
    'patterns',
    'pattern_items',
    'layouts',
    'default_config',
    'api_logs',
    'import_logs',
    'si_balises',
    'client_scenarios',
];

// Tables only admin tokens may touch through this endpoint. Client tokens get 403
// before any SQL runs. client_scenarios is admin-only because it's the grant join
// table - admins manage which clients can access which product scenarios.
$ADMIN_ONLY_TABLES = [
    'client_scenarios',
];

// Columns a non-admin token may not set/change via this endpoint. A client
// cannot promote their scenario to a product (client_id = NULL, scenario_type
// = 'product') or masquerade ownership on patterns/layouts. Admin tokens
// bypass all of this - they own the data model.
$PROTECTED_WRITE_COLUMNS = [
    'scenarios' => ['client_id', 'scenario_type'],
    'patterns'  => ['owner_type', 'owner_id'],
    'layouts'   => ['owner_type', 'owner_id'],
];

// On insert/upsert, force protected columns to safe values for non-admin tokens.
function enforceInsertAcl(string $table, array $row, array $tokenData): array {
    global $PROTECTED_WRITE_COLUMNS;
    if (($tokenData['user_type'] ?? '') === 'admin') return $row;
    if (!isset($PROTECTED_WRITE_COLUMNS[$table])) return $row;
    $userId = $tokenData['user_id'] ?? null;
    if ($table === 'scenarios') {
        $row['client_id'] = $userId;
        $row['scenario_type'] = 'custom';
    } elseif ($table === 'patterns' || $table === 'layouts') {
        $row['owner_type'] = 'client';
        $row['owner_id'] = $userId;
    }
    return $row;
}

// Returns ['column', 'value'] for the row-ownership predicate that pins UPDATE/DELETE
// to rows owned by the current non-admin user, or null if the table is unrestricted.
// Admin tokens always return null (no extra constraint - admins write anything).
function ownerPredicate(string $table, array $tokenData): ?array {
    if (($tokenData['user_type'] ?? '') === 'admin') return null;
    $userId = $tokenData['user_id'] ?? null;
    if ($userId === null) return null;
    if ($table === 'scenarios') return ['client_id', $userId];
    if ($table === 'patterns' || $table === 'layouts') return ['owner_id', $userId];
    return null;
}

// On update, reject any write that touches protected columns from a non-admin token.
function enforceUpdateAcl(string $table, array $values, array $tokenData): array {
    global $PROTECTED_WRITE_COLUMNS;
    if (($tokenData['user_type'] ?? '') === 'admin') return $values;
    if (!isset($PROTECTED_WRITE_COLUMNS[$table])) return $values;
    foreach ($PROTECTED_WRITE_COLUMNS[$table] as $col) {
        if (array_key_exists($col, $values)) {
            respond(['error' => "Only admins can modify '$col' on '$table'"], 403);
        }
    }
    return $values;
}

$OP_MAP = [
    'eq'  => '=',
    'neq' => '!=',
    'gt'  => '>',
    'gte' => '>=',
    'lt'  => '<',
    'lte' => '<=',
];

function safeIdent(string $s): string {
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $s)) {
        respond(['error' => "Invalid identifier: $s"], 400);
    }
    return $s;
}

function buildWhere(array $where, array &$params): string {
    global $OP_MAP;
    if (empty($where)) return '';
    $clauses = [];
    foreach ($where as $cond) {
        if (!is_array($cond) || count($cond) < 3) {
            respond(['error' => 'Invalid where clause'], 400);
        }
        [$col, $op, $val] = $cond;
        $col = safeIdent($col);
        $op = strtolower($op);

        if (isset($OP_MAP[$op])) {
            $clauses[] = "$col {$OP_MAP[$op]} ?";
            $params[] = normalizeValue($val);
        } elseif ($op === 'in') {
            if (!is_array($val) || count($val) === 0) {
                respond(['error' => "'in' requires a non-empty array"], 400);
            }
            $placeholders = implode(',', array_fill(0, count($val), '?'));
            $clauses[] = "$col IN ($placeholders)";
            foreach ($val as $v) $params[] = normalizeValue($v);
        } elseif ($op === 'is') {
            $v = strtolower((string)$val);
            if ($val === null || $v === 'null') {
                $clauses[] = "$col IS NULL";
            } elseif ($v === 'not null') {
                $clauses[] = "$col IS NOT NULL";
            } else {
                respond(['error' => "'is' expects null or 'not null'"], 400);
            }
        } else {
            respond(['error' => "Unsupported operator: $op"], 400);
        }
    }
    return ' WHERE ' . implode(' AND ', $clauses);
}

function normalizeValue($v) {
    if (is_array($v) || is_object($v)) return json_encode($v);
    if (is_bool($v)) return $v ? 1 : 0;
    return $v;
}

// Refresh data_hash/content_hash for the given scenarios after a write through
// this generic endpoint. The studio editor saves scenarios via db-adapter
// (this file), NOT scenarios.php, so without this the incremental-sync content
// hash never changes and already-synced playgrounds never re-download edits.
// Never let a hashing hiccup fail the write - the manifest builder has a
// NULL-hash fallback.
function recomputeScenarioHashesSafe(PDO $pdo, array $uniqids): void {
    foreach (array_unique(array_filter($uniqids)) as $uniqid) {
        try {
            ScenarioHashes::recompute($pdo, (string)$uniqid);
        } catch (Throwable $e) {
            // Best-effort; swallow so the save still succeeds.
        }
    }
}

// Resolve the uniqids an UPDATE/DELETE-style where (+ owner predicate) targets,
// so we can recompute their hashes after the write.
function scenarioUniqidsForWhere(PDO $pdo, array $where, ?array $owner): array {
    $params = [];
    $whereSql = buildWhere($where, $params);
    if ($owner !== null) {
        $whereSql .= " AND $owner[0] = ?";
        $params[] = $owner[1];
    }
    $sel = $pdo->prepare("SELECT uniqid FROM scenarios$whereSql");
    $sel->execute($params);
    return $sel->fetchAll(PDO::FETCH_COLUMN);
}

function buildOrder(array $order): string {
    if (empty($order)) return '';
    $parts = [];
    foreach ($order as $o) {
        if (!is_array($o) || count($o) < 1) continue;
        $col = safeIdent($o[0]);
        $dir = strtolower($o[1] ?? 'asc');
        if ($dir !== 'asc' && $dir !== 'desc') {
            respond(['error' => "Invalid order direction: $dir"], 400);
        }
        $parts[] = "$col " . strtoupper($dir);
    }
    return $parts ? ' ORDER BY ' . implode(', ', $parts) : '';
}

function buildSelect($select): string {
    if ($select === null || $select === '' || $select === '*') return '*';
    if (!is_string($select)) {
        respond(['error' => 'select must be a string'], 400);
    }
    // Comma-separated columns, each a safe identifier.
    $cols = array_map('trim', explode(',', $select));
    $cols = array_map('safeIdent', $cols);
    return implode(', ', $cols);
}

try {
    $tokenData = requireAuth();

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond(['error' => 'Method not allowed'], 405);
    }

    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) {
        respond(['error' => 'Invalid JSON body'], 400);
    }

    $table = $body['table'] ?? '';
    $op    = $body['op']    ?? '';
    if (!in_array($table, $ALLOWED_TABLES, true)) {
        respond(['error' => "Table not allowed: $table"], 403);
    }
    if (in_array($table, $ADMIN_ONLY_TABLES, true) && ($tokenData['user_type'] ?? '') !== 'admin') {
        respond(['error' => "Table is admin-only: $table"], 403);
    }
    $table = safeIdent($table); // redundant but defensive

    $db   = Database::getInstance();
    $pdo  = $db->getConnection();

    switch ($op) {
        case 'select': {
            $select = buildSelect($body['select'] ?? '*');
            $params = [];
            $whereSql = buildWhere($body['where'] ?? [], $params);
            $orderSql = buildOrder($body['order'] ?? []);
            $limit    = isset($body['limit']) ? (int)$body['limit'] : null;

            $sql = "SELECT $select FROM $table$whereSql$orderSql";
            if ($limit !== null && $limit > 0) $sql .= " LIMIT $limit";

            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            if (!empty($body['single'])) {
                if (count($rows) === 0) {
                    respond(['data' => null, 'error' => ['message' => 'No rows found']]);
                }
                respond(['data' => $rows[0], 'error' => null]);
            }
            if (!empty($body['maybeSingle'])) {
                respond(['data' => $rows[0] ?? null, 'error' => null]);
            }
            respond(['data' => $rows, 'error' => null]);
        }

        case 'insert': {
            $values = $body['values'] ?? null;
            if ($values === null) respond(['error' => 'insert: values required'], 400);
            $rows = isset($values[0]) && is_array($values[0]) ? $values : [$values];
            if (count($rows) === 0) respond(['error' => 'insert: no rows'], 400);

            // Non-admin tokens: force protected columns to safe values.
            $rows = array_map(fn($r) => enforceInsertAcl($table, $r, $tokenData), $rows);

            $cols = array_map('safeIdent', array_keys($rows[0]));
            $placeholders = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';

            $params = [];
            $valueTuples = [];
            foreach ($rows as $row) {
                foreach ($cols as $c) $params[] = normalizeValue($row[$c] ?? null);
                $valueTuples[] = $placeholders;
            }
            $sql = "INSERT INTO $table (" . implode(',', $cols) . ") VALUES " . implode(',', $valueTuples);
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            // Capture the auto-increment id + affected count NOW, before any
            // follow-up statement runs. recomputeScenarioHashesSafe() issues an
            // UPDATE on `scenarios` (an auto-increment table), and in MySQL such
            // an UPDATE resets lastInsertId() to 0 - reading it afterwards would
            // lose the id and make `returning` come back empty ("No rows
            // returned") even though the row was inserted fine.
            $firstId = $pdo->lastInsertId();
            $affected = $stmt->rowCount();

            if ($table === 'scenarios') {
                recomputeScenarioHashesSafe($pdo, array_column($rows, 'uniqid'));
            }

            if (!empty($body['returning'])) {
                if ($firstId) {
                    $select = $pdo->prepare("SELECT * FROM $table WHERE id >= ? AND id < ?");
                    $select->execute([$firstId, $firstId + $affected]);
                    $returned = $select->fetchAll(PDO::FETCH_ASSOC);
                } else {
                    $returned = [];
                }
                respond(['data' => $returned, 'error' => null]);
            }
            respond(['data' => ['affected' => $affected], 'error' => null]);
        }

        case 'update': {
            $values = $body['values'] ?? null;
            if (!is_array($values) || count($values) === 0) {
                respond(['error' => 'update: values required'], 400);
            }
            // Non-admin tokens cannot modify protected columns.
            $values = enforceUpdateAcl($table, $values, $tokenData);
            $params = [];
            $setClauses = [];
            foreach ($values as $col => $val) {
                $col = safeIdent($col);
                $setClauses[] = "$col = ?";
                $params[] = normalizeValue($val);
            }
            $whereSql = buildWhere($body['where'] ?? [], $params);
            if ($whereSql === '') respond(['error' => 'update: where is required'], 400);

            // Row-level ownership: a non-admin token can only update its own rows.
            $owner = ownerPredicate($table, $tokenData);
            if ($owner !== null) {
                $whereSql .= " AND $owner[0] = ?";
                $params[] = $owner[1];
            }

            // Capture the targeted uniqids BEFORE recompute (the where still
            // matches - we only changed non-key columns like data/version).
            $scenarioUniqids = $table === 'scenarios'
                ? scenarioUniqidsForWhere($pdo, $body['where'] ?? [], $owner)
                : [];

            $sql = "UPDATE $table SET " . implode(',', $setClauses) . $whereSql;
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            if ($table === 'scenarios') {
                recomputeScenarioHashesSafe($pdo, $scenarioUniqids);
            }

            if (!empty($body['returning'])) {
                $selParams = [];
                $selWhere = buildWhere($body['where'] ?? [], $selParams);
                if ($owner !== null) {
                    $selWhere .= " AND $owner[0] = ?";
                    $selParams[] = $owner[1];
                }
                $sel = $pdo->prepare("SELECT * FROM $table$selWhere");
                $sel->execute($selParams);
                respond(['data' => $sel->fetchAll(PDO::FETCH_ASSOC), 'error' => null]);
            }
            respond(['data' => ['affected' => $stmt->rowCount()], 'error' => null]);
        }

        case 'delete': {
            $params = [];
            $whereSql = buildWhere($body['where'] ?? [], $params);
            if ($whereSql === '') respond(['error' => 'delete: where is required'], 400);

            // Row-level ownership: a non-admin token can only delete its own rows.
            $owner = ownerPredicate($table, $tokenData);
            if ($owner !== null) {
                $whereSql .= " AND $owner[0] = ?";
                $params[] = $owner[1];
            }

            $sql = "DELETE FROM $table$whereSql";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            respond(['data' => ['affected' => $stmt->rowCount()], 'error' => null]);
        }

        case 'upsert': {
            $values = $body['values'] ?? null;
            if ($values === null) respond(['error' => 'upsert: values required'], 400);
            $rows = isset($values[0]) && is_array($values[0]) ? $values : [$values];
            if (count($rows) === 0) respond(['error' => 'upsert: no rows'], 400);

            // Non-admin tokens: force protected columns to safe values on both insert and update paths.
            $rows = array_map(fn($r) => enforceInsertAcl($table, $r, $tokenData), $rows);

            $onConflict = $body['onConflict'] ?? null;
            if ($onConflict !== null) safeIdent($onConflict); // validation side-effect

            $cols = array_map('safeIdent', array_keys($rows[0]));
            $placeholders = '(' . implode(',', array_fill(0, count($cols), '?')) . ')';

            $params = [];
            $tuples = [];
            foreach ($rows as $row) {
                foreach ($cols as $c) $params[] = normalizeValue($row[$c] ?? null);
                $tuples[] = $placeholders;
            }
            $updateList = [];
            foreach ($cols as $c) {
                if ($onConflict !== null && $c === $onConflict) continue;
                $updateList[] = "$c = VALUES($c)";
            }
            $sql = "INSERT INTO $table (" . implode(',', $cols) . ") VALUES "
                 . implode(',', $tuples)
                 . " ON DUPLICATE KEY UPDATE " . implode(',', $updateList);
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            if ($table === 'scenarios') {
                recomputeScenarioHashesSafe($pdo, array_column($rows, 'uniqid'));
            }

            if (!empty($body['returning']) && $onConflict !== null) {
                $keys = array_column($rows, $onConflict);
                if (count($keys) > 0) {
                    $in = implode(',', array_fill(0, count($keys), '?'));
                    $sel = $pdo->prepare("SELECT * FROM $table WHERE $onConflict IN ($in)");
                    $sel->execute($keys);
                    respond(['data' => $sel->fetchAll(PDO::FETCH_ASSOC), 'error' => null]);
                }
            }
            respond(['data' => ['affected' => $stmt->rowCount()], 'error' => null]);
        }

        default:
            respond(['error' => "Unsupported op: $op"], 400);
    }
} catch (Throwable $e) {
    respond(['data' => null, 'error' => ['message' => $e->getMessage()]], 500);
}
