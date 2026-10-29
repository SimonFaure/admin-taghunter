<?php
// Licensee-customer types (admin Settings): the list licensees pick from when
// describing a customer. Table: customer_types (add_licensee_customers.sql).
//
// GET  list     any studio token (licensee or admin) -> types, sorted;
//               admins also get `in_use` (number of customers per type)
// POST create   admin {label_fr, label_en?, label_es?} -> code derived from label_fr
// POST update   admin {code, label_fr?, label_en?, label_es?, active?}
// POST reorder  admin {codes: [...]} -> sort_order follows that order
// POST delete   admin {code} -> 409 IN_USE when customers still have it
//               (deactivate it instead: hidden from pickers, customers keep it)

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();
session_write_close();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/LicenseeCustomers.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

// ['type' => 'admin'|'client', 'id' => int]
function requireTypesAuth($db): array {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (!empty($token)) {
        $tokenData = TokenManager::validateToken($db, $token);
        if ($tokenData) {
            return [
                'type' => ($tokenData['user_type'] ?? '') === 'admin' ? 'admin' : 'client',
                'id' => (int)$tokenData['user_id'],
            ];
        }
    }
    if (isset($_SESSION['user_id'])) {
        return ['type' => 'admin', 'id' => (int)$_SESSION['user_id']];
    }
    jsonResponse(['error' => 'Unauthorized'], 401);
}

function shapeType(array $r): array {
    return [
        'code' => $r['code'],
        'label_fr' => $r['label_fr'],
        'label_en' => $r['label_en'],
        'label_es' => $r['label_es'],
        'sort_order' => (int)$r['sort_order'],
        'active' => (int)$r['active'] === 1,
    ] + (isset($r['in_use']) ? ['in_use' => (int)$r['in_use']] : []);
}

$action = $_GET['action'] ?? 'list';

try {
    $db = Database::getInstance();
    $auth = requireTypesAuth($db);
    $method = $_SERVER['REQUEST_METHOD'];

    if ($action === 'list') {
        if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
        $rows = $auth['type'] === 'admin'
            ? $db->fetchAll(
                'SELECT t.*, (SELECT COUNT(*) FROM licensee_customers c
                              WHERE c.customer_type = t.code AND c.merged_into_id IS NULL AND c.deleted_at IS NULL) AS in_use
                 FROM customer_types t ORDER BY t.sort_order, t.label_fr'
            )
            : $db->fetchAll('SELECT * FROM customer_types ORDER BY sort_order, label_fr');
        jsonResponse(['types' => array_map('shapeType', $rows)]);
    }

    if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
    if ($auth['type'] !== 'admin') jsonResponse(['error' => 'Forbidden'], 403);
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $label = fn($k) => LicenseeCustomers::str($data[$k] ?? null, 80);

    switch ($action) {
        case 'create': {
            $fr = $label('label_fr');
            if ($fr === null) jsonResponse(['error' => 'French label is required'], 400);
            $base = LicenseeCustomers::typeCodeFromLabel($fr);
            $code = $base;
            for ($i = 2; $db->fetch('SELECT code FROM customer_types WHERE code = ?', [$code]); $i++) {
                $code = $base . '_' . $i;
            }
            $max = $db->fetch('SELECT COALESCE(MAX(sort_order), 0) AS m FROM customer_types');
            $db->execute(
                'INSERT INTO customer_types (code, label_fr, label_en, label_es, sort_order) VALUES (?, ?, ?, ?, ?)',
                [$code, $fr, $label('label_en'), $label('label_es'), (int)$max['m'] + 10]
            );
            Logger::log('customer_types', 'POST', 'create', $auth['id'], ['code' => $code]);
            jsonResponse(['type' => shapeType($db->fetch('SELECT * FROM customer_types WHERE code = ?', [$code]))]);
        }

        case 'update': {
            $code = (string)($data['code'] ?? '');
            if (!$db->fetch('SELECT code FROM customer_types WHERE code = ?', [$code])) {
                jsonResponse(['error' => 'Type not found'], 404);
            }
            $sets = [];
            $args = [];
            if (array_key_exists('label_fr', $data)) {
                if ($label('label_fr') === null) jsonResponse(['error' => 'French label is required'], 400);
                $sets[] = 'label_fr = ?';
                $args[] = $label('label_fr');
            }
            foreach (['label_en', 'label_es'] as $k) {
                if (array_key_exists($k, $data)) {
                    $sets[] = "$k = ?";
                    $args[] = $label($k);
                }
            }
            if (array_key_exists('active', $data)) {
                $sets[] = 'active = ?';
                $args[] = !empty($data['active']) ? 1 : 0;
            }
            if ($sets) {
                $db->execute('UPDATE customer_types SET ' . implode(', ', $sets) . ' WHERE code = ?', array_merge($args, [$code]));
            }
            Logger::log('customer_types', 'POST', 'update', $auth['id'], ['code' => $code]);
            jsonResponse(['type' => shapeType($db->fetch('SELECT * FROM customer_types WHERE code = ?', [$code]))]);
        }

        case 'reorder': {
            $codes = is_array($data['codes'] ?? null) ? array_values($data['codes']) : [];
            foreach ($codes as $i => $code) {
                $db->execute('UPDATE customer_types SET sort_order = ? WHERE code = ?', [($i + 1) * 10, (string)$code]);
            }
            Logger::log('customer_types', 'POST', 'reorder', $auth['id'], ['count' => count($codes)]);
            jsonResponse(['success' => true]);
        }

        case 'delete': {
            $code = (string)($data['code'] ?? '');
            $n = $db->fetch('SELECT COUNT(*) AS n FROM licensee_customers WHERE customer_type = ?', [$code]);
            if ((int)$n['n'] > 0) {
                jsonResponse(['error' => 'Type in use', 'code' => 'IN_USE', 'in_use' => (int)$n['n']], 409);
            }
            $db->execute('DELETE FROM customer_types WHERE code = ?', [$code]);
            Logger::log('customer_types', 'POST', 'delete', $auth['id'], ['code' => $code]);
            jsonResponse(['success' => true]);
        }

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    Logger::log('customer_types', $_SERVER['REQUEST_METHOD'] ?? 'GET', $action, null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
