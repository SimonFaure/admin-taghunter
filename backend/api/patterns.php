<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../utils/TokenManager.php';

SecurityHeaders::setHeaders();
handleCors();

function getRequestData() {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

    if (strpos($contentType, 'application/json') !== false) {
        $json = file_get_contents('php://input');
        return json_decode($json, true) ?? [];
    }

    return $_POST;
}

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function requireAuth() {
    $authHeader = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (empty($authHeader)) {
        jsonResponse(['error' => 'Authentication required'], 401);
    }

    $db = new Database();
    $tokenData = TokenManager::validateToken($db, $authHeader);

    if (!$tokenData) {
        jsonResponse(['error' => 'Invalid or expired token'], 401);
    }

    return $tokenData;
}

try {
    $db = new Database();
    $action = $_GET['action'] ?? 'list';

    switch ($action) {
        case 'list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $tokenData = requireAuth();
            $userId = $tokenData['user_id'];
            $userType = $tokenData['user_type'];

            $gameType = $_GET['game_type'] ?? null;

            if ($userType === 'admin') {
                $query = 'SELECT * FROM patterns WHERE 1=1';
                $params = [];

                if ($gameType) {
                    $query .= ' AND game_type = ?';
                    $params[] = $gameType;
                }

                $query .= ' ORDER BY game_type, is_default DESC, name';
                $patterns = $db->fetchAll($query, $params);
            } else {
                $query = 'SELECT * FROM patterns
                          WHERE (is_default = TRUE)
                          OR (owner_type = ? AND owner_id = ?)';
                $params = [$userType, $userId];

                if ($gameType) {
                    $query .= ' AND game_type = ?';
                    $params[] = $gameType;
                }

                $query .= ' ORDER BY game_type, is_default DESC, name';
                $patterns = $db->fetchAll($query, $params);
            }

            $response = ['data' => $patterns];
            Logger::log('patterns', 'GET', 'list', $userId, ['user_type' => $userType, 'game_type' => $gameType], $response, 200);
            jsonResponse($response);
            break;

        case 'get':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $tokenData = requireAuth();
            $userId = $tokenData['user_id'];
            $userType = $tokenData['user_type'];

            $id = $_GET['id'] ?? '';
            if (empty($id)) {
                Logger::log('patterns', 'GET', 'get', $userId, ['id' => ''], ['error' => 'Pattern ID required'], 400);
                jsonResponse(['error' => 'Pattern ID is required'], 400);
            }

            $pattern = $db->fetch('SELECT * FROM patterns WHERE id = ?', [$id]);

            if (!$pattern) {
                Logger::log('patterns', 'GET', 'get', $userId, ['id' => $id], ['error' => 'Pattern not found'], 404);
                jsonResponse(['error' => 'Pattern not found'], 404);
            }

            if ($userType !== 'admin' && !$pattern['is_default']) {
                if ($pattern['owner_type'] !== $userType || $pattern['owner_id'] != $userId) {
                    Logger::log('patterns', 'GET', 'get', $userId, ['id' => $id], ['error' => 'Access denied'], 403);
                    jsonResponse(['error' => 'Access denied'], 403);
                }
            }

            $response = ['data' => $pattern];
            Logger::log('patterns', 'GET', 'get', $userId, ['id' => $id], $response, 200);
            jsonResponse($response);
            break;

        case 'upload':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();

            error_log('Pattern upload request received: ' . json_encode([
                'has_email' => !empty($data['email'] ?? ''),
                'has_name' => !empty($data['name'] ?? ''),
                'has_pattern_data' => !empty($data['pattern_data'] ?? null),
                'game_type' => $data['game_type'] ?? 'not set',
                'is_default' => $data['is_default'] ?? false
            ]));
            $email = $data['email'] ?? '';
            $patternData = $data['pattern_data'] ?? null;
            $name = $data['name'] ?? '';
            $version = isset($data['version']) ? (string)$data['version'] : '1.0';
            $gameType = $data['game_type'] ?? '';
            $isDefault = $data['is_default'] ?? false;

            if (empty($email)) {
                Logger::log('patterns', 'POST', 'upload', null, ['email' => ''], ['error' => 'Email required'], 400);
                jsonResponse(['error' => 'Email is required'], 400);
            }

            if (empty($patternData)) {
                Logger::log('patterns', 'POST', 'upload', null, ['email' => $email], ['error' => 'Pattern data required'], 400);
                jsonResponse(['error' => 'Pattern data is required'], 400);
            }

            if (empty($name)) {
                Logger::log('patterns', 'POST', 'upload', null, ['email' => $email], ['error' => 'Pattern name required'], 400);
                jsonResponse(['error' => 'Pattern name is required'], 400);
            }

            if (empty($gameType)) {
                Logger::log('patterns', 'POST', 'upload', null, ['email' => $email], ['error' => 'Game type required'], 400);
                jsonResponse(['error' => 'Game type is required'], 400);
            }

            $admin = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);
            $client = null;
            $ownerType = 'system';
            $ownerId = null;

            if ($admin) {
                $ownerType = 'admin';
                $ownerId = $admin['id'];
            } else {
                $client = $db->fetch('SELECT id FROM clients WHERE email = ?', [$email]);
                if ($client) {
                    $ownerType = 'client';
                    $ownerId = $client['id'];
                }
            }

            if (!$admin && !$client) {
                Logger::log('patterns', 'POST', 'upload', null, ['email' => $email], ['error' => 'User not found'], 404);
                jsonResponse(['error' => 'User with this email not found'], 404);
            }

            $jsonData = is_string($patternData) ? $patternData : json_encode($patternData);

            if (json_decode($jsonData) === null && json_last_error() !== JSON_ERROR_NONE) {
                $jsonError = json_last_error_msg();
                Logger::log('patterns', 'POST', 'upload', $ownerId, ['email' => $email], ['error' => 'Invalid JSON data: ' . $jsonError], 400);
                jsonResponse(['error' => 'Invalid JSON pattern data: ' . $jsonError], 400);
            }

            $isDefaultInt = ($isDefault === true || $isDefault === 1 || $isDefault === '1') ? 1 : 0;

            error_log('About to insert pattern: ' . json_encode([
                'name' => $name,
                'game_type' => $gameType,
                'version' => $version,
                'is_default' => $isDefaultInt,
                'owner_type' => $ownerType,
                'owner_id' => $ownerId,
                'email' => $email,
                'pattern_data_length' => strlen($jsonData)
            ]));

            $db->execute(
                'INSERT INTO patterns (name, game_type, version, pattern_data, is_default, owner_type, owner_id, created_by_email)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$name, $gameType, $version, $jsonData, $isDefaultInt, $ownerType, $ownerId, $email]
            );

            error_log('Pattern inserted successfully, ID: ' . $db->lastInsertId());

            $patternId = $db->lastInsertId();
            $pattern = $db->fetch('SELECT * FROM patterns WHERE id = ?', [$patternId]);

            $response = ['success' => true, 'data' => $pattern];
            Logger::log('patterns', 'POST', 'upload', $ownerId, [
                'email' => $email,
                'name' => $name,
                'game_type' => $gameType,
                'version' => $version,
                'owner_type' => $ownerType,
                'is_default' => $isDefault
            ], $response, 201);
            jsonResponse($response, 201);
            break;

        case 'create':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $tokenData = requireAuth();
            $userId = $tokenData['user_id'];
            $userType = $tokenData['user_type'];
            $email = $tokenData['email'];

            $data = getRequestData();
            $name = $data['name'] ?? '';
            $description = $data['description'] ?? '';
            $gameType = $data['game_type'] ?? '';
            $patternData = $data['pattern_data'] ?? null;
            $isDefault = $data['is_default'] ?? false;

            if ($userType !== 'admin' && $isDefault) {
                Logger::log('patterns', 'POST', 'create', $userId, ['user_type' => $userType], ['error' => 'Only admins can create default patterns'], 403);
                jsonResponse(['error' => 'Only admins can create default patterns'], 403);
            }

            if (empty($name)) {
                Logger::log('patterns', 'POST', 'create', $userId, [], ['error' => 'Name required'], 400);
                jsonResponse(['error' => 'Pattern name is required'], 400);
            }

            if (empty($gameType)) {
                Logger::log('patterns', 'POST', 'create', $userId, [], ['error' => 'Game type required'], 400);
                jsonResponse(['error' => 'Game type is required'], 400);
            }

            if (empty($patternData)) {
                Logger::log('patterns', 'POST', 'create', $userId, [], ['error' => 'Pattern data required'], 400);
                jsonResponse(['error' => 'Pattern data is required'], 400);
            }

            $jsonData = is_string($patternData) ? $patternData : json_encode($patternData);

            if (json_decode($jsonData) === null && json_last_error() !== JSON_ERROR_NONE) {
                Logger::log('patterns', 'POST', 'create', $userId, [], ['error' => 'Invalid JSON data'], 400);
                jsonResponse(['error' => 'Invalid JSON pattern data'], 400);
            }

            $db->execute(
                'INSERT INTO patterns (name, description, game_type, pattern_data, is_default, owner_type, owner_id, created_by_email)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$name, $description, $gameType, $jsonData, $isDefault ? 1 : 0, $userType, $userId, $email]
            );

            $patternId = $db->lastInsertId();
            $pattern = $db->fetch('SELECT * FROM patterns WHERE id = ?', [$patternId]);

            $response = ['success' => true, 'data' => $pattern];
            Logger::log('patterns', 'POST', 'create', $userId, [
                'name' => $name,
                'game_type' => $gameType,
                'is_default' => $isDefault
            ], $response, 201);
            jsonResponse($response, 201);
            break;

        case 'update':
            if ($_SERVER['REQUEST_METHOD'] !== 'PUT' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $tokenData = requireAuth();
            $userId = $tokenData['user_id'];
            $userType = $tokenData['user_type'];

            $data = getRequestData();
            $id = $data['id'] ?? $_GET['id'] ?? '';

            if (empty($id)) {
                Logger::log('patterns', $_SERVER['REQUEST_METHOD'], 'update', $userId, [], ['error' => 'Pattern ID required'], 400);
                jsonResponse(['error' => 'Pattern ID is required'], 400);
            }

            $pattern = $db->fetch('SELECT * FROM patterns WHERE id = ?', [$id]);

            if (!$pattern) {
                Logger::log('patterns', $_SERVER['REQUEST_METHOD'], 'update', $userId, ['id' => $id], ['error' => 'Pattern not found'], 404);
                jsonResponse(['error' => 'Pattern not found'], 404);
            }

            if ($userType !== 'admin') {
                if ($pattern['owner_type'] !== $userType || $pattern['owner_id'] != $userId) {
                    Logger::log('patterns', $_SERVER['REQUEST_METHOD'], 'update', $userId, ['id' => $id], ['error' => 'Access denied'], 403);
                    jsonResponse(['error' => 'Access denied'], 403);
                }
            }

            $name = $data['name'] ?? $pattern['name'];
            $description = $data['description'] ?? $pattern['description'];
            $gameType = $data['game_type'] ?? $pattern['game_type'];
            $patternData = $data['pattern_data'] ?? null;
            $isDefault = isset($data['is_default']) ? $data['is_default'] : $pattern['is_default'];

            if ($userType !== 'admin' && $isDefault && !$pattern['is_default']) {
                Logger::log('patterns', $_SERVER['REQUEST_METHOD'], 'update', $userId, ['id' => $id], ['error' => 'Cannot set pattern as default'], 403);
                jsonResponse(['error' => 'Only admins can set patterns as default'], 403);
            }

            $jsonData = null;
            if ($patternData !== null) {
                $jsonData = is_string($patternData) ? $patternData : json_encode($patternData);

                if (json_decode($jsonData) === null && json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('patterns', $_SERVER['REQUEST_METHOD'], 'update', $userId, ['id' => $id], ['error' => 'Invalid JSON data'], 400);
                    jsonResponse(['error' => 'Invalid JSON pattern data'], 400);
                }
            } else {
                $jsonData = $pattern['pattern_data'];
            }

            $db->execute(
                'UPDATE patterns SET name = ?, description = ?, game_type = ?, pattern_data = ?, is_default = ? WHERE id = ?',
                [$name, $description, $gameType, $jsonData, $isDefault ? 1 : 0, $id]
            );

            $updatedPattern = $db->fetch('SELECT * FROM patterns WHERE id = ?', [$id]);

            $response = ['success' => true, 'data' => $updatedPattern];
            Logger::log('patterns', $_SERVER['REQUEST_METHOD'], 'update', $userId, ['id' => $id], $response, 200);
            jsonResponse($response);
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $tokenData = requireAuth();
            $userId = $tokenData['user_id'];
            $userType = $tokenData['user_type'];

            $id = $_GET['id'] ?? '';
            if (empty($id)) {
                Logger::log('patterns', $_SERVER['REQUEST_METHOD'], 'delete', $userId, [], ['error' => 'Pattern ID required'], 400);
                jsonResponse(['error' => 'Pattern ID is required'], 400);
            }

            $pattern = $db->fetch('SELECT * FROM patterns WHERE id = ?', [$id]);

            if (!$pattern) {
                Logger::log('patterns', $_SERVER['REQUEST_METHOD'], 'delete', $userId, ['id' => $id], ['error' => 'Pattern not found'], 404);
                jsonResponse(['error' => 'Pattern not found'], 404);
            }

            if ($userType !== 'admin') {
                if ($pattern['owner_type'] !== $userType || $pattern['owner_id'] != $userId) {
                    Logger::log('patterns', $_SERVER['REQUEST_METHOD'], 'delete', $userId, ['id' => $id], ['error' => 'Access denied'], 403);
                    jsonResponse(['error' => 'Access denied'], 403);
                }
            }

            $db->execute('DELETE FROM patterns WHERE id = ?', [$id]);

            $response = ['success' => true, 'message' => 'Pattern deleted successfully'];
            Logger::log('patterns', $_SERVER['REQUEST_METHOD'], 'delete', $userId, ['id' => $id], $response, 200);
            jsonResponse($response);
            break;

        default:
            Logger::log('patterns', $_SERVER['REQUEST_METHOD'], $action, null, [], ['error' => 'Invalid action'], 400);
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    $errorDetails = [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ];

    error_log('Pattern API error: ' . json_encode($errorDetails));

    Logger::log('patterns', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], $errorDetails, 500);

    jsonResponse([
        'error' => 'Server error: ' . $e->getMessage(),
        'details' => [
            'file' => basename($e->getFile()),
            'line' => $e->getLine()
        ]
    ], 500);
}
