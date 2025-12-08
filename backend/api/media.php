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

        default:
            Logger::log('media', $method, $action ?: 'none', $_SESSION['user_id'] ?? null, [], ['error' => 'Invalid action'], 400);
            jsonResponse(['error' => 'Invalid action. Available actions: list, get, scenarios'], 400);
    }
} catch (Exception $e) {
    Logger::log('media', $method, $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
