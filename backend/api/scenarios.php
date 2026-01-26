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

            // Check if this is an admin request (with session) or client request (with email)
            $isAdminRequest = isset($_SESSION['user_id']);
            $userEmail = $_POST['userEmail'] ?? null;

            if (!$isAdminRequest && !$userEmail) {
                Logger::log('scenarios', $method, 'create', null, $_POST, ['error' => 'Unauthorized - no session or email'], 401);
                jsonResponse(['error' => 'Unauthorized'], 401);
            }

            // Parse scenario data if it's JSON string
            $scenarioData = null;
            if (isset($_POST['scenarioData'])) {
                $scenarioData = json_decode($_POST['scenarioData'], true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Invalid JSON in scenarioData'], 400);
                    jsonResponse(['error' => 'Invalid JSON in scenarioData'], 400);
                }
            }

            // Get fields from either direct POST or scenarioData
            $client_id = null;
            $title = null;
            $description = null;
            $game_data = null;
            $game_meta = null;
            $game_type = null;
            $scenario_type = null;

            if ($scenarioData) {
                // Client app format
                // Store entire payload in game_meta
                $game_meta = $scenarioData;
                // Store only the 'data' field in game_data
                $game_data = $scenarioData['data'] ?? null;
                $title = $scenarioData['title'] ?? null;
                $description = $scenarioData['description'] ?? null;
                $game_type = $scenarioData['game_type'] ?? null;
                $scenario_type = $scenarioData['scenario_type'] ?? null;
                $uniqid = $scenarioData['uniqid'] ?? null;

                // Look up client by email or clientId
                if ($userEmail) {
                    $client = $db->fetch('SELECT id FROM clients WHERE email = ?', [$userEmail]);
                    if ($client) {
                        $client_id = (int)$client['id'];
                    }
                } elseif (isset($scenarioData['clientId'])) {
                    $client_id = (int)$scenarioData['clientId'];
                }
            } else {
                // Admin format
                $client_id = isset($_POST['client_id']) ? (int)$_POST['client_id'] : null;
                $title = $_POST['title'] ?? null;
                $description = $_POST['description'] ?? null;
                $game_data = $_POST['game_data'] ?? null;
                $game_meta = $_POST['game_meta'] ?? null;
                $game_type = $_POST['game_type'] ?? null;
                $scenario_type = $_POST['scenario_type'] ?? null;
                $uniqid = $_POST['uniqid'] ?? null;
            }

            // Convert game_data to JSON string if it's an array
            // Or validate it's valid JSON if it's a string
            if (is_array($game_data)) {
                $game_data = json_encode($game_data);
            } elseif (is_string($game_data) && !empty($game_data)) {
                // Validate it's valid JSON
                json_decode($game_data);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, ['game_data' => $game_data], ['error' => 'Invalid JSON in game_data'], 400);
                    jsonResponse(['error' => 'game_data must be valid JSON string or object'], 400);
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

            $created_by = $_SESSION['user_id'] ?? null;
            $isUpdate = false;
            $scenario_id = null;
            $created_at = null;

            if ($existingScenario) {
                // Update existing scenario
                $scenario_id = $existingScenario['id'];
                $created_at = $existingScenario['created_at'];
                $isUpdate = true;

                $sql = 'UPDATE scenarios SET client_id = ?, title = ?, description = ?, game_data = ?, game_meta = ?, game_type = ?, scenario_type = ?, updated_at = CURRENT_TIMESTAMP WHERE uniqid = ?';
                $db->query($sql, [$client_id, $title, $description, $game_data, $game_meta, $game_type, $scenario_type, $uniqid]);
            } else {
                // Insert new scenario
                $sql = 'INSERT INTO scenarios (client_id, title, description, media_url, game_data, game_meta, game_type, scenario_type, uniqid, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                $db->query($sql, [$client_id, $title, $description, $media_path, $game_data, $game_meta, $game_type, $scenario_type, $uniqid, $created_by]);
                $scenario_id = $db->getConnection()->lastInsertId();
                $created_at = date('Y-m-d H:i:s');
            }

            $responseData = [
                'success' => true,
                'scenario' => [
                    'id' => $scenario_id,
                    'client_id' => $client_id,
                    'title' => $title,
                    'description' => $description,
                    'media_url' => $media_path,
                    'game_data' => $game_data,
                    'game_meta' => $game_meta,
                    'game_type' => $game_type,
                    'scenario_type' => $scenario_type,
                    'uniqid' => $uniqid,
                    'created_at' => $created_at
                ],
                'message' => $isUpdate ? 'Scenario updated successfully' : 'Scenario created successfully'
            ];

            Logger::log('scenarios', $method, $isUpdate ? 'update' : 'create', $_SESSION['user_id'] ?? null, ['client_id' => $client_id, 'title' => $title, 'email' => $userEmail, 'uniqid' => $uniqid], $responseData, $isUpdate ? 200 : 201);
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
            $game_data = isset($_POST['game_data']) ? $_POST['game_data'] : $scenario['game_data'];
            $game_meta = isset($_POST['game_meta']) ? $_POST['game_meta'] : $scenario['game_meta'];
            $game_type = isset($_POST['game_type']) ? $_POST['game_type'] : $scenario['game_type'];
            $scenario_type = isset($_POST['scenario_type']) ? $_POST['scenario_type'] : $scenario['scenario_type'];

            // Convert game_data to JSON string if it's an array
            // Or validate it's valid JSON if it's a string
            if (is_array($game_data)) {
                $game_data = json_encode($game_data);
            } elseif (is_string($game_data) && !empty($game_data)) {
                // Validate it's valid JSON
                json_decode($game_data);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    jsonResponse(['error' => 'game_data must be valid JSON string or object'], 400);
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
            $sql = 'UPDATE scenarios SET title = ?, description = ?, media_url = ?, game_data = ?, game_meta = ?, game_type = ?, scenario_type = ?, updated_at = NOW() WHERE id = ?';
            $db->query($sql, [$title, $description, $media_path, $game_data, $game_meta, $game_type, $scenario_type, $id]);

            jsonResponse([
                'success' => true,
                'scenario' => [
                    'id' => $id,
                    'title' => $title,
                    'description' => $description,
                    'media_url' => $media_path,
                    'game_data' => $game_data,
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
            $userEmail = $_POST['userEmail'] ?? null;

            // Validate required fields
            if (!$uniqid || !$userEmail) {
                Logger::log('scenarios', $method, 'upload_media', null, $_POST, ['error' => 'Missing required fields'], 400);
                jsonResponse(['error' => 'uniqid and userEmail are required'], 400);
            }

            // Validate file upload
            if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                $errorMsg = isset($_FILES['file']) ? 'Upload error: ' . $_FILES['file']['error'] : 'No file uploaded';
                Logger::log('scenarios', $method, 'upload_media', null, $_POST, ['error' => $errorMsg], 400);
                jsonResponse(['error' => $errorMsg], 400);
            }

            $file = $_FILES['file'];

            // Verify scenario exists and belongs to userEmail
            $scenario = $db->fetch(
                'SELECT s.id, s.uniqid, c.email as client_email, a.email as admin_email
                 FROM scenarios s
                 LEFT JOIN clients c ON s.client_id = c.id
                 LEFT JOIN admin_users a ON s.created_by = a.id
                 WHERE s.uniqid = ?',
                [$uniqid]
            );

            if (!$scenario) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid, 'userEmail' => $userEmail], ['error' => 'Scenario not found'], 404);
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            // Verify ownership - check if email matches either client or admin
            $isClientOwner = $scenario['client_email'] === $userEmail;
            $isAdminOwner = $scenario['admin_email'] === $userEmail;

            // Also check if the email exists in admin_users table (for any admin)
            $isAdmin = false;
            if (!$isClientOwner && !$isAdminOwner) {
                $adminCheck = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$userEmail]);
                $isAdmin = ($adminCheck !== false);
            }

            if (!$isClientOwner && !$isAdminOwner && !$isAdmin) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid, 'userEmail' => $userEmail], ['error' => 'Unauthorized - email mismatch'], 403);
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
                'file' => [
                    'name' => $originalFilename,
                    'path' => $relativePath,
                    'url' => $fullUrl
                ]
            ];

            Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid, 'userEmail' => $userEmail, 'filename' => $originalFilename], $responseData, 200);
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
