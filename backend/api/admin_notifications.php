<?php

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../utils/TokenManager.php';

SecurityHeaders::setHeaders();
setCorsHeaders();
session_start();

function getRequestData() {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (strpos($contentType, 'application/json') !== false) {
        $json = file_get_contents('php://input');
        return json_decode($json, true) ?? [];
    }
    return $_POST;
}

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}

function requireAuth() {
    if (isset($_SESSION['user_id']) && isset($_SESSION['user_type'])) {
        $db = Database::getInstance();
        $user = $db->fetch(
            'SELECT id, email, name FROM admin_users WHERE id = ?',
            [$_SESSION['user_id']]
        );
        if ($user) {
            return [
                'user_id' => $user['id'],
                'user_type' => $_SESSION['user_type'],
                'email' => $user['email']
            ];
        }
    }

    $authHeader = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!empty($authHeader)) {
        $db = Database::getInstance();
        $tokenData = TokenManager::validateToken($db, $authHeader);
        if ($tokenData) {
            return $tokenData;
        }
    }

    jsonResponse(['error' => 'Authentication required'], 401);
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? 'list';

    switch ($action) {
        case 'list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $tokenData = requireAuth();
            if ($tokenData['user_type'] !== 'admin') {
                jsonResponse(['error' => 'Admin access required'], 403);
            }

            $notifications = $db->fetchAll(
                'SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT 20'
            );

            foreach ($notifications as &$n) {
                $n['is_read'] = (bool)$n['is_read'];
                $n['metadata'] = json_decode($n['metadata'] ?? '{}', true) ?? [];
            }

            jsonResponse(['notifications' => $notifications]);
            break;

        case 'create':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $tokenData = requireAuth();
            if ($tokenData['user_type'] !== 'admin') {
                jsonResponse(['error' => 'Admin access required'], 403);
            }

            $data = getRequestData();
            $type = $data['type'] ?? 'general';
            $title = $data['title'] ?? '';
            $message = $data['message'] ?? '';
            $metadata = $data['metadata'] ?? [];

            if (empty($title) || empty($message)) {
                jsonResponse(['error' => 'Title and message are required'], 400);
            }

            $db->execute(
                'INSERT INTO admin_notifications (type, title, message, metadata) VALUES (?, ?, ?, ?)',
                [$type, $title, $message, json_encode($metadata)]
            );

            jsonResponse(['success' => true]);
            break;

        case 'mark_read':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $tokenData = requireAuth();
            if ($tokenData['user_type'] !== 'admin') {
                jsonResponse(['error' => 'Admin access required'], 403);
            }

            $data = getRequestData();
            $id = $data['id'] ?? null;

            if (!$id) {
                jsonResponse(['error' => 'Notification ID required'], 400);
            }

            $db->execute(
                'UPDATE admin_notifications SET is_read = 1 WHERE id = ?',
                [$id]
            );

            jsonResponse(['success' => true]);
            break;

        case 'mark_all_read':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $tokenData = requireAuth();
            if ($tokenData['user_type'] !== 'admin') {
                jsonResponse(['error' => 'Admin access required'], 403);
            }

            $db->execute('UPDATE admin_notifications SET is_read = 1 WHERE is_read = 0');

            jsonResponse(['success' => true]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    error_log('admin_notifications.php error: ' . $e->getMessage());
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
