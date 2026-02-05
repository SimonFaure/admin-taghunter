<?php
session_start();

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');

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

function requireClientAuth($db) {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (strpos($token, 'Bearer ') === 0) {
        $token = substr($token, 7);
    }

    if (empty($token)) {
        jsonResponse(['error' => 'Unauthorized - Token required'], 401);
    }

    $tokenData = TokenManager::validateToken($db, $token);

    if (!$tokenData) {
        jsonResponse(['error' => 'Unauthorized - Invalid or expired token'], 401);
    }

    if ($tokenData['user_type'] !== 'client') {
        jsonResponse(['error' => 'Unauthorized - Client login required'], 403);
    }

    return $tokenData['user_id'];
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);

            $devices = $db->fetchAll(
                'SELECT * FROM devices WHERE client_id = ? ORDER BY created_at DESC',
                [$clientId]
            );

            jsonResponse(['data' => $devices]);
            break;

        case 'register':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $data = getRequestData();

            if (empty($data['device_uniq'])) {
                jsonResponse(['error' => 'device_uniq is required'], 400);
            }

            $existing = $db->fetch(
                'SELECT id FROM devices WHERE device_uniq = ?',
                [$data['device_uniq']]
            );

            if ($existing) {
                $db->query(
                    'UPDATE devices SET playground_version = ?, cards_file_version = ?, updated_at = NOW() WHERE device_uniq = ?',
                    [
                        $data['playground_version'] ?? '',
                        $data['cards_file_version'] ?? 0,
                        $data['device_uniq']
                    ]
                );
                $deviceId = $existing['id'];
            } else {
                $deviceId = $db->execute(
                    'INSERT INTO devices (client_id, playground_version, cards_file_version, device_uniq) VALUES (?, ?, ?, ?)',
                    [
                        $clientId,
                        $data['playground_version'] ?? '',
                        $data['cards_file_version'] ?? 0,
                        $data['device_uniq']
                    ]
                );
            }

            Logger::log('devices', 'POST', 'register', $clientId, ['device_uniq' => $data['device_uniq']], ['success' => true, 'id' => $deviceId], 200);
            jsonResponse(['success' => true, 'id' => $deviceId]);
            break;

        case 'update':
            if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $data = getRequestData();

            if (empty($data['device_uniq'])) {
                jsonResponse(['error' => 'device_uniq is required'], 400);
            }

            $device = $db->fetch(
                'SELECT id FROM devices WHERE device_uniq = ? AND client_id = ?',
                [$data['device_uniq'], $clientId]
            );

            if (!$device) {
                jsonResponse(['error' => 'Device not found'], 404);
            }

            $updateFields = [];
            $updateParams = [];

            if (isset($data['playground_version'])) {
                $updateFields[] = 'playground_version = ?';
                $updateParams[] = $data['playground_version'];
            }

            if (isset($data['cards_file_version'])) {
                $updateFields[] = 'cards_file_version = ?';
                $updateParams[] = $data['cards_file_version'];
            }

            if (empty($updateFields)) {
                jsonResponse(['error' => 'No fields to update'], 400);
            }

            $updateFields[] = 'updated_at = NOW()';
            $updateParams[] = $data['device_uniq'];

            $db->query(
                'UPDATE devices SET ' . implode(', ', $updateFields) . ' WHERE device_uniq = ?',
                $updateParams
            );

            Logger::log('devices', 'PUT', 'update', $clientId, ['device_uniq' => $data['device_uniq']], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $deviceUniq = $_GET['device_uniq'] ?? '';

            if (empty($deviceUniq)) {
                jsonResponse(['error' => 'device_uniq is required'], 400);
            }

            $result = $db->query(
                'DELETE FROM devices WHERE device_uniq = ? AND client_id = ?',
                [$deviceUniq, $clientId]
            );

            Logger::log('devices', 'DELETE', 'delete', $clientId, ['device_uniq' => $deviceUniq], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    Logger::log('devices', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', $_SESSION['client_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
