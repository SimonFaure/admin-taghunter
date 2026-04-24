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

function respond($payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function requireAuth() {
    if (isset($_SESSION['user_id'])) {
        return ['user_id' => $_SESSION['user_id'], 'user_type' => $_SESSION['user_type'] ?? 'admin'];
    }
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
        if ($tokenData) return $tokenData;
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
];

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
    requireAuth();

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

            if (!empty($body['returning'])) {
                $firstId = $pdo->lastInsertId();
                if ($firstId) {
                    $affected = $stmt->rowCount();
                    $select = $pdo->prepare("SELECT * FROM $table WHERE id >= ? AND id < ?");
                    $select->execute([$firstId, $firstId + $affected]);
                    $returned = $select->fetchAll(PDO::FETCH_ASSOC);
                } else {
                    $returned = [];
                }
                respond(['data' => $returned, 'error' => null]);
            }
            respond(['data' => ['affected' => $stmt->rowCount()], 'error' => null]);
        }

        case 'update': {
            $values = $body['values'] ?? null;
            if (!is_array($values) || count($values) === 0) {
                respond(['error' => 'update: values required'], 400);
            }
            $params = [];
            $setClauses = [];
            foreach ($values as $col => $val) {
                $col = safeIdent($col);
                $setClauses[] = "$col = ?";
                $params[] = normalizeValue($val);
            }
            $whereSql = buildWhere($body['where'] ?? [], $params);
            if ($whereSql === '') respond(['error' => 'update: where is required'], 400);

            $sql = "UPDATE $table SET " . implode(',', $setClauses) . $whereSql;
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            if (!empty($body['returning'])) {
                $selParams = [];
                $selWhere = buildWhere($body['where'] ?? [], $selParams);
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
