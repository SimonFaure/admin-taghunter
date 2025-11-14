<?php

header('Access-Control-Allow-Origin: https://admin.taghunter.fr');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

session_start();

require_once __DIR__ . '/../database/Database.php';

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

    switch ($action) {
        case 'create':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            // Validate required fields
            if (!isset($_POST['client_id']) || !isset($_POST['title']) || !isset($_POST['description'])) {
                jsonResponse(['error' => 'Missing required fields: client_id, title, description'], 400);
            }

            $client_id = (int)$_POST['client_id'];
            $title = trim($_POST['title']);
            $description = trim($_POST['description']);

            if (empty($title) || empty($description)) {
                jsonResponse(['error' => 'Title and description cannot be empty'], 400);
            }

            // Verify client exists
            $client = $db->fetch('SELECT id FROM clients WHERE id = ?', [$client_id]);
            if (!$client) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

            // Handle zip file upload
            $media_path = null;
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

            // Insert scenario into database
            $sql = 'INSERT INTO scenarios (client_id, title, description, media_url, created_by) VALUES (?, ?, ?, ?, ?)';
            $db->query($sql, [$client_id, $title, $description, $media_path, $_SESSION['user_id']]);

            $scenario_id = $db->getConnection()->lastInsertId();

            jsonResponse([
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
            ], 201);
            break;

        case 'list':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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

            jsonResponse(['scenarios' => $scenarios]);
            break;

        case 'get':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $id = $_GET['id'] ?? null;
            if (!$id) {
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
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

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
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $id = $data['id'] ?? $_GET['id'] ?? null;

            if (!$id) {
                jsonResponse(['error' => 'Scenario ID is required'], 400);
            }

            // Get scenario to delete associated file
            $scenario = $db->fetch('SELECT media_url FROM scenarios WHERE id = ?', [(int)$id]);
            if (!$scenario) {
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            // Delete file if exists
            if ($scenario['media_url'] && file_exists(__DIR__ . '/../../' . $scenario['media_url'])) {
                unlink(__DIR__ . '/../../' . $scenario['media_url']);
            }

            // Delete scenario from database
            $db->query('DELETE FROM scenarios WHERE id = ?', [(int)$id]);

            jsonResponse([
                'success' => true,
                'message' => 'Scenario deleted successfully'
            ]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action. Available actions: create, list, get, update, delete'], 400);
    }
} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
