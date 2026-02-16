<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

function jsonResponse($data, $statusCode = 200) {
    header('Content-Type: application/json');
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
}

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($action) {
        case 'create':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            // Get raw input to check if it's JSON
            $rawInput = file_get_contents('php://input');
            $jsonInput = json_decode($rawInput, true);

            // Log incoming request data for debugging
            Logger::log('scenarios', $method, 'create_incoming', $_SESSION['user_id'] ?? null, [
                'POST' => $_POST,
                'raw_input' => $rawInput ? substr($rawInput, 0, 500) : 'EMPTY',
                'json_input' => $jsonInput,
                'FILES' => isset($_FILES) ? array_map(function($file) {
                    return [
                        'name' => $file['name'] ?? null,
                        'size' => $file['size'] ?? null,
                        'error' => $file['error'] ?? null
                    ];
                }, $_FILES) : [],
                'content_type' => $_SERVER['CONTENT_TYPE'] ?? null
            ], ['message' => 'Incoming create request'], 200);

            // Check if this is an admin request (with session) or client request (with email)
            $isAdminRequest = isset($_SESSION['user_id']);
            $email = $_POST['email'] ?? ($jsonInput['email'] ?? null);
            $logSource = $isAdminRequest ? 'admin' : 'creator';

            if (!$isAdminRequest && !$email) {
                Logger::log('scenarios', $method, 'create', null, $_POST, ['error' => 'Unauthorized - no session or email'], 401, 'creator');
                jsonResponse(['error' => 'Unauthorized'], 401);
            }

            // Parse scenario data - check both form data and raw JSON
            $scenarioData = null;

            // Case 1: Form data with scenarioData as JSON string
            if (isset($_POST['scenarioData'])) {
                $scenarioData = json_decode($_POST['scenarioData'], true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Invalid JSON in scenarioData'], 400);
                    jsonResponse(['error' => 'Invalid JSON in scenarioData'], 400);
                }
            }
            // Case 2: Raw JSON body with scenarioData field
            elseif (isset($jsonInput['scenarioData'])) {
                $scenarioData = $jsonInput['scenarioData'];
            }
            // Case 3: Raw JSON body IS the scenario data
            elseif ($jsonInput && !empty($jsonInput)) {
                $scenarioData = $jsonInput;
            }

            // Log parsed scenario data if we have it
            if ($scenarioData) {
                Logger::log('scenarios', $method, 'create_parsed', $_SESSION['user_id'] ?? null, [
                    'scenarioData' => $scenarioData,
                    'has_data_field' => isset($scenarioData['data']),
                    'data_value' => $scenarioData['data'] ?? 'NOT_SET',
                    'has_media_field' => isset($scenarioData['media']),
                    'media_value' => $scenarioData['media'] ?? 'NOT_SET',
                    'all_keys' => array_keys($scenarioData)
                ], ['message' => 'Parsed scenarioData'], 200);
            }

            // Get fields from either direct POST or scenarioData
            $client_id = null;
            $emailBasedCreatedBy = null;
            $title = null;
            $description = null;
            $data = null;
            $medias = null;
            $game_meta = null;
            $game_type = null;
            $scenario_type = null;
            $scenario_layout = null;

            if ($scenarioData) {
                // Client app format
                // Store entire payload in game_meta
                $game_meta = $scenarioData;
                // Store the 'data' field in data column (default to empty object if not present)
                $data = $scenarioData['data'] ?? [];
                // Store the 'media' field in medias column (default to empty object if not present)
                $medias = $scenarioData['media'] ?? [];
                $title = $scenarioData['title'] ?? null;
                $description = $scenarioData['description'] ?? null;
                $game_type = $scenarioData['game_type'] ?? null;
                $scenario_type = $scenarioData['scenario_type'] ?? null;
                $scenario_layout = $scenarioData['scenario_layout'] ?? null;
                $uniqid = $scenarioData['uniqid'] ?? null;

                // Validate email exists in either admin_users or clients table
                // and set appropriate IDs for database relations
                if ($email) {
                    $admin = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);
                    $client = $db->fetch('SELECT id FROM clients WHERE email = ?', [$email]);

                    if (!$admin && !$client) {
                        // Email doesn't belong to admin or client - reject
                        Logger::log('scenarios', $method, 'create', null, ['email' => $email], ['error' => 'User not found'], 404, 'creator');
                        jsonResponse(['error' => 'User with this email not found. Please ensure the email is registered as either an admin or a client.'], 404);
                    }

                    // Set appropriate IDs based on whether it's an admin or client
                    if ($client) {
                        $client_id = (int)$client['id'];
                        $emailBasedCreatedBy = null; // Client scenarios don't need created_by
                    } else if ($admin) {
                        $client_id = null; // Admin scenarios are Taghunter Products
                        $emailBasedCreatedBy = (int)$admin['id']; // Store admin ID in created_by
                    }
                } elseif (isset($scenarioData['clientId']) && $scenarioData['clientId']) {
                    // Only use clientId from request if no email was provided
                    $client_id = (int)$scenarioData['clientId'];
                    $emailBasedCreatedBy = null;
                } elseif (isset($scenarioData['client_id']) && $scenarioData['client_id']) {
                    // Also check snake_case version
                    $client_id = (int)$scenarioData['client_id'];
                    $emailBasedCreatedBy = null;
                }
            } else {
                // Admin format - check for both 'media' and 'medias' field names
                $client_id = isset($_POST['client_id']) ? (int)$_POST['client_id'] : null;
                $title = $_POST['title'] ?? null;
                $description = $_POST['description'] ?? null;
                $data = $_POST['data'] ?? null;
                $medias = $_POST['medias'] ?? $_POST['media'] ?? null; // Check both singular and plural
                $game_meta = $_POST['game_meta'] ?? null;
                $game_type = $_POST['game_type'] ?? null;
                $scenario_type = $_POST['scenario_type'] ?? null;
                $scenario_layout = $_POST['scenario_layout'] ?? null;
                $uniqid = $_POST['uniqid'] ?? null;
            }

            // Log extracted fields before processing
            Logger::log('scenarios', $method, 'create_extracted', $_SESSION['user_id'] ?? null, [
                'medias_raw' => $medias,
                'medias_type' => gettype($medias),
                'medias_length' => is_string($medias) ? strlen($medias) : 'N/A',
                'medias_first_100' => is_string($medias) ? substr($medias, 0, 100) : $medias,
                'has_POST_media' => isset($_POST['media']),
                'has_POST_medias' => isset($_POST['medias'])
            ], ['message' => 'Extracted fields from POST'], 200);

            // Convert data to JSON string if it's an array
            if (is_array($data)) {
                $data = json_encode($data);
            } elseif (is_string($data) && !empty($data)) {
                // Validate it's valid JSON
                json_decode($data);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, ['data' => $data], ['error' => 'Invalid JSON in data'], 400);
                    jsonResponse(['error' => 'data must be valid JSON string or object'], 400);
                }
            }

            // Convert medias to JSON string if it's an array
            if (is_array($medias)) {
                $medias = json_encode($medias);
            } elseif (is_string($medias) && !empty($medias)) {
                // Validate it's valid JSON
                json_decode($medias);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, ['medias' => $medias], ['error' => 'Invalid JSON in medias'], 400);
                    jsonResponse(['error' => 'medias must be valid JSON string or object'], 400);
                }
            }

            // Convert game_meta to JSON string if it's an array
            if (is_array($game_meta)) {
                $game_meta = json_encode($game_meta);
            } elseif (is_string($game_meta) && !empty($game_meta)) {
                // Validate it's valid JSON
                json_decode($game_meta);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, ['game_meta' => $game_meta], ['error' => 'Invalid JSON in game_meta'], 400);
                    jsonResponse(['error' => 'game_meta must be valid JSON string or object'], 400);
                }
            }

            // Convert scenario_layout to JSON string if it's an array
            if (is_array($scenario_layout)) {
                $scenario_layout = json_encode($scenario_layout);
            } elseif (is_string($scenario_layout) && !empty($scenario_layout)) {
                // Validate it's valid JSON
                json_decode($scenario_layout);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, ['scenario_layout' => $scenario_layout], ['error' => 'Invalid JSON in scenario_layout'], 400);
                    jsonResponse(['error' => 'scenario_layout must be valid JSON string or array'], 400);
                }
            }

            // Ensure data, medias, and game_meta are never null - use empty JSON object if needed
            if ($data === null || $data === '') {
                $data = '{}';
            }
            if ($medias === null || $medias === '') {
                $medias = '{}';
            }
            if ($game_meta === null || $game_meta === '') {
                $game_meta = '{}';
            }
            if ($scenario_layout === null || $scenario_layout === '') {
                $scenario_layout = '[]';
            }

            // Validate required fields
            if (!$title || !$description || !$uniqid) {
                Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Missing required fields'], 400);
                jsonResponse(['error' => 'Missing required fields: title, description, uniqid'], 400);
            }

            $title = trim($title);
            $description = trim($description);
            $uniqid = trim($uniqid);

            if (empty($title) || empty($description) || empty($uniqid)) {
                Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Empty fields'], 400);
                jsonResponse(['error' => 'Title, description, and uniqid cannot be empty'], 400);
            }

            // Verify client exists if client_id provided (client_id is optional)
            if ($client_id) {
                $client = $db->fetch('SELECT id FROM clients WHERE id = ?', [$client_id]);
                if (!$client) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Client not found'], 404);
                    jsonResponse(['error' => 'Client not found'], 404);
                }
            }

            // Skip file upload for now - will be handled in a separate request
            $media_path = null;

            // Check if scenario with this uniqid already exists
            $existingScenario = $db->fetch('SELECT id, created_at FROM scenarios WHERE uniqid = ?', [$uniqid]);

            // Set created_by: prefer session user, fall back to email-based lookup
            $created_by = $_SESSION['user_id'] ?? ($emailBasedCreatedBy ?? null);
            $isUpdate = false;
            $scenario_id = null;
            $created_at = null;

            // Log final values before database operation
            // is_taghunter_product: true only if scenario_type is NOT 'custom' (i.e., it's a template or base game)
            $is_taghunter_product = ($scenario_type !== 'custom');

            Logger::log('scenarios', $method, 'create_pre_db', $_SESSION['user_id'] ?? null, [
                'client_id' => $client_id,
                'created_by' => $created_by,
                'is_taghunter_product' => $is_taghunter_product,
                'email' => $email,
                'title' => $title,
                'description' => substr($description, 0, 100),
                'data' => $data === '{}' ? 'EMPTY_OBJECT' : (is_string($data) ? substr($data, 0, 200) : 'ARRAY'),
                'medias' => $medias === '{}' ? 'EMPTY_OBJECT' : (is_string($medias) ? substr($medias, 0, 200) : 'ARRAY'),
                'medias_full' => $medias,
                'game_meta' => $game_meta === '{}' ? 'EMPTY_OBJECT' : (is_string($game_meta) ? substr($game_meta, 0, 100) : 'ARRAY'),
                'game_type' => $game_type,
                'scenario_type' => $scenario_type,
                'uniqid' => $uniqid,
                'is_update' => $existingScenario ? true : false
            ], ['message' => 'Values before DB operation'], 200);

            if ($existingScenario) {
                // Update existing scenario
                $scenario_id = $existingScenario['id'];
                $created_at = $existingScenario['created_at'];
                $isUpdate = true;

                $sql = 'UPDATE scenarios SET client_id = ?, title = ?, description = ?, data = ?, medias = ?, game_meta = ?, game_type = ?, scenario_type = ?, scenario_layout = ?, updated_at = CURRENT_TIMESTAMP WHERE uniqid = ?';
                $db->query($sql, [$client_id, $title, $description, $data, $medias, $game_meta, $game_type, $scenario_type, $scenario_layout, $uniqid]);
            } else {
                // Insert new scenario
                $sql = 'INSERT INTO scenarios (client_id, title, description, media_url, data, medias, game_meta, game_type, scenario_type, scenario_layout, uniqid, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                $db->query($sql, [$client_id, $title, $description, $media_path, $data, $medias, $game_meta, $game_type, $scenario_type, $scenario_layout, $uniqid, $created_by]);
                $scenario_id = $db->getConnection()->lastInsertId();
                $created_at = date('Y-m-d H:i:s');
            }

            $responseData = [
                'success' => true,
                'data' => [
                    'id' => $scenario_id,
                    'client_id' => $client_id,
                    'email' => $email,
                    'is_taghunter_product' => $client_id === null,
                    'title' => $title,
                    'description' => $description,
                    'media_url' => $media_path,
                    'data' => $data,
                    'medias' => $medias,
                    'game_meta' => $game_meta,
                    'game_type' => $game_type,
                    'scenario_type' => $scenario_type,
                    'uniqid' => $uniqid,
                    'created_at' => $created_at
                ],
                'message' => $isUpdate ? 'Scenario updated successfully' : 'Scenario created successfully'
            ];

            Logger::log('scenarios', $method, $isUpdate ? 'update' : 'create', $_SESSION['user_id'] ?? null, [
                'client_id' => $client_id,
                'is_taghunter_product' => $client_id === null,
                'title' => $title,
                'email' => $email,
                'uniqid' => $uniqid
            ], $responseData, $isUpdate ? 200 : 201, $logSource);
            jsonResponse($responseData, $isUpdate ? 200 : 201);
            break;

        case 'list':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                Logger::log('scenarios', $method, 'list', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $client_id = $_GET['client_id'] ?? null;

            if ($client_id) {
                $scenarios = $db->fetchAll(
                    'SELECT s.*, a.name as creator_name
                     FROM scenarios s
                     LEFT JOIN admin_users a ON s.created_by = a.id
                     WHERE s.client_id = ?
                     ORDER BY s.created_at DESC',
                    [(int)$client_id]
                );
            } else {
                $scenarios = $db->fetchAll(
                    'SELECT s.*, a.name as creator_name, c.name as client_name, c.email as client_email
                     FROM scenarios s
                     LEFT JOIN admin_users a ON s.created_by = a.id
                     LEFT JOIN clients c ON s.client_id = c.id
                     ORDER BY s.created_at DESC'
                );
            }

            Logger::log('scenarios', $method, 'list', $_SESSION['user_id'], ['client_id' => $client_id], ['count' => count($scenarios)], 200);
            jsonResponse(['scenarios' => $scenarios]);
            break;

        case 'get':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                Logger::log('scenarios', $method, 'get', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $id = $_GET['id'] ?? null;
            if (!$id) {
                Logger::log('scenarios', $method, 'get', $_SESSION['user_id'], [], ['error' => 'Missing ID'], 400);
                jsonResponse(['error' => 'Scenario ID is required'], 400);
            }

            $scenario = $db->fetch(
                'SELECT s.*, a.name as creator_name, c.name as client_name, c.email as client_email
                 FROM scenarios s
                 LEFT JOIN admin_users a ON s.created_by = a.id
                 LEFT JOIN clients c ON s.client_id = c.id
                 WHERE s.id = ?',
                [(int)$id]
            );

            if (!$scenario) {
                Logger::log('scenarios', $method, 'get', $_SESSION['user_id'], ['id' => $id], ['error' => 'Not found'], 404);
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            Logger::log('scenarios', $method, 'get', $_SESSION['user_id'], ['id' => $id], ['success' => true], 200);
            jsonResponse(['scenario' => $scenario]);
            break;

        case 'update':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            if (!isset($_POST['id'])) {
                jsonResponse(['error' => 'Scenario ID is required'], 400);
            }

            $id = (int)$_POST['id'];

            // Verify scenario exists
            $scenario = $db->fetch('SELECT * FROM scenarios WHERE id = ?', [$id]);
            if (!$scenario) {
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            $title = isset($_POST['title']) ? trim($_POST['title']) : $scenario['title'];
            $description = isset($_POST['description']) ? trim($_POST['description']) : $scenario['description'];
            $media_path = $scenario['media_url'];
            $data = isset($_POST['data']) ? $_POST['data'] : $scenario['data'];
            $medias = isset($_POST['medias']) ? $_POST['medias'] : $scenario['medias'];
            $game_meta = isset($_POST['game_meta']) ? $_POST['game_meta'] : $scenario['game_meta'];
            $game_type = isset($_POST['game_type']) ? $_POST['game_type'] : $scenario['game_type'];
            $scenario_type = isset($_POST['scenario_type']) ? $_POST['scenario_type'] : $scenario['scenario_type'];

            // Convert data to JSON string if it's an array
            if (is_array($data)) {
                $data = json_encode($data);
            } elseif (is_string($data) && !empty($data)) {
                // Validate it's valid JSON
                json_decode($data);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    jsonResponse(['error' => 'data must be valid JSON string or object'], 400);
                }
            }

            // Convert medias to JSON string if it's an array
            if (is_array($medias)) {
                $medias = json_encode($medias);
            } elseif (is_string($medias) && !empty($medias)) {
                // Validate it's valid JSON
                json_decode($medias);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    jsonResponse(['error' => 'medias must be valid JSON string or object'], 400);
                }
            }

            // Convert game_meta to JSON string if it's an array
            if (is_array($game_meta)) {
                $game_meta = json_encode($game_meta);
            } elseif (is_string($game_meta) && !empty($game_meta)) {
                // Validate it's valid JSON
                json_decode($game_meta);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    jsonResponse(['error' => 'game_meta must be valid JSON string or object'], 400);
                }
            }

            // Ensure data, medias, and game_meta are never null - use empty JSON object if needed
            if ($data === null || $data === '') {
                $data = '{}';
            }
            if ($medias === null || $medias === '') {
                $medias = '{}';
            }
            if ($game_meta === null || $game_meta === '') {
                $game_meta = '{}';
            }

            // Handle new zip file upload
            if (isset($_FILES['zip_file']) && $_FILES['zip_file']['error'] === UPLOAD_ERR_OK) {
                $file = $_FILES['zip_file'];

                // Validate file type
                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                $mimeType = finfo_file($finfo, $file['tmp_name']);
                finfo_close($finfo);

                $allowedTypes = ['application/zip', 'application/x-zip-compressed'];
                if (!in_array($mimeType, $allowedTypes)) {
                    jsonResponse(['error' => 'Only zip files are allowed'], 400);
                }

                // Validate file size (50MB max)
                if ($file['size'] > 50 * 1024 * 1024) {
                    jsonResponse(['error' => 'File size must be less than 50MB'], 400);
                }

                // Delete old file if exists
                if ($media_path && file_exists(__DIR__ . '/../../' . $media_path)) {
                    unlink(__DIR__ . '/../../' . $media_path);
                }

                // Create upload directory if it doesn't exist
                $uploadDir = __DIR__ . '/../../uploads/scenarios/';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0755, true);
                }

                // Generate unique filename
                $fileExtension = pathinfo($file['name'], PATHINFO_EXTENSION);
                $uniqueName = uniqid('scenario_', true) . '.' . $fileExtension;
                $uploadPath = $uploadDir . $uniqueName;

                // Move uploaded file
                if (!move_uploaded_file($file['tmp_name'], $uploadPath)) {
                    jsonResponse(['error' => 'Failed to upload file'], 500);
                }

                $media_path = '/uploads/scenarios/' . $uniqueName;
            }

            // Update scenario
            $sql = 'UPDATE scenarios SET title = ?, description = ?, media_url = ?, data = ?, medias = ?, game_meta = ?, game_type = ?, scenario_type = ?, updated_at = NOW() WHERE id = ?';
            $db->query($sql, [$title, $description, $media_path, $data, $medias, $game_meta, $game_type, $scenario_type, $id]);

            jsonResponse([
                'success' => true,
                'scenario' => [
                    'id' => $id,
                    'title' => $title,
                    'description' => $description,
                    'media_url' => $media_path,
                    'data' => $data,
                    'medias' => $medias,
                    'game_meta' => $game_meta,
                    'game_type' => $game_type,
                    'scenario_type' => $scenario_type
                ],
                'message' => 'Scenario updated successfully'
            ]);
            break;

        case 'delete':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                Logger::log('scenarios', $method, 'delete', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $id = $data['id'] ?? $_GET['id'] ?? null;

            if (!$id) {
                Logger::log('scenarios', $method, 'delete', $_SESSION['user_id'], [], ['error' => 'Missing ID'], 400);
                jsonResponse(['error' => 'Scenario ID is required'], 400);
            }

            // Get scenario to delete associated files
            $scenario = $db->fetch('SELECT media_url, uniqid FROM scenarios WHERE id = ?', [(int)$id]);
            if (!$scenario) {
                Logger::log('scenarios', $method, 'delete', $_SESSION['user_id'], ['id' => $id], ['error' => 'Not found'], 404);
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            // Delete zip file if exists
            if ($scenario['media_url'] && file_exists(__DIR__ . '/../../' . $scenario['media_url'])) {
                unlink(__DIR__ . '/../../' . $scenario['media_url']);
            }

            // Delete media directory if exists
            if ($scenario['uniqid']) {
                $mediaDir = __DIR__ . '/../../media/' . $scenario['uniqid'];
                if (is_dir($mediaDir)) {
                    $files = array_diff(scandir($mediaDir), ['.', '..']);
                    foreach ($files as $file) {
                        $filePath = $mediaDir . '/' . $file;
                        if (is_file($filePath)) {
                            unlink($filePath);
                        }
                    }
                    rmdir($mediaDir);
                }
            }

            // Delete scenario from database
            $db->query('DELETE FROM scenarios WHERE id = ?', [(int)$id]);

            Logger::log('scenarios', $method, 'delete', $_SESSION['user_id'], ['id' => $id], ['success' => true], 200);
            jsonResponse([
                'success' => true,
                'message' => 'Scenario deleted successfully'
            ]);
            break;

        case 'upload_media':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                Logger::log('scenarios', $method, 'upload_media', null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            // Get required fields
            $uniqid = $_POST['uniqid'] ?? null;
            $email = $_POST['email'] ?? null;

            // Validate required fields
            if (!$uniqid || !$email) {
                Logger::log('scenarios', $method, 'upload_media', null, $_POST, ['error' => 'Missing required fields'], 400);
                jsonResponse(['error' => 'uniqid and email are required'], 400);
            }

            // Validate file upload
            if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                $errorMsg = isset($_FILES['file']) ? 'Upload error: ' . $_FILES['file']['error'] : 'No file uploaded';
                Logger::log('scenarios', $method, 'upload_media', null, $_POST, ['error' => $errorMsg], 400);
                jsonResponse(['error' => $errorMsg], 400);
            }

            $file = $_FILES['file'];

            // Verify scenario exists and belongs to user
            $scenario = $db->fetch(
                'SELECT s.id, s.uniqid, s.email as scenario_email
                 FROM scenarios s
                 WHERE s.uniqid = ?',
                [$uniqid]
            );

            if (!$scenario) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid, 'email' => $email], ['error' => 'Scenario not found'], 404);
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            // Verify ownership - check if email matches scenario email or user is an admin
            $isOwner = $scenario['scenario_email'] === $email;

            // Also check if the email exists in admin_users table (for any admin)
            $isAdmin = false;
            if (!$isOwner) {
                $adminCheck = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);
                $isAdmin = ($adminCheck !== false);
            }

            if (!$isOwner && !$isAdmin) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid, 'email' => $email], ['error' => 'Unauthorized - email mismatch'], 403);
                jsonResponse(['error' => 'Unauthorized - scenario does not belong to this user'], 403);
            }

            // Validate file size (50MB max)
            if ($file['size'] > 50 * 1024 * 1024) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid], ['error' => 'File too large'], 400);
                jsonResponse(['error' => 'File size must be less than 50MB'], 400);
            }

            // Create media directory structure: /media/{uniqid}/
            $mediaBaseDir = __DIR__ . '/../../media/';
            $scenarioMediaDir = $mediaBaseDir . $uniqid . '/';

            if (!is_dir($scenarioMediaDir)) {
                if (!mkdir($scenarioMediaDir, 0755, true)) {
                    Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid], ['error' => 'Failed to create directory'], 500);
                    jsonResponse(['error' => 'Failed to create media directory'], 500);
                }
            }

            // Sanitize filename
            $originalFilename = basename($file['name']);
            $originalFilename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $originalFilename);

            // Full path for the file
            $filePath = $scenarioMediaDir . $originalFilename;

            // Move uploaded file
            if (!move_uploaded_file($file['tmp_name'], $filePath)) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid], ['error' => 'Failed to move file'], 500);
                jsonResponse(['error' => 'Failed to save file'], 500);
            }

            // Build response
            $relativePath = '/media/' . $uniqid . '/' . $originalFilename;
            $fullUrl = 'https://admin.taghunter.fr' . $relativePath;

            $responseData = [
                'success' => true,
                'data' => [
                    'name' => $originalFilename,
                    'path' => $relativePath,
                    'url' => $fullUrl
                ],
                'message' => 'File uploaded successfully'
            ];

            Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid, 'email' => $email, 'filename' => $originalFilename], $responseData, 200, 'creator');
            jsonResponse($responseData, 200);
            break;

        default:
            Logger::log('scenarios', $method, $action ?: 'none', $_SESSION['user_id'] ?? null, [], ['error' => 'Invalid action'], 400);
            jsonResponse(['error' => 'Invalid action. Available actions: create, list, get, update, delete, upload_media'], 400);
    }
} catch (Exception $e) {
    Logger::log('scenarios', $method, $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
