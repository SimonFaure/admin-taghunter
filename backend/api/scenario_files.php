<?php
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';

setCorsHeaders();
session_start();

$action = $_GET['action'] ?? '';

Logger::log("scenario_files.php - Action: $action");

function resolveEmailFromRequest() {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (!empty($token)) {
        $db = Database::getInstance();
        $tokenData = TokenManager::validateToken($db, $token);
        if ($tokenData) {
            return $tokenData['email'];
        }
    }
    return null;
}

try {
    $dbInstance = Database::getInstance();
    $pdo = $dbInstance->getConnection();
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

        case 'get_scenario':
            handleGetScenario($pdo);
            break;

        case 'upload_video':
            handleUploadVideo($pdo);
            break;

        default:
            Logger::log("scenario_files.php - Invalid action: $action", 'ERROR');
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action']);
    }
} catch (Exception $e) {
    Logger::log("scenario_files.php - Exception: " . $e->getMessage(), 'ERROR');
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function handleGetScenario($pdo) {
    $uniqid = $_GET['uniqid'] ?? null;
    if (!$uniqid) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing uniqid']);
        return;
    }

    $email = resolveEmailFromRequest();
    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT s.id, s.title, s.description, s.uniqid, s.medias, s.media_url,
               s.game_type, s.scenario_type, IFNULL(s.version, '1.0') as version, s.client_id,
               c.email as client_email
        FROM scenarios s
        LEFT JOIN clients c ON s.client_id = c.id
        WHERE s.uniqid = ?
    ");
    $stmt->execute([$uniqid]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    $hasAccess = ($scenario['client_email'] === $email);
    if (!$hasAccess) {
        $stmt2 = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt2->execute([$email]);
        $hasAccess = ($stmt2->fetch(PDO::FETCH_ASSOC) !== false);
    }
    if (!$hasAccess) {
        $stmt3 = $pdo->prepare("
            SELECT cs.id FROM client_scenarios cs
            JOIN clients c ON cs.client_id = c.id
            WHERE cs.scenario_id = ? AND c.email = ?
        ");
        $stmt3->execute([$scenario['id'], $email]);
        $hasAccess = ($stmt3->fetch(PDO::FETCH_ASSOC) !== false);
    }

    if (!$hasAccess) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $mediasJson = $scenario['medias'];
    $medias = $mediasJson ? json_decode($mediasJson, true) : [];

    $baseUrl = 'https://admin.taghunter.fr/media/' . $uniqid . '/';
    $images = [];

    $mediaDir = __DIR__ . '/../../media/' . $uniqid . '/';
    if (is_dir($mediaDir)) {
        $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        foreach (scandir($mediaDir) as $file) {
            if ($file === '.' || $file === '..' || is_dir($mediaDir . $file)) continue;
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if (in_array($ext, $allowedExts)) {
                $images[] = $baseUrl . $file;
            }
        }
    }

    $gameVisual = null;
    if (!empty($medias['images']['game_visual'])) {
        $gv = $medias['images']['game_visual'];
        if (strpos($gv, 'http') === 0) {
            $gameVisual = $gv;
        } else {
            $gameVisual = 'https://admin.taghunter.fr' . $gv;
        }
    }

    $videoUrl = null;
    if (!empty($medias['video'])) {
        $v = $medias['video'];
        $videoUrl = strpos($v, 'http') === 0 ? $v : 'https://admin.taghunter.fr' . $v;
    }

    $stmt4 = $pdo->prepare("
        SELECT id, name, file_path, file_size, mime_type, created_at
        FROM scenario_files WHERE scenario_id = ? ORDER BY created_at DESC
    ");
    $stmt4->execute([$scenario['id']]);
    $files = $stmt4->fetchAll(PDO::FETCH_ASSOC);

    $hasZipFiles = !empty($files);

    echo json_encode([
        'success' => true,
        'data' => [
            'id' => $scenario['id'],
            'title' => $scenario['title'],
            'description' => $scenario['description'],
            'uniqid' => $scenario['uniqid'],
            'game_type' => $scenario['game_type'],
            'scenario_type' => $scenario['scenario_type'],
            'version' => $scenario['version'],
            'game_visual' => $gameVisual,
            'images' => $images,
            'video_url' => $videoUrl,
            'has_zip_files' => $hasZipFiles,
            'files_count' => count($files),
        ]
    ]);
}

function handleUploadVideo($pdo) {
    $email = resolveEmailFromRequest();
    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    if (!isset($_FILES['video']) || !isset($_POST['uniqid'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: video, uniqid']);
        return;
    }

    $uniqid = $_POST['uniqid'];
    $file = $_FILES['video'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'File upload error: ' . $file['error']]);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT s.id, s.medias, s.client_id, c.email as client_email
        FROM scenarios s
        LEFT JOIN clients c ON s.client_id = c.id
        WHERE s.uniqid = ?
    ");
    $stmt->execute([$uniqid]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    $hasAccess = ($scenario['client_email'] === $email);
    if (!$hasAccess) {
        $stmt2 = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt2->execute([$email]);
        $hasAccess = ($stmt2->fetch(PDO::FETCH_ASSOC) !== false);
    }
    if (!$hasAccess) {
        $stmt3 = $pdo->prepare("
            SELECT cs.id FROM client_scenarios cs
            JOIN clients c ON cs.client_id = c.id
            WHERE cs.scenario_id = ? AND c.email = ?
        ");
        $stmt3->execute([$scenario['id'], $email]);
        $hasAccess = ($stmt3->fetch(PDO::FETCH_ASSOC) !== false);
    }

    if (!$hasAccess) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    $allowedMimes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    if (!in_array($mimeType, $allowedMimes)) {
        http_response_code(400);
        echo json_encode(['error' => 'Only video files are allowed (mp4, webm, ogg, mov)']);
        return;
    }

    if ($file['size'] > 200 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['error' => 'Video file must be less than 200MB']);
        return;
    }

    $uploadDir = __DIR__ . '/../../media/' . $uniqid . '/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $videoFilename = 'scenario_video_' . time() . '.' . $ext;
    $fullPath = $uploadDir . $videoFilename;

    if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save video file']);
        return;
    }

    $videoPath = '/media/' . $uniqid . '/' . $videoFilename;
    $medias = $scenario['medias'] ? json_decode($scenario['medias'], true) : [];
    $medias['video'] = $videoPath;

    $stmt4 = $pdo->prepare("UPDATE scenarios SET medias = ? WHERE id = ?");
    $stmt4->execute([json_encode($medias), $scenario['id']]);

    echo json_encode([
        'success' => true,
        'video_url' => 'https://admin.taghunter.fr' . $videoPath
    ]);
}

function handleUpload($pdo) {
    Logger::log("handleUpload - Starting file upload");

    if (!isset($_FILES['file']) || !isset($_POST['scenario_id']) || !isset($_POST['name']) || !isset($_POST['email'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: file, scenario_id, name, email']);
        return;
    }

    $scenarioId = $_POST['scenario_id'];
    $name = $_POST['name'];
    $email = $_POST['email'];
    $file = $_FILES['file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'File upload error: ' . $file['error']]);
        return;
    }

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
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    $isOwner = ($scenario['client_email'] === $email) || ($scenario['admin_email'] === $email);
    $isAdmin = false;
    if (!$isOwner) {
        $stmt2 = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt2->execute([$email]);
        $isAdmin = ($stmt2->fetch(PDO::FETCH_ASSOC) !== false);
    }

    if (!$isOwner && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized - scenario does not belong to this user']);
        return;
    }

    $uniqid = $scenario['uniqid'];
    $uploadDir = __DIR__ . '/../../media/' . $uniqid . '/files/';

    if (!file_exists($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
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

    if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save file']);
        return;
    }

    $fileSize = filesize($fullPath);
    $mimeType = mime_content_type($fullPath);

    $stmt3 = $pdo->prepare("
        INSERT INTO scenario_files (scenario_id, name, file_path, file_size, mime_type)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt3->execute([$scenarioId, $name, $filePath, $fileSize, $mimeType]);
    $fileId = $pdo->lastInsertId();

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

    echo json_encode(['success' => true, 'data' => $files]);
}

function handleDelete($pdo) {
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['id']) || !isset($data['email'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: id, email']);
        return;
    }

    $fileId = $data['id'];
    $email = $data['email'];

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
        http_response_code(404);
        echo json_encode(['error' => 'File not found']);
        return;
    }

    $isOwner = ($file['client_email'] === $email) || ($file['admin_email'] === $email);
    $isAdmin = false;
    if (!$isOwner) {
        $stmt2 = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt2->execute([$email]);
        $isAdmin = ($stmt2->fetch(PDO::FETCH_ASSOC) !== false);
    }

    if (!$isOwner && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized - file does not belong to this user']);
        return;
    }

    $fullPath = __DIR__ . '/../../media/' . $file['file_path'];
    if (file_exists($fullPath)) {
        unlink($fullPath);
    }

    $stmt3 = $pdo->prepare("DELETE FROM scenario_files WHERE id = ?");
    $stmt3->execute([$fileId]);

    echo json_encode(['success' => true, 'message' => 'File deleted successfully']);
}

function handleDownloadZip($pdo) {
    $uniqid = $_GET['uniqid'] ?? null;
    if (!$uniqid) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing uniqid']);
        return;
    }

    $email = resolveEmailFromRequest();
    if (!$email) {
        $email = $_GET['email'] ?? null;
    }

    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

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
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    $isOwner = ($scenario['client_email'] === $email) || ($scenario['admin_email'] === $email);
    $isAdmin = false;
    if (!$isOwner) {
        $stmt2 = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt2->execute([$email]);
        $isAdmin = ($stmt2->fetch(PDO::FETCH_ASSOC) !== false);
    }
    if (!$isOwner && !$isAdmin) {
        $stmt3 = $pdo->prepare("
            SELECT cs.id FROM client_scenarios cs
            JOIN clients c ON cs.client_id = c.id
            WHERE cs.scenario_id = ? AND c.email = ?
        ");
        $stmt3->execute([$scenario['id'], $email]);
        $isOwner = ($stmt3->fetch(PDO::FETCH_ASSOC) !== false);
    }

    if (!$isOwner && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $stmt4 = $pdo->prepare("SELECT name, file_path FROM scenario_files WHERE scenario_id = ?");
    $stmt4->execute([$scenario['id']]);
    $files = $stmt4->fetchAll(PDO::FETCH_ASSOC);

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
