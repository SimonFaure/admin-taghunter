<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';

function jsonResponse($data, $statusCode = 200) {
    header('Content-Type: application/json');
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function requireAuth() {
    // Session-based auth (legacy admin web UI)
    if (isset($_SESSION['user_id'])) return;

    // Token-based auth (Creator web app)
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
        if ($tokenData) {
            $_SESSION['user_id'] = $tokenData['user_id'];
            return;
        }
    }

    jsonResponse(['error' => 'Unauthorized'], 401);
}

// Validate a relative media path ("uniqid/filename.ext" or "sub/dir/file.jpg").
// Rejects absolute paths, traversal, hidden files, empty segments.
function validateMediaPath(string $path): string {
    $path = trim($path, '/');
    if ($path === '') {
        jsonResponse(['error' => 'path is required'], 400);
    }
    if (preg_match('#(^|/)\.+($|/)#', $path)) {
        jsonResponse(['error' => 'Invalid path (traversal)'], 400);
    }
    // Allow alphanumerics, dash, underscore, dot, slash. No spaces, no unicode weirdness.
    if (!preg_match('#^[A-Za-z0-9._/\-]+$#', $path)) {
        jsonResponse(['error' => 'Invalid characters in path'], 400);
    }
    return $path;
}

function mediaRoot(): string {
    return realpath(__DIR__ . '/../../media') ?: (__DIR__ . '/../../media');
}

function resolveUnderMedia(string $relPath): string {
    $root = mediaRoot();
    return $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relPath);
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($action) {
        case 'list':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                Logger::log('media', $method, 'list', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $mediaBaseDir = __DIR__ . '/../../media/';
            $mediaFiles = [];

            if (!is_dir($mediaBaseDir)) {
                Logger::log('media', $method, 'list', $_SESSION['user_id'], [], ['count' => 0], 200);
                jsonResponse(['media' => []]);
            }

            $scenarioDirs = array_diff(scandir($mediaBaseDir), ['.', '..', '.htaccess', 'README.md']);

            foreach ($scenarioDirs as $uniqid) {
                $scenarioDir = $mediaBaseDir . $uniqid . '/';

                if (!is_dir($scenarioDir)) {
                    continue;
                }

                $files = array_diff(scandir($scenarioDir), ['.', '..']);

                foreach ($files as $filename) {
                    $filePath = $scenarioDir . $filename;

                    if (!is_file($filePath)) {
                        continue;
                    }

                    $fileStats = stat($filePath);
                    $fileSize = filesize($filePath);
                    $mimeType = mime_content_type($filePath);

                    $mediaFiles[] = [
                        'id' => md5($uniqid . '/' . $filename),
                        'name' => $filename,
                        'scenario_uniqid' => $uniqid,
                        'path' => '/media/' . $uniqid . '/' . $filename,
                        'url' => 'https://admin.taghunter.fr/media/' . $uniqid . '/' . $filename,
                        'size' => $fileSize,
                        'mime_type' => $mimeType,
                        'created_at' => date('Y-m-d H:i:s', $fileStats['ctime']),
                        'updated_at' => date('Y-m-d H:i:s', $fileStats['mtime'])
                    ];
                }
            }

            usort($mediaFiles, function($a, $b) {
                return strtotime($b['created_at']) - strtotime($a['created_at']);
            });

            Logger::log('media', $method, 'list', $_SESSION['user_id'], [], ['count' => count($mediaFiles)], 200);
            jsonResponse(['media' => $mediaFiles]);
            break;

        case 'get':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                Logger::log('media', $method, 'get', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $uniqid = $_GET['uniqid'] ?? null;
            $filename = $_GET['filename'] ?? null;

            if (!$uniqid || !$filename) {
                Logger::log('media', $method, 'get', $_SESSION['user_id'], [], ['error' => 'Missing parameters'], 400);
                jsonResponse(['error' => 'uniqid and filename are required'], 400);
            }

            $filePath = __DIR__ . '/../../media/' . $uniqid . '/' . $filename;

            if (!file_exists($filePath) || !is_file($filePath)) {
                Logger::log('media', $method, 'get', $_SESSION['user_id'], ['uniqid' => $uniqid, 'filename' => $filename], ['error' => 'File not found'], 404);
                jsonResponse(['error' => 'File not found'], 404);
            }

            $fileStats = stat($filePath);
            $fileSize = filesize($filePath);
            $mimeType = mime_content_type($filePath);

            $mediaFile = [
                'id' => md5($uniqid . '/' . $filename),
                'name' => $filename,
                'scenario_uniqid' => $uniqid,
                'path' => '/media/' . $uniqid . '/' . $filename,
                'url' => 'https://admin.taghunter.fr/media/' . $uniqid . '/' . $filename,
                'size' => $fileSize,
                'mime_type' => $mimeType,
                'created_at' => date('Y-m-d H:i:s', $fileStats['ctime']),
                'updated_at' => date('Y-m-d H:i:s', $fileStats['mtime'])
            ];

            Logger::log('media', $method, 'get', $_SESSION['user_id'], ['uniqid' => $uniqid, 'filename' => $filename], ['success' => true], 200);
            jsonResponse(['media' => $mediaFile]);
            break;

        case 'scenarios':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                Logger::log('media', $method, 'scenarios', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $uniqid = $_GET['uniqid'] ?? null;
            $filename = $_GET['filename'] ?? null;

            if (!$uniqid) {
                Logger::log('media', $method, 'scenarios', $_SESSION['user_id'], [], ['error' => 'Missing uniqid'], 400);
                jsonResponse(['error' => 'uniqid is required'], 400);
            }

            $scenario = $db->fetch(
                'SELECT id, title, description, game_type, uniqid, created_at, updated_at
                 FROM scenarios
                 WHERE uniqid = ?',
                [$uniqid]
            );

            if (!$scenario) {
                Logger::log('media', $method, 'scenarios', $_SESSION['user_id'], ['uniqid' => $uniqid], ['count' => 0], 200);
                jsonResponse(['scenarios' => []]);
            }

            Logger::log('media', $method, 'scenarios', $_SESSION['user_id'], ['uniqid' => $uniqid], ['count' => 1], 200);
            jsonResponse(['scenarios' => [$scenario]]);
            break;

        case 'delete':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                Logger::log('media', $method, 'delete', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $uniqid = $data['uniqid'] ?? $_POST['uniqid'] ?? $_GET['uniqid'] ?? null;
            $filename = $data['filename'] ?? $_POST['filename'] ?? $_GET['filename'] ?? null;

            if (!$uniqid || !$filename) {
                Logger::log('media', $method, 'delete', $_SESSION['user_id'], [], ['error' => 'Missing parameters'], 400);
                jsonResponse(['error' => 'uniqid and filename are required'], 400);
            }

            $filePath = __DIR__ . '/../../media/' . $uniqid . '/' . $filename;

            if (!file_exists($filePath) || !is_file($filePath)) {
                Logger::log('media', $method, 'delete', $_SESSION['user_id'], ['uniqid' => $uniqid, 'filename' => $filename], ['error' => 'File not found'], 404);
                jsonResponse(['error' => 'File not found'], 404);
            }

            if (!unlink($filePath)) {
                Logger::log('media', $method, 'delete', $_SESSION['user_id'], ['uniqid' => $uniqid, 'filename' => $filename], ['error' => 'Failed to delete'], 500);
                jsonResponse(['error' => 'Failed to delete file'], 500);
            }

            $dirPath = __DIR__ . '/../../media/' . $uniqid;
            $remainingFiles = array_diff(scandir($dirPath), ['.', '..']);
            if (empty($remainingFiles)) {
                rmdir($dirPath);
            }

            Logger::log('media', $method, 'delete', $_SESSION['user_id'], ['uniqid' => $uniqid, 'filename' => $filename], ['success' => true], 200);
            jsonResponse([
                'success' => true,
                'message' => 'Media file deleted successfully'
            ]);
            break;

        case 'upload':
            requireAuth();

            if ($method !== 'POST') {
                Logger::log('media', $method, 'upload', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $rawPath = $_POST['path'] ?? $_GET['path'] ?? '';
            $upsert = filter_var($_POST['upsert'] ?? $_GET['upsert'] ?? 'true', FILTER_VALIDATE_BOOLEAN);

            if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                jsonResponse(['error' => 'No file uploaded'], 400);
            }

            $path = validateMediaPath($rawPath);
            if ($_FILES['file']['size'] > 50 * 1024 * 1024) {
                jsonResponse(['error' => 'File size must be less than 50MB'], 400);
            }

            $destPath = resolveUnderMedia($path);
            $destDir  = dirname($destPath);

            if (!is_dir($destDir) && !mkdir($destDir, 0755, true) && !is_dir($destDir)) {
                jsonResponse(['error' => 'Failed to create directory'], 500);
            }

            // Containment check: ensure final path is inside the media root.
            $resolvedDir = realpath($destDir);
            $root        = mediaRoot();
            if (!$resolvedDir || strpos($resolvedDir, $root) !== 0) {
                jsonResponse(['error' => 'Invalid path'], 400);
            }

            if (!$upsert && file_exists($destPath)) {
                jsonResponse(['error' => 'File already exists'], 409);
            }

            if (!move_uploaded_file($_FILES['file']['tmp_name'], $destPath)) {
                jsonResponse(['error' => 'Failed to save file'], 500);
            }

            Logger::log('media', $method, 'upload', $_SESSION['user_id'], ['path' => $path], ['success' => true], 200);
            jsonResponse([
                'success' => true,
                'path'    => $path,
                'size'    => filesize($destPath),
            ]);
            break;

        case 'list_folder':
            requireAuth();

            if ($method !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $rawPath = $_GET['path'] ?? '';
            $path    = validateMediaPath($rawPath);
            $dirPath = resolveUnderMedia($path);

            if (!is_dir($dirPath)) {
                // Supabase returns [] for nonexistent folders, not an error.
                jsonResponse(['files' => []]);
            }

            $resolvedDir = realpath($dirPath);
            $root        = mediaRoot();
            if (!$resolvedDir || strpos($resolvedDir, $root) !== 0) {
                jsonResponse(['error' => 'Invalid path'], 400);
            }

            $entries = array_values(array_diff(scandir($dirPath), ['.', '..']));
            $files = [];
            foreach ($entries as $name) {
                $full = $dirPath . DIRECTORY_SEPARATOR . $name;
                if (!is_file($full)) continue;
                $files[] = [
                    'name' => $name,
                    'size' => filesize($full),
                    'updated_at' => date('Y-m-d H:i:s', filemtime($full)),
                ];
            }
            jsonResponse(['files' => $files]);
            break;

        case 'delete_path':
            requireAuth();

            if ($method !== 'POST' && $method !== 'DELETE') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $body = json_decode(file_get_contents('php://input'), true) ?? [];
            $paths = $body['paths'] ?? $_POST['paths'] ?? null;

            if (!is_array($paths) || count($paths) === 0) {
                jsonResponse(['error' => 'paths array is required'], 400);
            }

            $root = mediaRoot();
            $deleted = [];
            $errors  = [];

            foreach ($paths as $raw) {
                if (!is_string($raw) || $raw === '') continue;
                try {
                    $rel = validateMediaPath($raw);
                } catch (Throwable $e) {
                    $errors[] = ['path' => $raw, 'error' => 'Invalid path'];
                    continue;
                }
                $abs = resolveUnderMedia($rel);
                $realAbs = realpath($abs);
                if (!$realAbs || strpos($realAbs, $root) !== 0 || !is_file($realAbs)) {
                    $errors[] = ['path' => $rel, 'error' => 'Not found'];
                    continue;
                }
                if (!unlink($realAbs)) {
                    $errors[] = ['path' => $rel, 'error' => 'Failed to delete'];
                    continue;
                }
                $deleted[] = $rel;

                // Clean up empty parent directory (don't recurse past media root).
                $parent = dirname($realAbs);
                if ($parent !== $root && is_dir($parent) &&
                    count(array_diff(scandir($parent), ['.', '..'])) === 0) {
                    @rmdir($parent);
                }
            }

            Logger::log('media', $method, 'delete_path', $_SESSION['user_id'], ['paths' => $paths], ['deleted' => count($deleted)], 200);
            jsonResponse(['success' => true, 'deleted' => $deleted, 'errors' => $errors]);
            break;

        default:
            Logger::log('media', $method, $action ?: 'none', $_SESSION['user_id'] ?? null, [], ['error' => 'Invalid action'], 400);
            jsonResponse(['error' => 'Invalid action. Available actions: list, get, scenarios, delete, upload, list_folder, delete_path'], 400);
    }
} catch (Exception $e) {
    Logger::log('media', $method, $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
