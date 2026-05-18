<?php
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';

setCorsHeaders();
session_start();

const GT_SUPPORTED_LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'zh', 'ar'];
const GT_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const GT_VIDEO_MAX_BYTES = 700 * 1024 * 1024;
const GT_SUBTITLE_MAX_BYTES = 2 * 1024 * 1024;

function gtMediaRoot() {
    return realpath(__DIR__ . '/../../media') ?: (__DIR__ . '/../../media');
}

function gtAdminVersionDir($code, $version) {
    return gtMediaRoot() . "/game_types/$code/v$version";
}

function gtClientVersionDir($code, $clientId, $version) {
    return gtMediaRoot() . "/game_types/$code/clients/$clientId/v$version";
}

function gtAuth() {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (empty($token)) return null;
    $db = Database::getInstance();
    $tokenData = TokenManager::validateToken($db, $token);
    if (!$tokenData) return null;
    return [
        'user_id' => $tokenData['user_id'],
        'user_type' => $tokenData['user_type'],
        'email' => $tokenData['email'],
    ];
}

function gtRequireAdmin() {
    $auth = gtAuth();
    if (!$auth || $auth['user_type'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin only']);
        exit;
    }
    return $auth;
}

function gtRequireClient() {
    $auth = gtAuth();
    if (!$auth || $auth['user_type'] !== 'client') {
        http_response_code(403);
        echo json_encode(['error' => 'Client only']);
        exit;
    }
    return $auth;
}

function gtRequireAuth() {
    $auth = gtAuth();
    if (!$auth) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    return $auth;
}

function gtRmDir($dir) {
    if (!is_dir($dir)) return;
    $items = scandir($dir);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = "$dir/$item";
        if (is_dir($path)) gtRmDir($path);
        else @unlink($path);
    }
    @rmdir($dir);
}

function gtRenameVersionDir($oldDir, $newDir) {
    if (is_dir($oldDir)) {
        $parent = dirname($newDir);
        if (!is_dir($parent)) mkdir($parent, 0755, true);
        if (!@rename($oldDir, $newDir)) {
            // Fallback: copy + delete (rename can fail across volumes or on Windows in rare cases)
            mkdir($newDir, 0755, true);
            $items = scandir($oldDir);
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') continue;
                @rename("$oldDir/$item", "$newDir/$item");
            }
            @rmdir($oldDir);
        }
    } else {
        if (!is_dir($newDir)) mkdir($newDir, 0755, true);
    }
}

function gtLoadRow($pdo, $code) {
    $stmt = $pdo->prepare('SELECT * FROM game_types WHERE code = ?');
    $stmt->execute([$code]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function gtLoadOverride($pdo, $clientId, $code) {
    $stmt = $pdo->prepare('SELECT * FROM client_game_type_overrides WHERE client_id = ? AND game_type_code = ?');
    $stmt->execute([$clientId, $code]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function gtJsonRow($row) {
    if (!$row) return null;
    $row['supports_tutorial_video'] = (bool)$row['supports_tutorial_video'];
    $row['supports_intro_video'] = (bool)$row['supports_intro_video'];
    $row['tutorial_video_version'] = (int)$row['tutorial_video_version'];
    $row['tutorial_subtitles'] = $row['tutorial_subtitles'] ? json_decode($row['tutorial_subtitles'], true) : new stdClass();
    return $row;
}

function gtJsonOverride($row) {
    if (!$row) return null;
    $row['tutorial_video_version'] = (int)$row['tutorial_video_version'];
    $row['tutorial_subtitles'] = $row['tutorial_subtitles'] ? json_decode($row['tutorial_subtitles'], true) : new stdClass();
    return $row;
}

function gtValidateUploadedFile($file, $allowedMimes, $maxBytes) {
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'No file uploaded']);
        exit;
    }
    if ($file['size'] > $maxBytes) {
        http_response_code(400);
        echo json_encode(['error' => 'File too large']);
        exit;
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    if (!in_array($mime, $allowedMimes, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid mime type: ' . $mime]);
        exit;
    }
    return $mime;
}

$action = $_GET['action'] ?? '';

try {
    $pdo = Database::getInstance()->getConnection();

    switch ($action) {
        case 'list':                       handleList($pdo); break;
        case 'admin_upload_video':         handleAdminUploadVideo($pdo); break;
        case 'admin_upload_subtitle':      handleAdminUploadSubtitle($pdo); break;
        case 'admin_remove_video':         handleAdminRemoveVideo($pdo); break;
        case 'admin_remove_subtitle':      handleAdminRemoveSubtitle($pdo); break;
        case 'admin_update_supports':      handleAdminUpdateSupports($pdo); break;
        case 'client_upload_video':        handleClientUploadVideo($pdo); break;
        case 'client_upload_subtitle':     handleClientUploadSubtitle($pdo); break;
        case 'client_remove_video':        handleClientRemoveVideo($pdo); break;
        case 'client_remove_subtitle':     handleClientRemoveSubtitle($pdo); break;
        case 'get_media':                  handleGetMedia($pdo); break;
        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action']);
    }
} catch (Exception $e) {
    error_log('game_types.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function handleList($pdo) {
    $auth = gtRequireAuth();

    $rows = $pdo->query('SELECT * FROM game_types ORDER BY code')->fetchAll(PDO::FETCH_ASSOC);
    $types = array_map('gtJsonRow', $rows);

    $overrides = [];
    if ($auth['user_type'] === 'client') {
        $stmt = $pdo->prepare('SELECT * FROM client_game_type_overrides WHERE client_id = ?');
        $stmt->execute([$auth['user_id']]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $overrides[$row['game_type_code']] = gtJsonOverride($row);
        }
    }

    echo json_encode(['game_types' => $types, 'overrides' => $overrides]);
}

function handleAdminUpdateSupports($pdo) {
    gtRequireAdmin();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? null;
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $supportsTutorial = isset($body['supports_tutorial_video']) ? (int)(bool)$body['supports_tutorial_video'] : (int)$row['supports_tutorial_video'];
    $supportsIntro    = isset($body['supports_intro_video'])    ? (int)(bool)$body['supports_intro_video']    : (int)$row['supports_intro_video'];

    $stmt = $pdo->prepare('UPDATE game_types SET supports_tutorial_video = ?, supports_intro_video = ? WHERE code = ?');
    $stmt->execute([$supportsTutorial, $supportsIntro, $code]);
    echo json_encode(['success' => true]);
}

function handleAdminUploadVideo($pdo) {
    gtRequireAdmin();
    $code = $_POST['code'] ?? '';
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }
    if (!$row['supports_tutorial_video']) { http_response_code(400); echo json_encode(['error' => 'This game type does not support a tutorial video']); return; }

    $file = $_FILES['video'] ?? null;
    $mime = gtValidateUploadedFile($file, GT_VIDEO_MIMES, GT_VIDEO_MAX_BYTES);

    $oldVersion = (int)$row['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtAdminVersionDir($code, $oldVersion);
    $newDir = gtAdminVersionDir($code, $newVersion);

    gtRenameVersionDir($oldDir, $newDir);

    // Remove any previous tutorial file (we're replacing it)
    foreach (glob("$newDir/tutorial.*") ?: [] as $existing) @unlink($existing);

    $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'mp4';
    $ext = strtolower(preg_replace('/[^a-z0-9]/i', '', $ext));
    $target = "$newDir/tutorial.$ext";
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        http_response_code(500); echo json_encode(['error' => 'Failed to save file']); return;
    }

    $stmt = $pdo->prepare('UPDATE game_types SET tutorial_video_path = ?, tutorial_video_version = ? WHERE code = ?');
    $stmt->execute(["tutorial.$ext", $newVersion, $code]);

    echo json_encode(['success' => true, 'version' => $newVersion, 'filename' => "tutorial.$ext"]);
}

function handleAdminRemoveVideo($pdo) {
    gtRequireAdmin();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? '';
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $oldVersion = (int)$row['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtAdminVersionDir($code, $oldVersion);
    $newDir = gtAdminVersionDir($code, $newVersion);

    gtRenameVersionDir($oldDir, $newDir);
    foreach (glob("$newDir/tutorial.*") ?: [] as $existing) @unlink($existing);

    $stmt = $pdo->prepare('UPDATE game_types SET tutorial_video_path = NULL, tutorial_video_version = ? WHERE code = ?');
    $stmt->execute([$newVersion, $code]);

    echo json_encode(['success' => true, 'version' => $newVersion]);
}

function handleAdminUploadSubtitle($pdo) {
    gtRequireAdmin();
    $code = $_POST['code'] ?? '';
    $lang = $_POST['lang'] ?? '';
    if (!$code || !in_array($lang, GT_SUPPORTED_LANGS, true)) {
        http_response_code(400); echo json_encode(['error' => 'Missing code or invalid lang']); return;
    }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $file = $_FILES['subtitle'] ?? null;
    gtValidateUploadedFile($file, ['text/vtt', 'text/plain', 'application/octet-stream'], GT_SUBTITLE_MAX_BYTES);

    $oldVersion = (int)$row['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtAdminVersionDir($code, $oldVersion);
    $newDir = gtAdminVersionDir($code, $newVersion);

    gtRenameVersionDir($oldDir, $newDir);

    $subtitleDir = "$newDir/subtitles";
    if (!is_dir($subtitleDir)) mkdir($subtitleDir, 0755, true);
    $target = "$subtitleDir/$lang.vtt";
    @unlink($target);
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        http_response_code(500); echo json_encode(['error' => 'Failed to save file']); return;
    }

    $subtitles = $row['tutorial_subtitles'] ? json_decode($row['tutorial_subtitles'], true) : [];
    $subtitles[$lang] = "$lang.vtt";

    $stmt = $pdo->prepare('UPDATE game_types SET tutorial_subtitles = ?, tutorial_video_version = ? WHERE code = ?');
    $stmt->execute([json_encode($subtitles), $newVersion, $code]);

    echo json_encode(['success' => true, 'version' => $newVersion, 'lang' => $lang]);
}

function handleAdminRemoveSubtitle($pdo) {
    gtRequireAdmin();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? '';
    $lang = $body['lang'] ?? '';
    if (!$code || !in_array($lang, GT_SUPPORTED_LANGS, true)) {
        http_response_code(400); echo json_encode(['error' => 'Missing code or invalid lang']); return;
    }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $oldVersion = (int)$row['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtAdminVersionDir($code, $oldVersion);
    $newDir = gtAdminVersionDir($code, $newVersion);
    gtRenameVersionDir($oldDir, $newDir);

    @unlink("$newDir/subtitles/$lang.vtt");

    $subtitles = $row['tutorial_subtitles'] ? json_decode($row['tutorial_subtitles'], true) : [];
    unset($subtitles[$lang]);

    $stmt = $pdo->prepare('UPDATE game_types SET tutorial_subtitles = ?, tutorial_video_version = ? WHERE code = ?');
    $stmt->execute([json_encode((object)$subtitles), $newVersion, $code]);

    echo json_encode(['success' => true, 'version' => $newVersion]);
}

function handleClientUploadVideo($pdo) {
    $auth = gtRequireClient();
    $code = $_POST['code'] ?? '';
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }
    if (!$row['supports_tutorial_video']) { http_response_code(400); echo json_encode(['error' => 'This game type does not support a tutorial video']); return; }

    $file = $_FILES['video'] ?? null;
    gtValidateUploadedFile($file, GT_VIDEO_MIMES, GT_VIDEO_MAX_BYTES);

    $override = gtLoadOverride($pdo, $auth['user_id'], $code);
    $oldVersion = $override ? (int)$override['tutorial_video_version'] : 0;
    $newVersion = $oldVersion + 1;
    $oldDir = gtClientVersionDir($code, $auth['user_id'], $oldVersion);
    $newDir = gtClientVersionDir($code, $auth['user_id'], $newVersion);

    gtRenameVersionDir($oldDir, $newDir);
    foreach (glob("$newDir/tutorial.*") ?: [] as $existing) @unlink($existing);

    $ext = strtolower(preg_replace('/[^a-z0-9]/i', '', pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'mp4'));
    $target = "$newDir/tutorial.$ext";
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        http_response_code(500); echo json_encode(['error' => 'Failed to save file']); return;
    }

    $subtitles = $override && $override['tutorial_subtitles']
        ? json_decode($override['tutorial_subtitles'], true) : [];

    $stmt = $pdo->prepare('
        INSERT INTO client_game_type_overrides (client_id, game_type_code, tutorial_video_path, tutorial_video_version, tutorial_subtitles)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE tutorial_video_path = VALUES(tutorial_video_path),
                                tutorial_video_version = VALUES(tutorial_video_version)
    ');
    $stmt->execute([$auth['user_id'], $code, "tutorial.$ext", $newVersion, json_encode((object)$subtitles)]);

    echo json_encode(['success' => true, 'version' => $newVersion, 'filename' => "tutorial.$ext"]);
}

function handleClientRemoveVideo($pdo) {
    $auth = gtRequireClient();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? '';
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    $override = gtLoadOverride($pdo, $auth['user_id'], $code);
    if (!$override) { http_response_code(404); echo json_encode(['error' => 'No override exists']); return; }

    $oldVersion = (int)$override['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtClientVersionDir($code, $auth['user_id'], $oldVersion);
    $newDir = gtClientVersionDir($code, $auth['user_id'], $newVersion);
    gtRenameVersionDir($oldDir, $newDir);
    foreach (glob("$newDir/tutorial.*") ?: [] as $existing) @unlink($existing);

    $stmt = $pdo->prepare('
        UPDATE client_game_type_overrides
        SET tutorial_video_path = NULL, tutorial_video_version = ?
        WHERE client_id = ? AND game_type_code = ?
    ');
    $stmt->execute([$newVersion, $auth['user_id'], $code]);

    echo json_encode(['success' => true, 'version' => $newVersion]);
}

function handleClientUploadSubtitle($pdo) {
    $auth = gtRequireClient();
    $code = $_POST['code'] ?? '';
    $lang = $_POST['lang'] ?? '';
    if (!$code || !in_array($lang, GT_SUPPORTED_LANGS, true)) {
        http_response_code(400); echo json_encode(['error' => 'Missing code or invalid lang']); return;
    }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $file = $_FILES['subtitle'] ?? null;
    gtValidateUploadedFile($file, ['text/vtt', 'text/plain', 'application/octet-stream'], GT_SUBTITLE_MAX_BYTES);

    $override = gtLoadOverride($pdo, $auth['user_id'], $code);
    $oldVersion = $override ? (int)$override['tutorial_video_version'] : 0;
    $newVersion = $oldVersion + 1;
    $oldDir = gtClientVersionDir($code, $auth['user_id'], $oldVersion);
    $newDir = gtClientVersionDir($code, $auth['user_id'], $newVersion);

    gtRenameVersionDir($oldDir, $newDir);

    $subtitleDir = "$newDir/subtitles";
    if (!is_dir($subtitleDir)) mkdir($subtitleDir, 0755, true);
    $target = "$subtitleDir/$lang.vtt";
    @unlink($target);
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        http_response_code(500); echo json_encode(['error' => 'Failed to save file']); return;
    }

    $subtitles = $override && $override['tutorial_subtitles']
        ? json_decode($override['tutorial_subtitles'], true) : [];
    $subtitles[$lang] = "$lang.vtt";

    $existingVideoPath = $override ? $override['tutorial_video_path'] : null;

    $stmt = $pdo->prepare('
        INSERT INTO client_game_type_overrides (client_id, game_type_code, tutorial_video_path, tutorial_video_version, tutorial_subtitles)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE tutorial_video_version = VALUES(tutorial_video_version),
                                tutorial_subtitles = VALUES(tutorial_subtitles)
    ');
    $stmt->execute([$auth['user_id'], $code, $existingVideoPath, $newVersion, json_encode($subtitles)]);

    echo json_encode(['success' => true, 'version' => $newVersion, 'lang' => $lang]);
}

function handleClientRemoveSubtitle($pdo) {
    $auth = gtRequireClient();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? '';
    $lang = $body['lang'] ?? '';
    if (!$code || !in_array($lang, GT_SUPPORTED_LANGS, true)) {
        http_response_code(400); echo json_encode(['error' => 'Missing code or invalid lang']); return;
    }
    $override = gtLoadOverride($pdo, $auth['user_id'], $code);
    if (!$override) { http_response_code(404); echo json_encode(['error' => 'No override exists']); return; }

    $oldVersion = (int)$override['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtClientVersionDir($code, $auth['user_id'], $oldVersion);
    $newDir = gtClientVersionDir($code, $auth['user_id'], $newVersion);
    gtRenameVersionDir($oldDir, $newDir);
    @unlink("$newDir/subtitles/$lang.vtt");

    $subtitles = $override['tutorial_subtitles'] ? json_decode($override['tutorial_subtitles'], true) : [];
    unset($subtitles[$lang]);

    $stmt = $pdo->prepare('
        UPDATE client_game_type_overrides
        SET tutorial_subtitles = ?, tutorial_video_version = ?
        WHERE client_id = ? AND game_type_code = ?
    ');
    $stmt->execute([json_encode((object)$subtitles), $newVersion, $auth['user_id'], $code]);

    echo json_encode(['success' => true, 'version' => $newVersion]);
}

function handleGetMedia($pdo) {
    $auth = gtRequireAuth();
    $code = $_GET['code'] ?? '';
    $variant = $_GET['variant'] ?? 'admin';
    $version = (int)($_GET['version'] ?? 0);
    $filename = $_GET['filename'] ?? '';
    $subtitleLang = $_GET['subtitle_lang'] ?? '';

    if (!$code || !$version || (!$filename && !$subtitleLang)) {
        http_response_code(400); echo json_encode(['error' => 'Missing params']); return;
    }

    if ($variant === 'admin') {
        $baseDir = gtAdminVersionDir($code, $version);
    } else if ($variant === 'client') {
        $baseDir = gtClientVersionDir($code, $auth['user_id'], $version);
    } else {
        http_response_code(400); echo json_encode(['error' => 'Invalid variant']); return;
    }

    if ($subtitleLang) {
        if (!in_array($subtitleLang, GT_SUPPORTED_LANGS, true)) {
            http_response_code(400); echo json_encode(['error' => 'Invalid lang']); return;
        }
        $path = "$baseDir/subtitles/$subtitleLang.vtt";
        $mime = 'text/vtt';
    } else {
        // Filter out path traversal
        if (strpos($filename, '..') !== false || strpos($filename, '/') !== false) {
            http_response_code(400); echo json_encode(['error' => 'Invalid filename']); return;
        }
        $path = "$baseDir/$filename";
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $mimeMap = ['mp4' => 'video/mp4', 'webm' => 'video/webm', 'ogg' => 'video/ogg', 'mov' => 'video/quicktime'];
        $mime = $mimeMap[$ext] ?? 'application/octet-stream';
    }

    if (!is_file($path)) {
        http_response_code(404); echo json_encode(['error' => 'File not found']); return;
    }

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . filesize($path));
    readfile($path);
}
