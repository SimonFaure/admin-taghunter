<?php
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);
ini_set('log_errors', '1');

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        error_log('FATAL ERROR in layouts.php: ' . json_encode($error));
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

error_log('layouts.php: Starting script execution');

try {
    require_once __DIR__ . '/../config/database.php';
    require_once __DIR__ . '/../database/Database.php';
    require_once __DIR__ . '/../utils/cors.php';
    require_once __DIR__ . '/../utils/Logger.php';
    require_once __DIR__ . '/../utils/SecurityHeaders.php';
    require_once __DIR__ . '/../utils/TokenManager.php';
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

    $authHeader = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (!empty($authHeader)) {
        $db = Database::getInstance();
        $tokenData = TokenManager::validateToken($db, $authHeader);

        if ($tokenData) {
            return $tokenData;
        }
    }

    jsonResponse(['error' => 'Authentication required'], 401);
}

$validStatuses = ['draft', 'active', 'archived'];

try {
    $db = Database::getInstance();
    error_log('layouts.php: Database instance created');

    $action = $_GET['action'] ?? 'list';
    error_log('layouts.php: Action = ' . $action);

    switch ($action) {
        case 'health':
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
            $status = $_GET['status'] ?? null;

            if ($userType === 'admin') {
                $query = 'SELECT * FROM layouts WHERE 1=1';
                $params = [];
            } else {
                $query = 'SELECT * FROM layouts WHERE (owner_type = ? AND owner_id = ?)';
                $params = [$userType, $userId];
            }

            if ($gameType) {
                $query .= ' AND game_type = ?';
                $params[] = $gameType;
            }

            if ($status && in_array($status, $GLOBALS['validStatuses'])) {
                $query .= ' AND status = ?';
                $params[] = $status;
            }

            $query .= ' ORDER BY created_at DESC';
            $layouts = $db->fetchAll($query, $params);

            $response = ['data' => $layouts];
            Logger::log('layouts', 'GET', 'list', $userId, ['user_type' => $userType, 'game_type' => $gameType, 'status' => $status], $response, 200);
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
                jsonResponse(['error' => 'Layout ID is required'], 400);
            }

            $layout = $db->fetch('SELECT * FROM layouts WHERE id = ?', [$id]);

            if (!$layout) {
                jsonResponse(['error' => 'Layout not found'], 404);
            }

            if ($userType !== 'admin') {
                if ($layout['owner_type'] !== $userType || $layout['owner_id'] != $userId) {
                    jsonResponse(['error' => 'Access denied'], 403);
                }
            }

            $response = ['data' => $layout];
            Logger::log('layouts', 'GET', 'get', $userId, ['id' => $id], $response, 200);
            jsonResponse($response);
            break;

        case 'upload':
            try {
                if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                    jsonResponse(['error' => 'Method not allowed'], 405);
                }

                error_log('=== Layout Upload Started ===');
                error_log('Request method: ' . $_SERVER['REQUEST_METHOD']);
                error_log('Content-Type: ' . ($_SERVER['CONTENT_TYPE'] ?? 'not set'));

                $data = getRequestData();
                error_log('Data retrieved, keys: ' . json_encode(array_keys($data)));

                error_log('Layout upload request received: ' . json_encode([
                    'has_email' => !empty($data['email'] ?? ''),
                    'has_name' => !empty($data['name'] ?? ''),
                    'has_layout_data' => !empty($data['layout_data'] ?? null),
                    'game_type' => $data['game_type'] ?? 'not set',
                    'status' => $data['status'] ?? 'not set',
                    'all_keys' => array_keys($data)
                ]));

                $email = $data['email'] ?? '';
                $layoutData = $data['layout_data'] ?? null;
                $name = $data['name'] ?? '';
                $version = isset($data['version']) ? (string)$data['version'] : '1.0';
                $gameType = $data['game_type'] ?? '';
                $scenarioUniqid = $data['scenario_uniqid'] ?? null;
                $status = $data['status'] ?? 'draft';
                $layoutUniqid = $data['layout_uniqid'] ?? null;

                if (empty($email)) {
                    error_log('Upload failed: Email required');
                    Logger::log('layouts', 'POST', 'upload', null, ['email' => ''], ['error' => 'Email required'], 400, 'creator');
                    jsonResponse(['error' => 'Email is required'], 400);
                }

                if (empty($layoutData)) {
                    error_log('Upload failed: Layout data required');
                    Logger::log('layouts', 'POST', 'upload', null, ['email' => $email], ['error' => 'Layout data required'], 400, 'creator');
                    jsonResponse(['error' => 'Layout data is required'], 400);
                }

                if (empty($name)) {
                    error_log('Upload failed: Layout name required');
                    Logger::log('layouts', 'POST', 'upload', null, ['email' => $email], ['error' => 'Layout name required'], 400, 'creator');
                    jsonResponse(['error' => 'Layout name is required'], 400);
                }

                if (empty($gameType)) {
                    error_log('Upload failed: Game type required');
                    Logger::log('layouts', 'POST', 'upload', null, ['email' => $email], ['error' => 'Game type required'], 400, 'creator');
                    jsonResponse(['error' => 'Game type is required'], 400);
                }

                if (!in_array($status, $GLOBALS['validStatuses'])) {
                    error_log('Upload failed: Invalid status: ' . $status);
                    Logger::log('layouts', 'POST', 'upload', null, ['email' => $email], ['error' => 'Invalid status'], 400, 'creator');
                    jsonResponse(['error' => 'Status must be one of: draft, active, archived'], 400);
                }

                error_log('Looking up user by email: ' . $email);
                $admin = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);
                $client = null;
                $ownerType = 'system';
                $ownerId = null;

                if ($admin) {
                    error_log('User found: admin, ID: ' . $admin['id'] . ' - owner_id set to null');
                    $ownerType = 'admin';
                    $ownerId = null;
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
                    Logger::log('layouts', 'POST', 'upload', null, ['email' => $email], ['error' => 'User not found'], 404, 'creator');
                    jsonResponse(['error' => 'User with this email not found'], 404);
                }

                $rawPreview = substr(is_string($layoutData) ? $layoutData : json_encode($layoutData), 0, 500);
                Logger::log('layouts', 'POST', 'transform-1-raw-input', $ownerId, [
                    'email' => $email,
                    'layout_data_type' => gettype($layoutData),
                    'layout_data_preview' => $rawPreview
                ], ['step' => 'raw input received from Creator'], 200, 'creator');

                $jsonData = is_string($layoutData) ? $layoutData : json_encode($layoutData);

                Logger::log('layouts', 'POST', 'transform-2-after-encode', $ownerId, [
                    'email' => $email,
                    'was_already_string' => is_string($layoutData),
                    'json_length' => strlen($jsonData),
                    'json_preview' => substr($jsonData, 0, 500)
                ], ['step' => 'after json_encode / string passthrough'], 200, 'creator');

                if (json_decode($jsonData) === null && json_last_error() !== JSON_ERROR_NONE) {
                    $jsonError = json_last_error_msg();
                    Logger::log('layouts', 'POST', 'upload', $ownerId, ['email' => $email], ['error' => 'Invalid JSON data: ' . $jsonError], 400, 'creator');
                    jsonResponse(['error' => 'Invalid JSON layout data: ' . $jsonError], 400);
                }

                $existingLayout = $layoutUniqid
                    ? $db->fetch('SELECT id FROM layouts WHERE layout_uniqid = ?', [$layoutUniqid])
                    : null;

                Logger::log('layouts', 'POST', 'transform-3-before-insert', $ownerId, [
                    'email' => $email,
                    'name' => $name,
                    'game_type' => $gameType,
                    'version' => $version,
                    'status' => $status,
                    'scenario_uniqid' => $scenarioUniqid,
                    'layout_uniqid' => $layoutUniqid,
                    'owner_type' => $ownerType,
                    'layout_data_length' => strlen($jsonData),
                    'layout_data_preview' => substr($jsonData, 0, 500),
                    'action' => $existingLayout ? 'UPDATE' : 'INSERT'
                ], ['step' => $existingLayout ? 'about to run UPDATE' : 'about to run INSERT'], 200, 'creator');

                if ($existingLayout) {
                    $db->execute(
                        'UPDATE layouts SET layout_data = ?, game_type = ?, scenario_uniqid = ?, status = ?, version = ?, owner_type = ?, owner_id = ?, created_by_email = ?, name = ? WHERE layout_uniqid = ?',
                        [$jsonData, $gameType, $scenarioUniqid ?: null, $status, $version, $ownerType, $ownerId, $email, $name ?: null, $layoutUniqid]
                    );
                    $layoutId = $existingLayout['id'];
                } else {
                    $layoutId = $db->execute(
                        'INSERT INTO layouts (layout_data, game_type, scenario_uniqid, status, version, owner_type, owner_id, created_by_email, layout_uniqid)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [$jsonData, $gameType, $scenarioUniqid ?: null, $status, $version, $ownerType, $ownerId, $email, $layoutUniqid ?: null]
                    );
                }

                $layout = $db->fetch('SELECT * FROM layouts WHERE id = ?', [$layoutId]);

                $fetchedLength = strlen($layout['layout_data'] ?? '');
                $dataMatches = $jsonData === ($layout['layout_data'] ?? '');
                Logger::log('layouts', 'POST', 'transform-4-after-select', $ownerId, [
                    'email' => $email,
                    'layout_id' => $layoutId,
                    'inserted_length' => strlen($jsonData),
                    'fetched_length' => $fetchedLength,
                    'data_matches_inserted' => $dataMatches,
                    'fetched_preview' => substr($layout['layout_data'] ?? 'NULL', 0, 500)
                ], ['step' => 'SELECT after INSERT', 'match' => $dataMatches], 200, 'creator');

                if (!$layout) {
                    error_log('WARNING: Layout inserted but not found in database, ID: ' . $layoutId);
                }

                $response = ['success' => true, 'data' => $layout];
                Logger::log('layouts', 'POST', 'upload', $ownerId, [
                    'email' => $email,
                    'name' => $name,
                    'game_type' => $gameType,
                    'version' => $version,
                    'status' => $status,
                    'scenario_uniqid' => $scenarioUniqid,
                    'owner_type' => $ownerType,
                    'layout_id' => $layoutId
                ], $response, 201, 'creator');

                error_log('=== Layout Upload Successful ===');
                jsonResponse($response, 201);
            } catch (Exception $uploadException) {
                error_log('LAYOUT UPLOAD EXCEPTION: ' . $uploadException->getMessage());
                error_log('Stack trace: ' . $uploadException->getTraceAsString());

                Logger::log('layouts', 'POST', 'upload', null, [
                    'email' => $email ?? 'unknown',
                    'name' => $name ?? 'unknown'
                ], [
                    'error' => $uploadException->getMessage(),
                    'file' => $uploadException->getFile(),
                    'line' => $uploadException->getLine()
                ], 500, 'creator');

                jsonResponse([
                    'error' => 'Layout upload failed: ' . $uploadException->getMessage(),
                    'details' => [
                        'file' => basename($uploadException->getFile()),
                        'line' => $uploadException->getLine()
                    ]
                ], 500);
            }
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
                jsonResponse(['error' => 'Layout ID is required'], 400);
            }

            $layout = $db->fetch('SELECT * FROM layouts WHERE id = ?', [$id]);

            if (!$layout) {
                jsonResponse(['error' => 'Layout not found'], 404);
            }

            if ($userType !== 'admin') {
                if ($layout['owner_type'] !== $userType || $layout['owner_id'] != $userId) {
                    jsonResponse(['error' => 'Access denied'], 403);
                }
            }

            $db->execute('DELETE FROM layouts WHERE id = ?', [$id]);

            $response = ['success' => true, 'message' => 'Layout deleted successfully'];
            Logger::log('layouts', $_SERVER['REQUEST_METHOD'], 'delete', $userId, ['id' => $id], $response, 200);
            jsonResponse($response);
            break;

        default:
            Logger::log('layouts', $_SERVER['REQUEST_METHOD'], $action, null, [], ['error' => 'Invalid action'], 400);
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    $errorDetails = [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ];

    error_log('Layout API error: ' . json_encode($errorDetails));

    Logger::log('layouts', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], $errorDetails, 500);

    jsonResponse([
        'error' => 'Server error: ' . $e->getMessage(),
        'details' => [
            'file' => basename($e->getFile()),
            'line' => $e->getLine()
        ]
    ], 500);
}
