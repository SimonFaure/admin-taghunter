<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../utils/cors.php';

header('Content-Type: application/json');

$action = $_GET['action'] ?? '';

try {
    $pdo = getDbConnection();

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
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function handleUpload($pdo) {
    if (!isset($_FILES['file']) || !isset($_POST['scenario_id']) || !isset($_POST['name'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields']);
        return;
    }

    $scenarioId = $_POST['scenario_id'];
    $name = $_POST['name'];
    $file = $_FILES['file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'File upload error']);
        return;
    }

    $stmt = $pdo->prepare("SELECT uniqid FROM scenarios WHERE id = ?");
    $stmt->execute([$scenarioId]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    $uniqid = $scenario['uniqid'];
    $uploadDir = __DIR__ . '/../../media/' . $uniqid . '/files/';

    if (!file_exists($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $originalFilename = basename($file['name']);
    $fileExtension = pathinfo($originalFilename, PATHINFO_EXTENSION);
    $safeFilename = preg_replace('/[^a-zA-Z0-9_-]/', '_', pathinfo($originalFilename, PATHINFO_FILENAME));
    $uniqueFilename = $safeFilename . '_' . time() . '.' . $fileExtension;
    $filePath = $uniqid . '/files/' . $uniqueFilename;
    $fullPath = $uploadDir . $uniqueFilename;

    if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save file']);
        return;
    }

    $fileSize = filesize($fullPath);
    $mimeType = mime_content_type($fullPath);

    $stmt = $pdo->prepare("
        INSERT INTO scenario_files (scenario_id, name, file_path, file_size, mime_type)
        VALUES (?, ?, ?, ?, ?)
    ");

    $stmt->execute([$scenarioId, $name, $filePath, $fileSize, $mimeType]);

    $fileId = $pdo->lastInsertId();

    echo json_encode([
        'success' => true,
        'file' => [
            'id' => $fileId,
            'scenario_id' => $scenarioId,
            'name' => $name,
            'file_path' => $filePath,
            'file_size' => $fileSize,
            'mime_type' => $mimeType,
            'created_at' => date('Y-m-d H:i:s')
        ]
    ]);
}

function handleList($pdo) {
    if (!isset($_GET['scenario_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing scenario_id']);
        return;
    }

    $scenarioId = $_GET['scenario_id'];

    $stmt = $pdo->prepare("
        SELECT id, scenario_id, name, file_path, file_size, mime_type, created_at
        FROM scenario_files
        WHERE scenario_id = ?
        ORDER BY created_at DESC
    ");

    $stmt->execute([$scenarioId]);
    $files = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['files' => $files]);
}

function handleDelete($pdo) {
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing file id']);
        return;
    }

    $fileId = $data['id'];

    $stmt = $pdo->prepare("SELECT file_path FROM scenario_files WHERE id = ?");
    $stmt->execute([$fileId]);
    $file = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$file) {
        http_response_code(404);
        echo json_encode(['error' => 'File not found']);
        return;
    }

    $fullPath = __DIR__ . '/../../media/' . $file['file_path'];
    if (file_exists($fullPath)) {
        unlink($fullPath);
    }

    $stmt = $pdo->prepare("DELETE FROM scenario_files WHERE id = ?");
    $stmt->execute([$fileId]);

    echo json_encode(['success' => true]);
}

function handleDownloadZip($pdo) {
    if (!isset($_GET['uniqid']) || !isset($_GET['email'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing uniqid or email']);
        return;
    }

    $uniqid = $_GET['uniqid'];
    $email = $_GET['email'];

    $stmt = $pdo->prepare("
        SELECT s.id, s.title
        FROM scenarios s
        INNER JOIN clients c ON s.client_id = c.id
        WHERE s.uniqid = ? AND c.email = ?
    ");

    $stmt->execute([$uniqid, $email]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found or access denied']);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT name, file_path
        FROM scenario_files
        WHERE scenario_id = ?
    ");

    $stmt->execute([$scenario['id']]);
    $files = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($files)) {
        http_response_code(404);
        echo json_encode(['error' => 'No files found for this scenario']);
        return;
    }

    $zipFilename = 'scenario_' . $uniqid . '_files_' . time() . '.zip';
    $zipPath = sys_get_temp_dir() . '/' . $zipFilename;

    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create zip file']);
        return;
    }

    foreach ($files as $file) {
        $fullPath = __DIR__ . '/../../media/' . $file['file_path'];
        if (file_exists($fullPath)) {
            $zip->addFile($fullPath, $file['name'] . '_' . basename($file['file_path']));
        }
    }

    $zip->close();

    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $zipFilename . '"');
    header('Content-Length: ' . filesize($zipPath));
    header('Cache-Control: no-cache, must-revalidate');

    readfile($zipPath);
    unlink($zipPath);
    exit;
}
