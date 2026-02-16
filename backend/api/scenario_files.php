<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/Logger.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

Logger::log("scenario_files.php - Action: $action");
Logger::log("scenario_files.php - POST data: " . json_encode($_POST));
Logger::log("scenario_files.php - FILES data: " . json_encode(array_map(function($file) {
    return [
        'name' => $file['name'] ?? null,
        'type' => $file['type'] ?? null,
        'size' => $file['size'] ?? null,
        'error' => $file['error'] ?? null
    ];
}, $_FILES)));

try {
    $pdo = getDbConnection();
    Logger::log("scenario_files.php - Database connection established");

    switch ($action) {
        case 'upload':
            handleUpload($pdo);
            break;

        case 'list':
            handleList($pdo);
            break;

        case 'delete':
            handleDelete($pdo);
            break;

        case 'download_zip':
            handleDownloadZip($pdo);
            break;

        default:
            Logger::log("scenario_files.php - Invalid action: $action", 'ERROR');
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action']);
    }
} catch (Exception $e) {
    Logger::log("scenario_files.php - Exception: " . $e->getMessage(), 'ERROR');
    Logger::log("scenario_files.php - Stack trace: " . $e->getTraceAsString(), 'ERROR');
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function handleUpload($pdo) {
    Logger::log("handleUpload - Starting file upload");

    if (!isset($_FILES['file']) || !isset($_POST['scenario_id']) || !isset($_POST['name']) || !isset($_POST['email'])) {
        Logger::log("handleUpload - Missing required fields", 'ERROR');
        Logger::log("handleUpload - FILES isset: " . (isset($_FILES['file']) ? 'yes' : 'no'));
        Logger::log("handleUpload - scenario_id isset: " . (isset($_POST['scenario_id']) ? 'yes' : 'no'));
        Logger::log("handleUpload - name isset: " . (isset($_POST['name']) ? 'yes' : 'no'));
        Logger::log("handleUpload - email isset: " . (isset($_POST['email']) ? 'yes' : 'no'));
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: file, scenario_id, name, email']);
        return;
    }

    $scenarioId = $_POST['scenario_id'];
    $name = $_POST['name'];
    $email = $_POST['email'];
    $file = $_FILES['file'];

    Logger::log("handleUpload - Scenario ID: $scenarioId, Name: $name");
    Logger::log("handleUpload - File error code: " . $file['error']);

    if ($file['error'] !== UPLOAD_ERR_OK) {
        Logger::log("handleUpload - File upload error: " . $file['error'], 'ERROR');
        http_response_code(400);
        echo json_encode(['error' => 'File upload error: ' . $file['error']]);
        return;
    }

    Logger::log("handleUpload - Querying scenario with ID: $scenarioId");
    $stmt = $pdo->prepare("
        SELECT s.id, s.uniqid, s.client_id, s.created_by,
               c.email as client_email,
               a.email as admin_email
        FROM scenarios s
        LEFT JOIN clients c ON s.client_id = c.id
        LEFT JOIN admin_users a ON s.created_by = a.id
        WHERE s.id = ?
    ");
    $stmt->execute([$scenarioId]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        Logger::log("handleUpload - Scenario not found with ID: $scenarioId", 'ERROR');
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    // Verify ownership - check if email matches scenario's client or creator
    $isOwner = ($scenario['client_email'] === $email) || ($scenario['admin_email'] === $email);

    // Check if email belongs to any admin user
    $isAdmin = false;
    if (!$isOwner) {
        $stmt = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt->execute([$email]);
        $adminCheck = $stmt->fetch(PDO::FETCH_ASSOC);
        $isAdmin = ($adminCheck !== false);
    }

    if (!$isOwner && !$isAdmin) {
        Logger::log("handleUpload - Unauthorized access attempt by: $email", 'ERROR');
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized - scenario does not belong to this user']);
        return;
    }

    Logger::log("handleUpload - Access granted for user: $email");

    $uniqid = $scenario['uniqid'];
    Logger::log("handleUpload - Found scenario with uniqid: $uniqid");

    $uploadDir = __DIR__ . '/../../media/' . $uniqid . '/files/';
    Logger::log("handleUpload - Upload directory: $uploadDir");

    if (!file_exists($uploadDir)) {
        Logger::log("handleUpload - Creating upload directory");
        if (!mkdir($uploadDir, 0755, true)) {
            Logger::log("handleUpload - Failed to create directory", 'ERROR');
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create upload directory']);
            return;
        }
    }

    $originalFilename = basename($file['name']);
    $fileExtension = pathinfo($originalFilename, PATHINFO_EXTENSION);
    $safeFilename = preg_replace('/[^a-zA-Z0-9_-]/', '_', pathinfo($originalFilename, PATHINFO_FILENAME));
    $uniqueFilename = $safeFilename . '_' . time() . '.' . $fileExtension;
    $filePath = $uniqid . '/files/' . $uniqueFilename;
    $fullPath = $uploadDir . $uniqueFilename;

    Logger::log("handleUpload - Original filename: $originalFilename");
    Logger::log("handleUpload - Unique filename: $uniqueFilename");
    Logger::log("handleUpload - Full path: $fullPath");
    Logger::log("handleUpload - Temp file: " . $file['tmp_name']);

    if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
        Logger::log("handleUpload - Failed to move uploaded file", 'ERROR');
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save file']);
        return;
    }

    Logger::log("handleUpload - File moved successfully");

    $fileSize = filesize($fullPath);
    $mimeType = mime_content_type($fullPath);

    Logger::log("handleUpload - File size: $fileSize, MIME type: $mimeType");
    Logger::log("handleUpload - Inserting into database");

    $stmt = $pdo->prepare("
        INSERT INTO scenario_files (scenario_id, name, file_path, file_size, mime_type)
        VALUES (?, ?, ?, ?, ?)
    ");

    $stmt->execute([$scenarioId, $name, $filePath, $fileSize, $mimeType]);

    $fileId = $pdo->lastInsertId();

    Logger::log("handleUpload - File uploaded successfully with ID: $fileId");

    echo json_encode([
        'success' => true,
        'data' => [
            'id' => $fileId,
            'scenario_id' => $scenarioId,
            'name' => $name,
            'file_path' => $filePath,
            'file_size' => $fileSize,
            'mime_type' => $mimeType,
            'created_at' => date('Y-m-d H:i:s')
        ],
        'message' => 'File uploaded successfully'
    ]);
}

function handleList($pdo) {
    Logger::log("handleList - Starting");

    if (!isset($_GET['scenario_id'])) {
        Logger::log("handleList - Missing scenario_id", 'ERROR');
        http_response_code(400);
        echo json_encode(['error' => 'Missing scenario_id']);
        return;
    }

    $scenarioId = $_GET['scenario_id'];
    Logger::log("handleList - Scenario ID: $scenarioId");

    $stmt = $pdo->prepare("
        SELECT id, scenario_id, name, file_path, file_size, mime_type, created_at
        FROM scenario_files
        WHERE scenario_id = ?
        ORDER BY created_at DESC
    ");

    $stmt->execute([$scenarioId]);
    $files = $stmt->fetchAll(PDO::FETCH_ASSOC);

    Logger::log("handleList - Found " . count($files) . " files");

    echo json_encode([
        'success' => true,
        'data' => $files
    ]);
}

function handleDelete($pdo) {
    Logger::log("handleDelete - Starting");
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['id']) || !isset($data['email'])) {
        Logger::log("handleDelete - Missing required fields", 'ERROR');
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: id, email']);
        return;
    }

    $fileId = $data['id'];
    $email = $data['email'];
    Logger::log("handleDelete - File ID: $fileId, Email: $email");

    $stmt = $pdo->prepare("
        SELECT sf.file_path, s.id as scenario_id, s.client_id, s.created_by,
               c.email as client_email,
               a.email as admin_email
        FROM scenario_files sf
        JOIN scenarios s ON sf.scenario_id = s.id
        LEFT JOIN clients c ON s.client_id = c.id
        LEFT JOIN admin_users a ON s.created_by = a.id
        WHERE sf.id = ?
    ");
    $stmt->execute([$fileId]);
    $file = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$file) {
        Logger::log("handleDelete - File not found with ID: $fileId", 'ERROR');
        http_response_code(404);
        echo json_encode(['error' => 'File not found']);
        return;
    }

    // Verify ownership
    $isOwner = ($file['client_email'] === $email) || ($file['admin_email'] === $email);

    // Check if email belongs to any admin user
    $isAdmin = false;
    if (!$isOwner) {
        $stmt = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt->execute([$email]);
        $adminCheck = $stmt->fetch(PDO::FETCH_ASSOC);
        $isAdmin = ($adminCheck !== false);
    }

    if (!$isOwner && !$isAdmin) {
        Logger::log("handleDelete - Unauthorized access attempt by: $email", 'ERROR');
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized - file does not belong to this user']);
        return;
    }

    Logger::log("handleDelete - Access granted for user: $email");

    $fullPath = __DIR__ . '/../../media/' . $file['file_path'];
    Logger::log("handleDelete - Full path: $fullPath");

    if (file_exists($fullPath)) {
        Logger::log("handleDelete - Deleting physical file");
        unlink($fullPath);
    } else {
        Logger::log("handleDelete - Physical file does not exist");
    }

    $stmt = $pdo->prepare("DELETE FROM scenario_files WHERE id = ?");
    $stmt->execute([$fileId]);

    Logger::log("handleDelete - File deleted successfully");

    echo json_encode([
        'success' => true,
        'message' => 'File deleted successfully'
    ]);
}

function handleDownloadZip($pdo) {
    Logger::log("handleDownloadZip - Starting");

    if (!isset($_GET['uniqid']) || !isset($_GET['email'])) {
        Logger::log("handleDownloadZip - Missing uniqid or email", 'ERROR');
        http_response_code(400);
        echo json_encode(['error' => 'Missing uniqid or email']);
        return;
    }

    $uniqid = $_GET['uniqid'];
    $email = $_GET['email'];
    Logger::log("handleDownloadZip - Uniqid: $uniqid, Email: $email");

    // First, get the scenario
    $stmt = $pdo->prepare("
        SELECT s.id, s.title, s.uniqid, s.client_id, s.created_by,
               c.email as client_email,
               a.email as admin_email
        FROM scenarios s
        LEFT JOIN clients c ON s.client_id = c.id
        LEFT JOIN admin_users a ON s.created_by = a.id
        WHERE s.uniqid = ?
    ");
    $stmt->execute([$uniqid]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        Logger::log("handleDownloadZip - Scenario not found", 'ERROR');
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    // Verify ownership
    $isOwner = ($scenario['client_email'] === $email) || ($scenario['admin_email'] === $email);

    // Check if email belongs to any admin user
    $isAdmin = false;
    if (!$isOwner) {
        $stmt = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt->execute([$email]);
        $adminCheck = $stmt->fetch(PDO::FETCH_ASSOC);
        $isAdmin = ($adminCheck !== false);
    }

    if (!$isOwner && !$isAdmin) {
        Logger::log("handleDownloadZip - Unauthorized access attempt by: $email", 'ERROR');
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized - scenario does not belong to this user']);
        return;
    }

    Logger::log("handleDownloadZip - Found scenario: " . $scenario['title']);

    $stmt = $pdo->prepare("
        SELECT name, file_path
        FROM scenario_files
        WHERE scenario_id = ?
    ");

    $stmt->execute([$scenario['id']]);
    $files = $stmt->fetchAll(PDO::FETCH_ASSOC);

    Logger::log("handleDownloadZip - Found " . count($files) . " files");

    if (empty($files)) {
        Logger::log("handleDownloadZip - No files found", 'ERROR');
        http_response_code(404);
        echo json_encode(['error' => 'No files found for this scenario']);
        return;
    }

    $zipFilename = 'scenario_' . $uniqid . '_files_' . time() . '.zip';
    $zipPath = sys_get_temp_dir() . '/' . $zipFilename;
    Logger::log("handleDownloadZip - Creating zip: $zipPath");

    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        Logger::log("handleDownloadZip - Failed to create zip file", 'ERROR');
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create zip file']);
        return;
    }

    foreach ($files as $file) {
        $fullPath = __DIR__ . '/../../media/' . $file['file_path'];
        if (file_exists($fullPath)) {
            Logger::log("handleDownloadZip - Adding file to zip: " . $file['name']);
            $zip->addFile($fullPath, $file['name'] . '_' . basename($file['file_path']));
        } else {
            Logger::log("handleDownloadZip - File not found: $fullPath", 'ERROR');
        }
    }

    $zip->close();
    Logger::log("handleDownloadZip - Zip created successfully");

    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $zipFilename . '"');
    header('Content-Length: ' . filesize($zipPath));
    header('Cache-Control: no-cache, must-revalidate');

    readfile($zipPath);
    unlink($zipPath);
    Logger::log("handleDownloadZip - Zip sent and deleted");
    exit;
}
