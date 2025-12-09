<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
    return $_SESSION['user_id'];
}

function getDirectorySize($path) {
    $size = 0;
    if (is_dir($path)) {
        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, RecursiveDirectoryIterator::SKIP_DOTS)
        );
        foreach ($files as $file) {
            if ($file->isFile()) {
                $size += $file->getSize();
            }
        }
    }
    return $size;
}

function formatBytes($bytes, $precision = 2) {
    $units = ['B', 'KB', 'MB', 'GB', 'TB'];
    $bytes = max($bytes, 0);
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
    $pow = min($pow, count($units) - 1);
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . $units[$pow];
}

try {
    $userId = requireAuth();
    $db = Database::getInstance();
    $action = $_GET['action'] ?? 'stats';

    switch ($action) {
        case 'stats':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('dashboard', $_SERVER['REQUEST_METHOD'], 'stats', $userId, [], $response, 405);
                jsonResponse($response, 405);
            }

            // Total clients
            $clientsCount = $db->fetch('SELECT COUNT(*) as count FROM clients');

            // Total scenarios
            $scenariosCount = $db->fetch('SELECT COUNT(*) as count FROM scenarios');

            // Media storage size
            $mediaPath = __DIR__ . '/../../media';
            $storageBytes = getDirectorySize($mediaPath);
            $storageFormatted = formatBytes($storageBytes);

            // Total API requests (from api_logs)
            $apiRequestsCount = $db->fetch('SELECT COUNT(*) as count FROM api_logs');

            // Calculate percentage change for API requests (last 7 days vs previous 7 days)
            $recentRequests = $db->fetch('
                SELECT COUNT(*) as count
                FROM api_logs
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
            ');
            $previousRequests = $db->fetch('
                SELECT COUNT(*) as count
                FROM api_logs
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
                AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
            ');

            $percentChange = 0;
            if ($previousRequests['count'] > 0) {
                $percentChange = round((($recentRequests['count'] - $previousRequests['count']) / $previousRequests['count']) * 100, 1);
            } elseif ($recentRequests['count'] > 0) {
                $percentChange = 100;
            }

            $response = [
                'clients' => (int)$clientsCount['count'],
                'scenarios' => (int)$scenariosCount['count'],
                'storage' => [
                    'bytes' => $storageBytes,
                    'formatted' => $storageFormatted
                ],
                'api_requests' => [
                    'total' => (int)$apiRequestsCount['count'],
                    'percent_change' => $percentChange
                ]
            ];

            Logger::log('dashboard', 'GET', 'stats', $userId, [], $response, 200);
            jsonResponse($response);
            break;

        case 'recent-activity':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('dashboard', $_SERVER['REQUEST_METHOD'], 'recent-activity', $userId, [], $response, 405);
                jsonResponse($response, 405);
            }

            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 10;

            // Get recent API logs with activity
            $recentActivity = $db->fetchAll('
                SELECT
                    endpoint,
                    action,
                    method,
                    created_at,
                    request_data,
                    response_data
                FROM api_logs
                WHERE action IN ("create", "update", "delete", "upload")
                ORDER BY created_at DESC
                LIMIT ?
            ', [$limit]);

            // Format activity items
            $activities = [];
            foreach ($recentActivity as $log) {
                $activity = [
                    'time' => $log['created_at'],
                    'endpoint' => $log['endpoint'],
                    'action' => $log['action']
                ];

                // Determine type and details based on endpoint and action
                if (strpos($log['endpoint'], 'clients') !== false) {
                    $activity['type'] = 'client';
                    $activity['icon'] = 'Users';
                    $activity['title'] = $log['action'] === 'create' ? 'New client registered' : 'Client updated';
                    $requestData = json_decode($log['request_data'], true);
                    $activity['detail'] = isset($requestData['name']) ? 'Client: ' . $requestData['name'] : 'Client updated';
                } elseif (strpos($log['endpoint'], 'scenarios') !== false) {
                    $activity['type'] = 'scenario';
                    $activity['icon'] = 'Film';
                    $activity['title'] = $log['action'] === 'create' ? 'Scenario created' : 'Scenario updated';
                    $requestData = json_decode($log['request_data'], true);
                    $activity['detail'] = isset($requestData['title']) ? $requestData['title'] : 'Scenario activity';
                } elseif (strpos($log['endpoint'], 'media') !== false) {
                    $activity['type'] = 'media';
                    $activity['icon'] = 'Image';
                    $activity['title'] = 'Media uploaded';
                    $activity['detail'] = 'New media file added';
                } else {
                    $activity['type'] = 'api';
                    $activity['icon'] = 'Activity';
                    $activity['title'] = 'API activity';
                    $activity['detail'] = ucfirst($log['action']) . ' action performed';
                }

                $activities[] = $activity;
            }

            $response = [
                'activities' => $activities
            ];

            Logger::log('dashboard', 'GET', 'recent-activity', $userId, ['limit' => $limit], $response, 200);
            jsonResponse($response);
            break;

        default:
            $response = ['error' => 'Invalid action'];
            Logger::log('dashboard', $_SERVER['REQUEST_METHOD'], $action, $userId, [], $response, 400);
            jsonResponse($response, 400);
    }
} catch (Exception $e) {
    $response = ['error' => 'Server error: ' . $e->getMessage()];
    Logger::log('dashboard', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], $response, 500);
    jsonResponse($response, 500);
}
