<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

session_start();

header('Content-Type: application/json');

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
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    Logger::log('default_config', $_SERVER['REQUEST_METHOD'], 'file_accessed', null, [
        'action' => $action,
        'get_params' => $_GET,
        'headers' => getallheaders()
    ], ['message' => 'default_config.php accessed'], 200);

    switch ($action) {
        case 'create':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            requireAuth();
            $data = getRequestData();

            if (!isset($data['user_email']) || !isset($data['meta']) || !isset($data['version']) || !isset($data['value'])) {
                jsonResponse(['error' => 'Missing required fields: user_email, meta, version, value'], 400);
            }

            $userEmail = $data['user_email'];
            $meta = $data['meta'];
            $version = (int)$data['version'];
            $value = $data['value'];

            if (!is_array($value) && !is_object($value)) {
                jsonResponse(['error' => 'Value must be a JSON object or array'], 400);
            }

            $admin = $db->fetch(
                'SELECT id FROM admin_users WHERE email = ?',
                [$userEmail]
            );

            if (!$admin) {
                jsonResponse(['error' => 'User is not an admin'], 403);
            }

            $existing = $db->fetch(
                'SELECT id, version FROM default_config WHERE meta = ?',
                [$meta]
            );

            if ($existing) {
                $newVersion = (int)$existing['version'] + 1;
                $db->query(
                    'UPDATE default_config SET value = ?, version = ?, updated_at = NOW() WHERE meta = ?',
                    [json_encode($value), $newVersion, $meta]
                );

                Logger::log('default_config', 'POST', 'create', $_SESSION['user_id'], ['meta' => $meta, 'version' => $newVersion], ['success' => true, 'action' => 'updated'], 200);
                jsonResponse(['success' => true, 'meta' => $meta, 'version' => $newVersion, 'action' => 'updated']);
            } else {
                $db->query(
                    'INSERT INTO default_config (meta, value, version) VALUES (?, ?, ?)',
                    [$meta, json_encode($value), $version]
                );

                Logger::log('default_config', 'POST', 'create', $_SESSION['user_id'], ['meta' => $meta, 'version' => $version], ['success' => true, 'action' => 'created'], 201);
                jsonResponse(['success' => true, 'meta' => $meta, 'version' => $version, 'action' => 'created'], 201);
            }
            break;

        case 'get':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            requireAuth();
            $meta = $_GET['meta'] ?? '';

            if (empty($meta)) {
                $configs = $db->fetchAll('SELECT * FROM default_config ORDER BY meta ASC');

                foreach ($configs as &$config) {
                    $config['value'] = json_decode($config['value'], true);
                }

                Logger::log('default_config', 'GET', 'get', $_SESSION['user_id'], [], ['success' => true, 'count' => count($configs)], 200);
                jsonResponse(['success' => true, 'configs' => $configs]);
            } else {
                $config = $db->fetch(
                    'SELECT * FROM default_config WHERE meta = ?',
                    [$meta]
                );

                if (!$config) {
                    Logger::log('default_config', 'GET', 'get', $_SESSION['user_id'], ['meta' => $meta], ['error' => 'Configuration not found'], 404);
                    jsonResponse(['error' => 'Configuration not found'], 404);
                }

                $config['value'] = json_decode($config['value'], true);
                Logger::log('default_config', 'GET', 'get', $_SESSION['user_id'], ['meta' => $meta], ['success' => true], 200);
                jsonResponse(['success' => true, 'config' => $config]);
            }
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            requireAuth();
            $data = getRequestData();

            if (!isset($data['meta'])) {
                jsonResponse(['error' => 'Missing required field: meta'], 400);
            }

            $meta = $data['meta'];

            $existing = $db->fetch(
                'SELECT id FROM default_config WHERE meta = ?',
                [$meta]
            );

            if (!$existing) {
                jsonResponse(['error' => 'Configuration not found'], 404);
            }

            $db->query(
                'DELETE FROM default_config WHERE meta = ?',
                [$meta]
            );

            Logger::log('default_config', 'DELETE', 'delete', $_SESSION['user_id'], ['meta' => $meta], ['success' => true], 200);
            jsonResponse(['success' => true, 'message' => 'Configuration deleted']);
            break;

        default:
            jsonResponse(['error' => 'Invalid action. Use: create, get, delete'], 400);
    }

} catch (Exception $e) {
    Logger::log('default_config', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
