<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../utils/Logger.php';

SecurityHeaders::set();
handleCors();

header('Content-Type: application/json');

session_start();

function jsonResponse($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

$db = new Database();
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if (!isset($_SESSION['user_id']) || $_SESSION['user_type'] !== 'admin') {
    Logger::log('client_scenarios', $method, $action, null, [], ['error' => 'Unauthorized'], 401);
    jsonResponse(['error' => 'Unauthorized'], 401);
}

switch ($action) {
    case 'add':
        if ($method !== 'POST') {
            Logger::log('client_scenarios', $method, 'add', $_SESSION['user_id'], [], ['error' => 'Method not allowed'], 405);
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $clientId = $data['client_id'] ?? null;
        $scenarioId = $data['scenario_id'] ?? null;

        if (!$clientId || !$scenarioId) {
            Logger::log('client_scenarios', $method, 'add', $_SESSION['user_id'], $data, ['error' => 'Missing required fields'], 400);
            jsonResponse(['error' => 'client_id and scenario_id are required'], 400);
        }

        $clientExists = $db->fetch('SELECT id FROM clients WHERE id = ?', [$clientId]);
        if (!$clientExists) {
            Logger::log('client_scenarios', $method, 'add', $_SESSION['user_id'], $data, ['error' => 'Client not found'], 404);
            jsonResponse(['error' => 'Client not found'], 404);
        }

        $scenarioExists = $db->fetch('SELECT id FROM scenarios WHERE id = ? AND scenario_type = "product"', [$scenarioId]);
        if (!$scenarioExists) {
            Logger::log('client_scenarios', $method, 'add', $_SESSION['user_id'], $data, ['error' => 'Product scenario not found'], 404);
            jsonResponse(['error' => 'Product scenario not found'], 404);
        }

        $exists = $db->fetch(
            'SELECT id FROM client_scenarios WHERE client_id = ? AND scenario_id = ?',
            [$clientId, $scenarioId]
        );

        if ($exists) {
            Logger::log('client_scenarios', $method, 'add', $_SESSION['user_id'], $data, ['error' => 'Already added'], 400);
            jsonResponse(['error' => 'Scenario already added to this client'], 400);
        }

        $result = $db->execute(
            'INSERT INTO client_scenarios (client_id, scenario_id, granted_by) VALUES (?, ?, ?)',
            [$clientId, $scenarioId, $_SESSION['user_id']]
        );

        if ($result) {
            $responseData = [
                'success' => true,
                'message' => 'Scenario added to client successfully'
            ];
            Logger::log('client_scenarios', $method, 'add', $_SESSION['user_id'], $data, $responseData, 200);
            jsonResponse($responseData);
        } else {
            Logger::log('client_scenarios', $method, 'add', $_SESSION['user_id'], $data, ['error' => 'Failed to add scenario'], 500);
            jsonResponse(['error' => 'Failed to add scenario to client'], 500);
        }
        break;

    case 'remove':
        if ($method !== 'POST') {
            Logger::log('client_scenarios', $method, 'remove', $_SESSION['user_id'], [], ['error' => 'Method not allowed'], 405);
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $clientId = $data['client_id'] ?? null;
        $scenarioId = $data['scenario_id'] ?? null;

        if (!$clientId || !$scenarioId) {
            Logger::log('client_scenarios', $method, 'remove', $_SESSION['user_id'], $data, ['error' => 'Missing required fields'], 400);
            jsonResponse(['error' => 'client_id and scenario_id are required'], 400);
        }

        $result = $db->execute(
            'DELETE FROM client_scenarios WHERE client_id = ? AND scenario_id = ?',
            [$clientId, $scenarioId]
        );

        $responseData = [
            'success' => true,
            'message' => 'Scenario removed from client successfully'
        ];
        Logger::log('client_scenarios', $method, 'remove', $_SESSION['user_id'], $data, $responseData, 200);
        jsonResponse($responseData);
        break;

    case 'list':
        if ($method !== 'GET') {
            Logger::log('client_scenarios', $method, 'list', $_SESSION['user_id'], [], ['error' => 'Method not allowed'], 405);
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $clientId = $_GET['client_id'] ?? null;

        if (!$clientId) {
            Logger::log('client_scenarios', $method, 'list', $_SESSION['user_id'], [], ['error' => 'Missing client_id'], 400);
            jsonResponse(['error' => 'client_id is required'], 400);
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

        Logger::log('client_scenarios', $method, 'list', $_SESSION['user_id'], ['client_id' => $clientId], ['count' => count($scenarios)], 200);
        jsonResponse($scenarios);
        break;

    default:
        Logger::log('client_scenarios', $method, $action ?: 'none', $_SESSION['user_id'], [], ['error' => 'Invalid action'], 400);
        jsonResponse(['error' => 'Invalid action'], 400);
}
