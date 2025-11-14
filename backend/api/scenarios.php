<?php

$allowedOrigins = [
    'https://admin.taghunter.fr',
    'http://localhost:5173',
    'http://localhost:3000',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if (in_array($origin, $allowedOrigins) || preg_match('/\.webcontainer-api\.io$/', $origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
} else {
    // Allow all origins for scenario uploads from client apps
    header('Access-Control-Allow-Origin: *');
}

header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

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

            if ($scenarioData) {
                // Client app format
                $title = $scenarioData['title'] ?? null;
                $description = $scenarioData['description'] ?? null;

                // Look up client by email
                if ($userEmail) {
                    $client = $db->fetch('SELECT id FROM clients WHERE email = ?', [$userEmail]);
                    if ($client) {
                        $client_id = (int)$client['id'];
                    }
                }
            } else {
                // Admin format
                $client_id = isset($_POST['client_id']) ? (int)$_POST['client_id'] : null;
                $title = $_POST['title'] ?? null;
                $description = $_POST['description'] ?? null;
            }

            // Validate required fields
            if (!$title || !$description) {
                Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Missing title or description'], 400);
                jsonResponse(['error' => 'Missing required fields: title, description'], 400);
            }

            $title = trim($title);
            $description = trim($description);

            if (empty($title) || empty($description)) {
                Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Empty fields'], 400);
                jsonResponse(['error' => 'Title and description cannot be empty'], 400);
            }

            // For client requests, client_id might be null if email not found
            if (!$client_id && $userEmail) {
                Logger::log('scenarios', $method, 'create', null, ['email' => $userEmail], ['error' => 'Client not found for email'], 404);
                jsonResponse(['error' => 'Client not found for email: ' . $userEmail], 404);
            }

            // Verify client exists if client_id provided
            if ($client_id) {
                $client = $db->fetch('SELECT id FROM clients WHERE id = ?', [$client_id]);
                if (!$client) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Client not found'], 404);
                    jsonResponse(['error' => 'Client not found'], 404);
                }
            }

            // Handle zip file upload (accept both 'zip_file' and 'scenario' field names)
            $media_path = null;
            $fileField = isset($_FILES['scenario']) ? 'scenario' : 'zip_file';

            if (isset($_FILES[$fileField]) && $_FILES[$fileField]['error'] === UPLOAD_ERR_OK) {
                $file = $_FILES[$fileField];

                // Validate file type
                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                $mimeType = finfo_file($finfo, $file['tmp_name']);
                finfo_close($finfo);

                $allowedTypes = ['application/zip', 'application/x-zip-compressed'];
                if (!in_array($mimeType, $allowedTypes)) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'], $_POST, ['error' => 'Invalid file type'], 400);
                    jsonResponse(['error' => 'Only zip files are allowed'], 400);
                }

                // Validate file size (50MB max)
                if ($file['size'] > 50 * 1024 * 1024) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'], $_POST, ['error' => 'File too large'], 400);
                    jsonResponse(['error' => 'File size must be less than 50MB'], 400);
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
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'], $_POST, ['error' => 'Upload failed'], 500);
                    jsonResponse(['error' => 'Failed to upload file'], 500);
                }

                $media_path = '/uploads/scenarios/' . $uniqueName;
            }

            // Insert scenario into database
            $created_by = $_SESSION['user_id'] ?? null;
            $sql = 'INSERT INTO scenarios (client_id, title, description, media_url, created_by) VALUES (?, ?, ?, ?, ?)';
            $db->query($sql, [$client_id, $title, $description, $media_path, $created_by]);

            $scenario_id = $db->getConnection()->lastInsertId();

            $responseData = [
                'success' => true,
                'scenario' => [
                    'id' => $scenario_id,
                    'client_id' => $client_id,
                    'title' => $title,
                    'description' => $description,
                    'media_url' => $media_path,
                    'created_at' => date('Y-m-d H:i:s')
                ],
                'message' => 'Scenario created successfully'
            ];

            Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, ['client_id' => $client_id, 'title' => $title, 'email' => $userEmail], $responseData, 201);
            jsonResponse($responseData, 201);
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
            $sql = 'UPDATE scenarios SET title = ?, description = ?, media_url = ?, updated_at = NOW() WHERE id = ?';
            $db->query($sql, [$title, $description, $media_path, $id]);

            jsonResponse([
                'success' => true,
                'scenario' => [
                    'id' => $id,
                    'title' => $title,
                    'description' => $description,
                    'media_url' => $media_path
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

            // Get scenario to delete associated file
            $scenario = $db->fetch('SELECT media_url FROM scenarios WHERE id = ?', [(int)$id]);
            if (!$scenario) {
                Logger::log('scenarios', $method, 'delete', $_SESSION['user_id'], ['id' => $id], ['error' => 'Not found'], 404);
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            // Delete file if exists
            if ($scenario['media_url'] && file_exists(__DIR__ . '/../../' . $scenario['media_url'])) {
                unlink(__DIR__ . '/../../' . $scenario['media_url']);
            }

            // Delete scenario from database
            $db->query('DELETE FROM scenarios WHERE id = ?', [(int)$id]);

            Logger::log('scenarios', $method, 'delete', $_SESSION['user_id'], ['id' => $id], ['success' => true], 200);
            jsonResponse([
                'success' => true,
                'message' => 'Scenario deleted successfully'
            ]);
            break;

        default:
            Logger::log('scenarios', $method, $action ?: 'none', $_SESSION['user_id'] ?? null, [], ['error' => 'Invalid action'], 400);
            jsonResponse(['error' => 'Invalid action. Available actions: create, list, get, update, delete'], 400);
    }
} catch (Exception $e) {
    Logger::log('scenarios', $method, $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
