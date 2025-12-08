<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

session_start();

require_once __DIR__ . '/../database/Database.php';

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
        case 'list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            requireAuth();

            $clients = $db->fetchAll(
                'SELECT * FROM clients ORDER BY created_at DESC'
            );

            jsonResponse(['data' => $clients]);
            break;

        case 'get':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            requireAuth();

            $id = $_GET['id'] ?? '';
            if (empty($id)) {
                jsonResponse(['error' => 'Client ID is required'], 400);
            }

            $client = $db->fetch(
                'SELECT * FROM clients WHERE id = ?',
                [$id]
            );

            if (!$client) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

            jsonResponse(['data' => $client]);
            break;

        case 'create':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $userId = requireAuth();
            $data = getRequestData();

            $requiredFields = ['email', 'name'];
            foreach ($requiredFields as $field) {
                if (empty($data[$field])) {
                    jsonResponse(['error' => ucfirst($field) . ' is required'], 400);
                }
            }

            $existingClient = $db->fetch(
                'SELECT id FROM clients WHERE email = ?',
                [$data['email']]
            );

            if ($existingClient) {
                jsonResponse(['error' => 'A client with this email already exists'], 400);
            }

            $fields = [
                'email' => $data['email'],
                'name' => $data['name'],
                'company' => $data['company'] ?? null,
                'phone' => $data['phone'] ?? null,
                'notes' => $data['notes'] ?? null,
                'avatar_url' => $data['avatar_url'] ?? null,
                'license_type' => $data['license_type'] ?? 'access',
                'billing_up_to_date' => isset($data['billing_up_to_date']) ? (bool)$data['billing_up_to_date'] : true,
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

            jsonResponse(['data' => $client]);
            break;

        case 'update':
            if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            requireAuth();
            $data = getRequestData();

            $id = $data['id'] ?? '';
            if (empty($id)) {
                jsonResponse(['error' => 'Client ID is required'], 400);
            }

            $existingClient = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$id]
            );

            if (!$existingClient) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

            $updates = [];
            $values = [];

            $allowedFields = ['email', 'name', 'company', 'phone', 'notes', 'avatar_url', 'license_type', 'billing_up_to_date'];
            foreach ($allowedFields as $field) {
                if (isset($data[$field])) {
                    $updates[] = "$field = ?";
                    $values[] = $data[$field];
                }
            }

            if (empty($updates)) {
                jsonResponse(['error' => 'No fields to update'], 400);
            }

            $values[] = $id;
            $sql = "UPDATE clients SET " . implode(', ', $updates) . " WHERE id = ?";
            $db->execute($sql, $values);

            $client = $db->fetch(
                'SELECT * FROM clients WHERE id = ?',
                [$id]
            );

            jsonResponse(['data' => $client]);
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            requireAuth();

            $id = $_GET['id'] ?? '';
            if (empty($id)) {
                jsonResponse(['error' => 'Client ID is required'], 400);
            }

            $existingClient = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$id]
            );

            if (!$existingClient) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

            $db->execute(
                'DELETE FROM clients WHERE id = ?',
                [$id]
            );

            jsonResponse(['message' => 'Client deleted successfully']);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
