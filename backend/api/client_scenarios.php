<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
    return $_SESSION['user_id'];
}

function requireClientOrAdminAuth($db) {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';

    if (!empty($token)) {
        $tokenData = TokenManager::validateToken($db, $token);
        if ($tokenData) {
            $type = $tokenData['user_type'] === 'admin' ? 'admin' : 'client';
            return ['id' => $tokenData['user_id'], 'type' => $type];
        }
    }

    if (isset($_SESSION['user_id'])) {
        return ['id' => $_SESSION['user_id'], 'type' => 'admin'];
    }

    jsonResponse(['error' => 'Unauthorized'], 401);
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    switch ($action) {
    case 'add':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $response = ['error' => 'Method not allowed'];
            Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], 'add', $_SESSION['user_id'] ?? null, [], $response, 405);
            jsonResponse($response, 405);
        }

        $addAuth = requireClientOrAdminAuth($db);
        if ($addAuth['type'] !== 'admin') {
            $response = ['error' => 'Unauthorized'];
            jsonResponse($response, 403);
        }
        $userId = $addAuth['id'];
        $data = getRequestData();

        $clientId = $data['client_id'] ?? null;
        $scenarioId = $data['scenario_id'] ?? null;

        if (!$clientId || !$scenarioId) {
            $response = ['error' => 'client_id and scenario_id are required'];
            Logger::log('client_scenarios', 'POST', 'add', $userId, $data, $response, 400);
            jsonResponse($response, 400);
        }

        $clientExists = $db->fetch('SELECT id FROM clients WHERE id = ?', [$clientId]);
        if (!$clientExists) {
            $response = ['error' => 'Client not found'];
            Logger::log('client_scenarios', 'POST', 'add', $userId, $data, $response, 404);
            jsonResponse($response, 404);
        }

        $scenarioExists = $db->fetch('SELECT id FROM scenarios WHERE id = ? AND scenario_type = "product"', [$scenarioId]);
        if (!$scenarioExists) {
            $response = ['error' => 'Product scenario not found'];
            Logger::log('client_scenarios', 'POST', 'add', $userId, $data, $response, 404);
            jsonResponse($response, 404);
        }

        $exists = $db->fetch(
            'SELECT id FROM client_scenarios WHERE client_id = ? AND scenario_id = ?',
            [$clientId, $scenarioId]
        );

        if ($exists) {
            $response = ['error' => 'Scenario already added to this client'];
            Logger::log('client_scenarios', 'POST', 'add', $userId, $data, $response, 400);
            jsonResponse($response, 400);
        }

        $db->execute(
            'INSERT INTO client_scenarios (client_id, scenario_id, granted_by) VALUES (?, ?, ?)',
            [$clientId, $scenarioId, $userId]
        );

        $response = ['message' => 'Scenario added to client successfully'];
        Logger::log('client_scenarios', 'POST', 'add', $userId, $data, $response, 200);
        jsonResponse($response);
        break;

    case 'remove':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $response = ['error' => 'Method not allowed'];
            Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], 'remove', $_SESSION['user_id'] ?? null, [], $response, 405);
            jsonResponse($response, 405);
        }

        $auth = requireClientOrAdminAuth($db);
        if ($auth['type'] !== 'admin') {
            $response = ['error' => 'Unauthorized'];
            jsonResponse($response, 403);
        }
        $userId = $auth['id'];
        $data = getRequestData();

        $clientId = $data['client_id'] ?? null;
        $scenarioId = $data['scenario_id'] ?? null;

        if (!$clientId || !$scenarioId) {
            $response = ['error' => 'client_id and scenario_id are required'];
            Logger::log('client_scenarios', 'POST', 'remove', $userId, $data, $response, 400);
            jsonResponse($response, 400);
        }

        $db->execute(
            'DELETE FROM client_scenarios WHERE client_id = ? AND scenario_id = ?',
            [$clientId, $scenarioId]
        );

        $response = ['message' => 'Scenario removed from client successfully'];
        Logger::log('client_scenarios', 'POST', 'remove', $userId, $data, $response, 200);
        jsonResponse($response);
        break;

    case 'list':
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            $response = ['error' => 'Method not allowed'];
            Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], 'list', null, [], $response, 405);
            jsonResponse($response, 405);
        }

        $auth = requireClientOrAdminAuth($db);
        $clientId = $_GET['client_id'] ?? null;

        if ($auth['type'] === 'client') {
            $clientId = $auth['id'];
        }

        if (!$clientId) {
            $response = ['error' => 'client_id is required'];
            Logger::log('client_scenarios', 'GET', 'list', $auth['id'], [], $response, 400);
            jsonResponse($response, 400);
        }

        if ($auth['type'] === 'client' && $clientId !== $auth['id']) {
            jsonResponse(['error' => 'Unauthorized'], 403);
        }

        $client = $db->fetch('SELECT license_type FROM clients WHERE id = ?', [$clientId]);
        $isPremium = $client && $client['license_type'] === 'premium';

        if ($isPremium) {
            $scenarios = $db->fetchAll(
                'SELECT s.id, s.title, s.description, s.uniqid, s.game_type, s.scenario_type, s.status,
                        IFNULL(s.version, "1.0") as version, s.medias, s.client_id, s.created_at, s.updated_at,
                        s.created_at as granted_at, NULL as granted_by, NULL as granted_by_email,
                        (SELECT COUNT(*) FROM scenario_files sf WHERE sf.scenario_id = s.id) as files_count
                 FROM scenarios s
                 WHERE s.scenario_type = "product"
                 ORDER BY s.created_at DESC'
            );
        } else {
            $scenarios = $db->fetchAll(
                'SELECT s.id, s.title, s.description, s.uniqid, s.game_type, s.scenario_type, s.status,
                        IFNULL(s.version, "1.0") as version, s.medias, s.client_id, s.created_at, s.updated_at,
                        cs.granted_at, cs.granted_by, a.email as granted_by_email,
                        (SELECT COUNT(*) FROM scenario_files sf WHERE sf.scenario_id = s.id) as files_count
                 FROM client_scenarios cs
                 JOIN scenarios s ON cs.scenario_id = s.id
                 LEFT JOIN admin_users a ON cs.granted_by = a.id
                 WHERE cs.client_id = ?
                 UNION ALL
                 SELECT s.id, s.title, s.description, s.uniqid, s.game_type, s.scenario_type, s.status,
                        IFNULL(s.version, "1.0") as version, s.medias, s.client_id, s.created_at, s.updated_at,
                        s.created_at as granted_at, s.created_by as granted_by, NULL as granted_by_email,
                        (SELECT COUNT(*) FROM scenario_files sf WHERE sf.scenario_id = s.id) as files_count
                 FROM scenarios s
                 WHERE s.client_id = ?
                   AND s.scenario_type != "product"
                   AND s.id NOT IN (
                       SELECT scenario_id FROM client_scenarios WHERE client_id = ?
                   )
                 ORDER BY granted_at DESC',
                [$clientId, $clientId, $clientId]
            );
        }

        $scenarios = array_map(function($s) {
            $s['has_zip_files'] = (int)($s['files_count'] ?? 0) > 0;
            $s['files_count'] = (int)($s['files_count'] ?? 0);
            return $s;
        }, $scenarios);

        $response = ['data' => $scenarios];
        Logger::log('client_scenarios', 'GET', 'list', $auth['id'], ['client_id' => $clientId], $response, 200);
        jsonResponse($response);
        break;

    default:
        $response = ['error' => 'Invalid action'];
        Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], $action, $_SESSION['user_id'] ?? null, [], $response, 400);
        jsonResponse($response, 400);
    }
} catch (Exception $e) {
    $response = ['error' => 'Server error: ' . $e->getMessage()];
    Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], $response, 500);
    jsonResponse($response, 500);
}
