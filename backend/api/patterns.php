<?php
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);
ini_set('log_errors', '1');

// Register shutdown function to catch fatal errors
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        error_log('FATAL ERROR in patterns.php: ' . json_encode($error));
        if (!headers_sent()) {
            header('Content-Type: application/json');
            http_response_code(500);
            echo json_encode([
                'error' => 'Fatal error: ' . $error['message'],
                'file' => basename($error['file']),
                'line' => $error['line']
            ]);
        }
    }
});

error_log('patterns.php: Starting script execution');

try {
    require_once __DIR__ . '/../config/database.php';
    error_log('patterns.php: database.php loaded');

    require_once __DIR__ . '/../database/Database.php';
    error_log('patterns.php: Database.php loaded');

    require_once __DIR__ . '/../utils/cors.php';
    error_log('patterns.php: cors.php loaded');

    require_once __DIR__ . '/../utils/Logger.php';
    error_log('patterns.php: Logger.php loaded');

    require_once __DIR__ . '/../utils/SecurityHeaders.php';
    error_log('patterns.php: SecurityHeaders.php loaded');

    require_once __DIR__ . '/../utils/TokenManager.php';
    error_log('patterns.php: TokenManager.php loaded');
} catch (Exception $e) {
    error_log('FATAL: Failed to load required files: ' . $e->getMessage());
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['error' => 'Failed to initialize: ' . $e->getMessage()]);
    exit;
}

SecurityHeaders::setHeaders();
setCorsHeaders();
session_start();

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
    // Check for session-based authentication first (web admin)
    if (isset($_SESSION['user_id']) && isset($_SESSION['user_type'])) {
        $db = Database::getInstance();
        $user = $db->fetch(
            'SELECT id, email, name FROM admin_users WHERE id = ?',
            [$_SESSION['user_id']]
        );

        if ($user) {
            return [
                'user_id' => $user['id'],
                'user_type' => $_SESSION['user_type'],
                'email' => $user['email']
            ];
        }
    }

    // Check for token-based authentication (API/Creator integration)
    $authHeader = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (!empty($authHeader)) {
        $db = Database::getInstance();
        $tokenData = TokenManager::validateToken($db, $authHeader);

        if ($tokenData) {
            return $tokenData;
        }
    }

    // No valid authentication found
    jsonResponse(['error' => 'Authentication required'], 401);
}

try {
    $db = Database::getInstance();
    error_log('patterns.php: Database instance created');

    $action = $_GET['action'] ?? 'list';
    error_log('patterns.php: Action = ' . $action);

    switch ($action) {
        case 'health':
            // Simple health check endpoint
            error_log('patterns.php: Health check requested');
            jsonResponse([
                'status' => 'ok',
                'timestamp' => date('Y-m-d H:i:s'),
                'action' => 'health'
            ]);
            break;

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
            try {
                if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                    jsonResponse(['error' => 'Method not allowed'], 405);
                }

                error_log('=== Pattern Upload Started ===');
                error_log('Request method: ' . $_SERVER['REQUEST_METHOD']);
                error_log('Content-Type: ' . ($_SERVER['CONTENT_TYPE'] ?? 'not set'));

                $data = getRequestData();
                error_log('Data retrieved, keys: ' . json_encode(array_keys($data)));

                error_log('Pattern upload request received: ' . json_encode([
                    'has_email' => !empty($data['email'] ?? ''),
                    'has_name' => !empty($data['name'] ?? ''),
                    'has_pattern_data' => !empty($data['pattern_data'] ?? null),
                    'game_type' => $data['game_type'] ?? 'not set',
                    'is_default' => $data['is_default'] ?? false,
                    'all_keys' => array_keys($data)
                ]));

                $email = $data['email'] ?? '';
                $patternData = $data['pattern_data'] ?? null;
                $name = $data['name'] ?? '';
                $version = isset($data['version']) ? (string)$data['version'] : '1.0';
                $gameType = $data['game_type'] ?? '';
                $isDefault = $data['is_default'] ?? false;
                $patternUniqid = $data['pattern_uniqid'] ?? $data['uniqid'] ?? null;
                $patternSlug = $data['pattern_slug'] ?? $data['slug'] ?? null;

                if (empty($email)) {
                    error_log('Upload failed: Email required');
                    Logger::log('patterns', 'POST', 'upload', null, ['email' => ''], ['error' => 'Email required'], 400, 'creator');
                    jsonResponse(['error' => 'Email is required'], 400);
                }

                if (empty($patternData)) {
                    error_log('Upload failed: Pattern data required');
                    Logger::log('patterns', 'POST', 'upload', null, ['email' => $email], ['error' => 'Pattern data required'], 400, 'creator');
                    jsonResponse(['error' => 'Pattern data is required'], 400);
                }

                if (empty($name)) {
                    error_log('Upload failed: Pattern name required');
                    Logger::log('patterns', 'POST', 'upload', null, ['email' => $email], ['error' => 'Pattern name required'], 400, 'creator');
                    jsonResponse(['error' => 'Pattern name is required'], 400);
                }

                if (empty($gameType)) {
                    error_log('Upload failed: Game type required');
                    Logger::log('patterns', 'POST', 'upload', null, ['email' => $email], ['error' => 'Game type required'], 400, 'creator');
                    jsonResponse(['error' => 'Game type is required'], 400);
                }

                error_log('Looking up user by email: ' . $email);
                $admin = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);
                $client = null;
                $ownerType = 'system';
                $ownerId = null;

                if ($admin) {
                    error_log('User found: admin, ID: ' . $admin['id']);
                    $ownerType = 'admin';
                    $ownerId = $admin['id'];
                } else {
                    error_log('Not an admin, checking clients table');
                    $client = $db->fetch('SELECT id FROM clients WHERE email = ?', [$email]);
                    if ($client) {
                        error_log('User found: client, ID: ' . $client['id']);
                        $ownerType = 'client';
                        $ownerId = $client['id'];
                    }
                }

                if (!$admin && !$client) {
                    error_log('Upload failed: User not found for email: ' . $email);
                    Logger::log('patterns', 'POST', 'upload', null, ['email' => $email], ['error' => 'User not found'], 404, 'creator');
                    jsonResponse(['error' => 'User with this email not found'], 404);
                }

                $rawPreview = substr(is_string($patternData) ? $patternData : json_encode($patternData), 0, 500);
                Logger::log('patterns', 'POST', 'transform-1-raw-input', $ownerId, [
                    'email' => $email,
                    'pattern_data_type' => gettype($patternData),
                    'pattern_data_preview' => $rawPreview
                ], ['step' => 'raw input received from Creator'], 200, 'creator');

                $jsonData = is_string($patternData) ? $patternData : json_encode($patternData);

                Logger::log('patterns', 'POST', 'transform-2-after-encode', $ownerId, [
                    'email' => $email,
                    'was_already_string' => is_string($patternData),
                    'json_length' => strlen($jsonData),
                    'json_preview' => substr($jsonData, 0, 500)
                ], ['step' => 'after json_encode / string passthrough'], 200, 'creator');

                if (json_decode($jsonData) === null && json_last_error() !== JSON_ERROR_NONE) {
                    $jsonError = json_last_error_msg();
                    Logger::log('patterns', 'POST', 'upload', $ownerId, ['email' => $email], ['error' => 'Invalid JSON data: ' . $jsonError], 400, 'creator');
                    jsonResponse(['error' => 'Invalid JSON pattern data: ' . $jsonError], 400);
                }

                $isDefaultInt = ($isDefault === true || $isDefault === 1 || $isDefault === '1') ? 1 : 0;

                Logger::log('patterns', 'POST', 'transform-3-before-insert', $ownerId, [
                    'email' => $email,
                    'name' => $name,
                    'game_type' => $gameType,
                    'version' => $version,
                    'is_default' => $isDefaultInt,
                    'owner_type' => $ownerType,
                    'pattern_uniqid' => $patternUniqid,
                    'pattern_slug' => $patternSlug,
                    'pattern_data_length' => strlen($jsonData),
                    'pattern_data_preview' => substr($jsonData, 0, 500)
                ], ['step' => 'about to run INSERT'], 200, 'creator');

                $patternId = $db->execute(
                    'INSERT INTO patterns (name, game_type, version, pattern_data, is_default, owner_type, owner_id, created_by_email, pattern_uniqid, pattern_slug)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$name, $gameType, $version, $jsonData, $isDefaultInt, $ownerType, $ownerId, $email, $patternUniqid, $patternSlug]
                );

                $pattern = $db->fetch('SELECT * FROM patterns WHERE id = ?', [$patternId]);

                $fetchedLength = strlen($pattern['pattern_data'] ?? '');
                $dataMatches = $jsonData === ($pattern['pattern_data'] ?? '');
                Logger::log('patterns', 'POST', 'transform-4-after-select', $ownerId, [
                    'email' => $email,
                    'pattern_id' => $patternId,
                    'inserted_length' => strlen($jsonData),
                    'fetched_length' => $fetchedLength,
                    'data_matches_inserted' => $dataMatches,
                    'fetched_preview' => substr($pattern['pattern_data'] ?? 'NULL', 0, 500)
                ], ['step' => 'SELECT after INSERT', 'match' => $dataMatches], 200, 'creator');

                if (!$pattern) {
                    error_log('WARNING: Pattern inserted but not found in database, ID: ' . $patternId);
                }

                $response = ['success' => true, 'data' => $pattern];
                Logger::log('patterns', 'POST', 'upload', $ownerId, [
                    'email' => $email,
                    'name' => $name,
                    'game_type' => $gameType,
                    'version' => $version,
                    'owner_type' => $ownerType,
                    'is_default' => $isDefault,
                    'pattern_id' => $patternId
                ], $response, 201, 'creator');

                error_log('=== Pattern Upload Successful ===');
                jsonResponse($response, 201);
            } catch (Exception $uploadException) {
                error_log('PATTERN UPLOAD EXCEPTION: ' . $uploadException->getMessage());
                error_log('Stack trace: ' . $uploadException->getTraceAsString());

                Logger::log('patterns', 'POST', 'upload', null, [
                    'email' => $email ?? 'unknown',
                    'name' => $name ?? 'unknown'
                ], [
                    'error' => $uploadException->getMessage(),
                    'file' => $uploadException->getFile(),
                    'line' => $uploadException->getLine()
                ], 500, 'creator');

                jsonResponse([
                    'error' => 'Pattern upload failed: ' . $uploadException->getMessage(),
                    'details' => [
                        'file' => basename($uploadException->getFile()),
                        'line' => $uploadException->getLine()
                    ]
                ], 500);
            }
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
            $description = $data['description'] ?? null;
            $version = $data['version'] ?? '1.0';
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
                'INSERT INTO patterns (name, description, version, game_type, pattern_data, is_default, owner_type, owner_id, created_by_email)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$name, $description, $version, $gameType, $jsonData, $isDefault ? 1 : 0, $userType, $userId, $email]
            );

            $patternId = $db->lastInsertId();
            $pattern = $db->fetch('SELECT * FROM patterns WHERE id = ?', [$patternId]);

            $response = ['success' => true, 'data' => $pattern];
            Logger::log('patterns', 'POST', 'create', $userId, [
                'name' => $name,
                'version' => $version,
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
