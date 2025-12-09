<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

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

        $userId = requireAuth();
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

        $userId = requireAuth();
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
            Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], 'list', $_SESSION['user_id'] ?? null, [], $response, 405);
            jsonResponse($response, 405);
        }

        $userId = requireAuth();
        $clientId = $_GET['client_id'] ?? null;

        if (!$clientId) {
            $response = ['error' => 'client_id is required'];
            Logger::log('client_scenarios', 'GET', 'list', $userId, [], $response, 400);
            jsonResponse($response, 400);
        }

        $scenarios = $db->fetchAll(
            'SELECT s.*, cs.granted_at, cs.granted_by, a.email as granted_by_email
             FROM client_scenarios cs
             JOIN scenarios s ON cs.scenario_id = s.id
             LEFT JOIN admin_users a ON cs.granted_by = a.id
             WHERE cs.client_id = ?
             ORDER BY cs.granted_at DESC',
            [$clientId]
        );

        $response = ['data' => $scenarios];
        Logger::log('client_scenarios', 'GET', 'list', $userId, ['client_id' => $clientId], $response, 200);
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
