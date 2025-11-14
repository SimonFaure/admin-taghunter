<?php

header('Access-Control-Allow-Origin: https://admin.taghunter.fr');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

session_start();

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
}

try {
    requireAuth();

    $action = $_GET['action'] ?? 'list';

    switch ($action) {
        case 'list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 100;
            $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

            $logs = Logger::getLogs($limit, $offset);
            $total = Logger::getLogCount();

            jsonResponse([
                'logs' => $logs,
                'total' => $total,
                'limit' => $limit,
                'offset' => $offset
            ]);
            break;

        case 'clear':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            Logger::clearLogs();
            jsonResponse([
                'success' => true,
                'message' => 'Logs cleared successfully'
            ]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action. Available actions: list, clear'], 400);
    }
} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
