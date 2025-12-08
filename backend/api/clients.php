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

function formatClientData($client) {
    if (!$client) return $client;

    if (isset($client['billing_up_to_date'])) {
        $client['billing_up_to_date'] = (bool)$client['billing_up_to_date'];
    }

    return $client;
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'list', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();

            $clients = $db->fetchAll(
                'SELECT * FROM clients ORDER BY created_at DESC'
            );

            $clients = array_map('formatClientData', $clients);

            $response = ['data' => $clients];
            Logger::log('clients', 'GET', 'list', $userId, [], $response, 200);
            jsonResponse($response);
            break;

        case 'get':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'get', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();

            $id = $_GET['id'] ?? '';
            if (empty($id)) {
                $response = ['error' => 'Client ID is required'];
                Logger::log('clients', 'GET', 'get', $userId, ['id' => ''], $response, 400);
                jsonResponse($response, 400);
            }

            $client = $db->fetch(
                'SELECT * FROM clients WHERE id = ?',
                [$id]
            );

            if (!$client) {
                $response = ['error' => 'Client not found'];
                Logger::log('clients', 'GET', 'get', $userId, ['id' => $id], $response, 404);
                jsonResponse($response, 404);
            }

            $client = formatClientData($client);

            $response = ['data' => $client];
            Logger::log('clients', 'GET', 'get', $userId, ['id' => $id], $response, 200);
            jsonResponse($response);
            break;

        case 'create':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'create', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();
            $data = getRequestData();

            $requiredFields = ['email', 'name'];
            foreach ($requiredFields as $field) {
                if (empty($data[$field])) {
                    $response = ['error' => ucfirst($field) . ' is required'];
                    Logger::log('clients', 'POST', 'create', $userId, $data, $response, 400);
                    jsonResponse($response, 400);
                }
            }

            $existingClient = $db->fetch(
                'SELECT id FROM clients WHERE email = ?',
                [$data['email']]
            );

            if ($existingClient) {
                $response = ['error' => 'A client with this email already exists'];
                Logger::log('clients', 'POST', 'create', $userId, $data, $response, 400);
                jsonResponse($response, 400);
            }

            $fields = [
                'email' => $data['email'],
                'name' => $data['name'],
                'company' => $data['company'] ?? null,
                'phone' => $data['phone'] ?? null,
                'notes' => $data['notes'] ?? null,
                'avatar_url' => $data['avatar_url'] ?? null,
                'license_type' => $data['license_type'] ?? 'access',
                'billing_up_to_date' => (isset($data['billing_up_to_date']) ? $data['billing_up_to_date'] : true) ? 1 : 0,
                'created_by' => $userId,
            ];

            $placeholders = array_fill(0, count($fields), '?');
            $columns = implode(', ', array_keys($fields));
            $values = array_values($fields);

            $sql = "INSERT INTO clients ($columns) VALUES (" . implode(', ', $placeholders) . ")";
            $clientId = $db->execute($sql, $values);

            $client = $db->fetch(
                'SELECT * FROM clients WHERE id = ?',
                [$clientId]
            );

            $client = formatClientData($client);

            $response = ['data' => $client];
            Logger::log('clients', 'POST', 'create', $userId, $data, $response, 200);
            jsonResponse($response);
            break;

        case 'update':
            if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'update', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();
            $data = getRequestData();

            $id = $data['id'] ?? '';
            if (empty($id)) {
                $response = ['error' => 'Client ID is required'];
                Logger::log('clients', 'PUT', 'update', $userId, $data, $response, 400);
                jsonResponse($response, 400);
            }

            $existingClient = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$id]
            );

            if (!$existingClient) {
                $response = ['error' => 'Client not found'];
                Logger::log('clients', 'PUT', 'update', $userId, $data, $response, 404);
                jsonResponse($response, 404);
            }

            $updates = [];
            $values = [];

            $allowedFields = ['email', 'name', 'company', 'phone', 'notes', 'avatar_url', 'license_type', 'billing_up_to_date'];
            foreach ($allowedFields as $field) {
                if (array_key_exists($field, $data)) {
                    $updates[] = "$field = ?";
                    $value = $data[$field];
                    if ($field === 'billing_up_to_date') {
                        $value = $value ? 1 : 0;
                    }
                    $values[] = $value;
                }
            }

            if (empty($updates)) {
                $response = ['error' => 'No fields to update'];
                Logger::log('clients', 'PUT', 'update', $userId, $data, $response, 400);
                jsonResponse($response, 400);
            }

            $values[] = $id;
            $sql = "UPDATE clients SET " . implode(', ', $updates) . " WHERE id = ?";
            $db->execute($sql, $values);

            $client = $db->fetch(
                'SELECT * FROM clients WHERE id = ?',
                [$id]
            );

            $client = formatClientData($client);

            $response = ['data' => $client];
            Logger::log('clients', 'PUT', 'update', $userId, $data, $response, 200);
            jsonResponse($response);
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'delete', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();

            $id = $_GET['id'] ?? '';
            if (empty($id)) {
                $response = ['error' => 'Client ID is required'];
                Logger::log('clients', 'DELETE', 'delete', $userId, ['id' => ''], $response, 400);
                jsonResponse($response, 400);
            }

            $existingClient = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$id]
            );

            if (!$existingClient) {
                $response = ['error' => 'Client not found'];
                Logger::log('clients', 'DELETE', 'delete', $userId, ['id' => $id], $response, 404);
                jsonResponse($response, 404);
            }

            $db->execute(
                'DELETE FROM clients WHERE id = ?',
                [$id]
            );

            $response = ['message' => 'Client deleted successfully'];
            Logger::log('clients', 'DELETE', 'delete', $userId, ['id' => $id], $response, 200);
            jsonResponse($response);
            break;

        default:
            $response = ['error' => 'Invalid action'];
            Logger::log('clients', $_SERVER['REQUEST_METHOD'], $action, $_SESSION['user_id'] ?? null, [], $response, 400);
            jsonResponse($response, 400);
    }
} catch (Exception $e) {
    $response = ['error' => 'Server error: ' . $e->getMessage()];
    Logger::log('clients', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], $response, 500);
    jsonResponse($response, 500);
}
