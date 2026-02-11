<?php
ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);
ini_set('log_errors', '1');

// Register shutdown function to catch fatal errors
register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        error_log('FATAL ERROR in default_config.php: ' . json_encode($error));
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

error_log('default_config.php: Starting script execution');

try {
    require_once __DIR__ . '/../utils/cors.php';
    error_log('default_config.php: cors.php loaded');
    setCorsHeaders();

    session_start();
    error_log('default_config.php: Session started');

    header('Content-Type: application/json');

    require_once __DIR__ . '/../database/Database.php';
    error_log('default_config.php: Database.php loaded');

    require_once __DIR__ . '/../utils/Logger.php';
    error_log('default_config.php: Logger.php loaded');

    require_once __DIR__ . '/../utils/TokenManager.php';
    error_log('default_config.php: TokenManager.php loaded');
} catch (Exception $e) {
    error_log('FATAL: Failed to load required files in default_config.php: ' . $e->getMessage());
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode(['error' => 'Failed to initialize: ' . $e->getMessage()]);
    exit;
}

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

function requireAuth($db) {
    if (isset($_SESSION['user_id'])) {
        return ['type' => 'admin', 'id' => $_SESSION['user_id']];
    }

    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (strpos($token, 'Bearer ') === 0) {
        $token = substr($token, 7);
    }

    if (empty($token)) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }

    $tokenData = TokenManager::validateToken($db, $token);

    if (!$tokenData) {
        jsonResponse(['error' => 'Unauthorized - Invalid or expired token'], 401);
    }

    if ($tokenData['user_type'] === 'client') {
        return ['type' => 'client', 'id' => $tokenData['user_id']];
    }

    jsonResponse(['error' => 'Unauthorized'], 401);
}

try {
    $db = Database::getInstance();
    error_log('default_config.php: Database instance created');

    $action = $_GET['action'] ?? '';
    error_log('default_config.php: Action = ' . $action);

    Logger::log('default_config', $_SERVER['REQUEST_METHOD'], 'file_accessed', null, [
        'action' => $action,
        'get_params' => $_GET,
        'headers' => getallheaders()
    ], ['message' => 'default_config.php accessed'], 200);

    switch ($action) {
        case 'health':
            // Simple health check endpoint
            error_log('default_config.php: Health check requested');
            jsonResponse([
                'status' => 'ok',
                'timestamp' => date('Y-m-d H:i:s'),
                'action' => 'health'
            ]);
            break;

        case 'create':
            try {
                if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                    Logger::log('default_config', 'POST', 'create', null, [], ['error' => 'Method not allowed'], 405, 'creator');
                    jsonResponse(['error' => 'Method not allowed'], 405);
                }

                error_log('=== Default Config Create Started ===');
                error_log('Request method: ' . $_SERVER['REQUEST_METHOD']);
                error_log('Content-Type: ' . ($_SERVER['CONTENT_TYPE'] ?? 'not set'));

                Logger::log('default_config', 'POST', 'create_start', $_SESSION['user_id'] ?? null, [
                    'session_exists' => isset($_SESSION['user_id']),
                    'session_user_id' => $_SESSION['user_id'] ?? 'NOT_SET'
                ], ['message' => 'Starting create action'], 200, 'creator');

                $auth = requireAuth($db);
                $userId = $auth['id'];

                error_log('Auth check passed, user_id: ' . $userId . ', type: ' . $auth['type']);

                Logger::log('default_config', 'POST', 'create_after_auth', $userId, ['auth_type' => $auth['type']], ['message' => 'Auth check passed'], 200, 'creator');

                $data = getRequestData();
                error_log('Data retrieved, keys: ' . json_encode(array_keys($data)));

                Logger::log('default_config', 'POST', 'create_received_data', $userId, [
                    'has_user_email' => isset($data['user_email']),
                    'has_meta' => isset($data['meta']),
                    'has_version' => isset($data['version']),
                    'has_value' => isset($data['value']),
                    'user_email' => $data['user_email'] ?? 'NOT_SET',
                    'meta' => $data['meta'] ?? 'NOT_SET',
                    'all_keys' => array_keys($data)
                ], ['message' => 'Request data parsed'], 200, 'creator');

                if (!isset($data['user_email']) || !isset($data['meta']) || !isset($data['version']) || !isset($data['value'])) {
                    error_log('Create failed: Missing required fields');
                    Logger::log('default_config', 'POST', 'create', $userId, $data, ['error' => 'Missing required fields'], 400, 'creator');
                    jsonResponse(['error' => 'Missing required fields: user_email, meta, version, value'], 400);
                }

                $userEmail = $data['user_email'];
                $meta = $data['meta'];
                $version = (int)$data['version'];
                $value = $data['value'];

                error_log('Extracted fields - email: ' . $userEmail . ', meta: ' . $meta . ', version: ' . $version);

                Logger::log('default_config', 'POST', 'create_validation', $userId, [
                    'user_email' => $userEmail,
                    'meta' => $meta,
                    'version' => $version,
                    'value_type' => gettype($value),
                    'value_is_array' => is_array($value),
                    'value_is_object' => is_object($value)
                ], ['message' => 'Fields extracted and validated'], 200, 'creator');

                if (!is_array($value) && !is_object($value)) {
                    error_log('Create failed: Value must be JSON object or array');
                    Logger::log('default_config', 'POST', 'create', $userId, ['value_type' => gettype($value)], ['error' => 'Value must be JSON object or array'], 400, 'creator');
                    jsonResponse(['error' => 'Value must be a JSON object or array'], 400);
                }

                error_log('Looking up user by email: ' . $userEmail);

                Logger::log('default_config', 'POST', 'create_checking_admin', $userId, [
                    'checking_email' => $userEmail,
                    'table' => 'admin_users'
                ], ['message' => 'Checking if user_email exists in admin_users table'], 200, 'creator');

                $admin = $db->fetch(
                    'SELECT id FROM admin_users WHERE email = ?',
                    [$userEmail]
                );

                Logger::log('default_config', 'POST', 'create_admin_check_result', $userId, [
                    'user_email' => $userEmail,
                    'admin_found' => $admin !== false,
                    'admin_id' => $admin ? $admin['id'] : 'NOT_FOUND'
                ], ['message' => 'Admin user lookup completed'], 200, 'creator');

                if (!$admin) {
                    error_log('Create failed: User not admin for email: ' . $userEmail);
                    Logger::log('default_config', 'POST', 'create', $userId, [
                        'user_email' => $userEmail,
                        'checked_table' => 'admin_users'
                    ], ['error' => 'User is not an admin - email not found in admin_users table'], 403, 'creator');
                    jsonResponse(['error' => 'User is not an admin'], 403);
                }

                error_log('User found: admin, ID: ' . $admin['id']);

                Logger::log('default_config', 'POST', 'create_admin_verified', $userId, [
                    'user_email' => $userEmail,
                    'admin_id' => $admin['id']
                ], ['message' => 'User verified as admin, proceeding with operation'], 200, 'creator');

                $existing = $db->fetch(
                    'SELECT id, version FROM default_config WHERE meta = ?',
                    [$meta]
                );

                error_log('Checking existing config for meta: ' . $meta . ', found: ' . ($existing ? 'yes' : 'no'));

                Logger::log('default_config', 'POST', 'create_check_existing', $userId, [
                    'meta' => $meta,
                    'existing_found' => $existing !== false,
                    'existing_version' => $existing ? $existing['version'] : 'N/A'
                ], ['message' => 'Checked for existing config'], 200, 'creator');

                if ($existing) {
                    $newVersion = (int)$existing['version'] + 1;

                    error_log('Updating existing config, new version: ' . $newVersion);

                    Logger::log('default_config', 'POST', 'create_updating', $userId, [
                        'meta' => $meta,
                        'old_version' => $existing['version'],
                        'new_version' => $newVersion,
                        'user_email' => $userEmail,
                        'admin_id' => $admin['id']
                    ], ['message' => 'Updating existing config'], 200, 'creator');

                    $db->query(
                        'UPDATE default_config SET value = ?, version = ?, updated_at = NOW() WHERE meta = ?',
                        [json_encode($value), $newVersion, $meta]
                    );

                    error_log('Config updated successfully');

                    Logger::log('default_config', 'POST', 'create', $userId, [
                        'meta' => $meta,
                        'version' => $newVersion,
                        'user_email' => $userEmail,
                        'verified_as_admin' => true
                    ], ['success' => true, 'action' => 'updated'], 200, 'creator');

                    error_log('=== Default Config Update Successful ===');
                    jsonResponse(['success' => true, 'meta' => $meta, 'version' => $newVersion, 'action' => 'updated']);
                } else {
                    error_log('Creating new config');

                    Logger::log('default_config', 'POST', 'create_inserting', $userId, [
                        'meta' => $meta,
                        'version' => $version,
                        'user_email' => $userEmail,
                        'admin_id' => $admin['id']
                    ], ['message' => 'Creating new config'], 200, 'creator');

                    $db->query(
                        'INSERT INTO default_config (meta, value, version) VALUES (?, ?, ?)',
                        [$meta, json_encode($value), $version]
                    );

                    error_log('Config created successfully');

                    Logger::log('default_config', 'POST', 'create', $userId, [
                        'meta' => $meta,
                        'version' => $version,
                        'user_email' => $userEmail,
                        'verified_as_admin' => true
                    ], ['success' => true, 'action' => 'created'], 201, 'creator');

                    error_log('=== Default Config Create Successful ===');
                    jsonResponse(['success' => true, 'meta' => $meta, 'version' => $version, 'action' => 'created'], 201);
                }
            } catch (Exception $createException) {
                error_log('DEFAULT CONFIG CREATE EXCEPTION: ' . $createException->getMessage());
                error_log('Stack trace: ' . $createException->getTraceAsString());

                Logger::log('default_config', 'POST', 'create', $userId ?? null, [
                    'user_email' => $userEmail ?? 'unknown',
                    'meta' => $meta ?? 'unknown'
                ], [
                    'error' => $createException->getMessage(),
                    'file' => $createException->getFile(),
                    'line' => $createException->getLine()
                ], 500, 'creator');

                jsonResponse([
                    'error' => 'Default config creation failed: ' . $createException->getMessage(),
                    'details' => [
                        'file' => basename($createException->getFile()),
                        'line' => $createException->getLine()
                    ]
                ], 500);
            }
            break;

        case 'get':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                Logger::log('default_config', 'GET', 'get', null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            Logger::log('default_config', 'GET', 'get_start', $_SESSION['user_id'] ?? null, [
                'session_exists' => isset($_SESSION['user_id']),
                'meta_param' => $_GET['meta'] ?? 'NOT_SET'
            ], ['message' => 'Starting get action'], 200);

            $auth = requireAuth($db);
            $userId = $auth['id'];
            $meta = $_GET['meta'] ?? '';

            if (empty($meta)) {
                Logger::log('default_config', 'GET', 'get_all', $userId, [], ['message' => 'Fetching all configs'], 200);

                $configs = $db->fetchAll('SELECT * FROM default_config ORDER BY meta ASC');

                foreach ($configs as &$config) {
                    $config['value'] = json_decode($config['value'], true);
                }

                Logger::log('default_config', 'GET', 'get', $userId, [], ['success' => true, 'count' => count($configs)], 200);
                jsonResponse(['success' => true, 'configs' => $configs]);
            } else {
                Logger::log('default_config', 'GET', 'get_single', $userId, ['meta' => $meta], ['message' => 'Fetching single config'], 200);

                $config = $db->fetch(
                    'SELECT * FROM default_config WHERE meta = ?',
                    [$meta]
                );

                if (!$config) {
                    Logger::log('default_config', 'GET', 'get', $userId, ['meta' => $meta], ['error' => 'Configuration not found'], 404);
                    jsonResponse(['error' => 'Configuration not found'], 404);
                }

                $config['value'] = json_decode($config['value'], true);
                Logger::log('default_config', 'GET', 'get', $userId, ['meta' => $meta, 'version' => $config['version']], ['success' => true], 200);
                jsonResponse(['success' => true, 'config' => $config]);
            }
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                Logger::log('default_config', 'DELETE', 'delete', null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            Logger::log('default_config', 'DELETE', 'delete_start', $_SESSION['user_id'] ?? null, [
                'session_exists' => isset($_SESSION['user_id'])
            ], ['message' => 'Starting delete action'], 200);

            $auth = requireAuth($db);
            $userId = $auth['id'];
            $data = getRequestData();

            Logger::log('default_config', 'DELETE', 'delete_received_data', $userId, [
                'has_meta' => isset($data['meta']),
                'meta' => $data['meta'] ?? 'NOT_SET',
                'all_keys' => array_keys($data)
            ], ['message' => 'Request data parsed'], 200);

            if (!isset($data['meta'])) {
                Logger::log('default_config', 'DELETE', 'delete', $userId, $data, ['error' => 'Missing required field: meta'], 400);
                jsonResponse(['error' => 'Missing required field: meta'], 400);
            }

            $meta = $data['meta'];

            $existing = $db->fetch(
                'SELECT id FROM default_config WHERE meta = ?',
                [$meta]
            );

            Logger::log('default_config', 'DELETE', 'delete_check_existing', $userId, [
                'meta' => $meta,
                'existing_found' => $existing !== false
            ], ['message' => 'Checked for existing config'], 200);

            if (!$existing) {
                Logger::log('default_config', 'DELETE', 'delete', $userId, ['meta' => $meta], ['error' => 'Configuration not found'], 404);
                jsonResponse(['error' => 'Configuration not found'], 404);
            }

            Logger::log('default_config', 'DELETE', 'delete_executing', $userId, [
                'meta' => $meta,
                'config_id' => $existing['id']
            ], ['message' => 'Deleting config'], 200);

            $db->query(
                'DELETE FROM default_config WHERE meta = ?',
                [$meta]
            );

            Logger::log('default_config', 'DELETE', 'delete', $userId, ['meta' => $meta], ['success' => true], 200);
            jsonResponse(['success' => true, 'message' => 'Configuration deleted']);
            break;

        default:
            jsonResponse(['error' => 'Invalid action. Use: create, get, delete'], 400);
    }

} catch (Exception $e) {
    $errorDetails = [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ];

    error_log('Default Config API error: ' . json_encode($errorDetails));

    Logger::log('default_config', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], $errorDetails, 500);

    jsonResponse([
        'error' => 'Server error: ' . $e->getMessage(),
        'details' => [
            'file' => basename($e->getFile()),
            'line' => $e->getLine()
        ]
    ], 500);
}
