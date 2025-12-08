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

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'login':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('auth', $_SERVER['REQUEST_METHOD'], 'login', null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $data = getRequestData();
            $email = $data['email'] ?? '';
            $password = $data['password'] ?? '';

            if (empty($email) || empty($password)) {
                $response = ['error' => 'Email and password are required'];
                Logger::log('auth', 'POST', 'login', null, ['email' => $email], $response, 400);
                jsonResponse($response, 400);
            }

            $user = $db->fetch(
                'SELECT id, email, password, name FROM admin_users WHERE email = ?',
                [$email]
            );

            if (!$user) {
                $response = ['error' => 'User not found. Please run the database migration or create_admin.php script.'];
                Logger::log('auth', 'POST', 'login', null, ['email' => $email], $response, 401);
                jsonResponse($response, 401);
            }

            if (!password_verify($password, $user['password'])) {
                $response = ['error' => 'Invalid password'];
                Logger::log('auth', 'POST', 'login', null, ['email' => $email], $response, 401);
                jsonResponse($response, 401);
            }

            unset($user['password']);
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user'] = $user;

            $response = [
                'user' => $user,
                'message' => 'Login successful'
            ];
            Logger::log('auth', 'POST', 'login', $user['id'], ['email' => $email], $response, 200);
            jsonResponse($response);
            break;

        case 'logout':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('auth', $_SERVER['REQUEST_METHOD'], 'logout', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = $_SESSION['user_id'] ?? null;
            session_destroy();
            $response = ['message' => 'Logout successful'];
            Logger::log('auth', 'POST', 'logout', $userId, [], $response, 200);
            jsonResponse($response);
            break;

        case 'check':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('auth', $_SERVER['REQUEST_METHOD'], 'check', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            if (!isset($_SESSION['user_id'])) {
                $response = ['user' => null];
                Logger::log('auth', 'GET', 'check', null, [], $response, 200);
                jsonResponse($response);
            }

            $user = $db->fetch(
                'SELECT id, email, name FROM admin_users WHERE id = ?',
                [$_SESSION['user_id']]
            );

            if (!$user) {
                session_destroy();
                $response = ['user' => null];
                Logger::log('auth', 'GET', 'check', $_SESSION['user_id'] ?? null, [], $response, 200);
                jsonResponse($response);
            }

            $response = ['user' => $user];
            Logger::log('auth', 'GET', 'check', $user['id'], [], $response, 200);
            jsonResponse($response);
            break;

        default:
            $response = ['error' => 'Invalid action'];
            Logger::log('auth', $_SERVER['REQUEST_METHOD'], $action, $_SESSION['user_id'] ?? null, [], $response, 400);
            jsonResponse($response, 400);
    }
} catch (Exception $e) {
    $response = ['error' => 'Server error: ' . $e->getMessage()];
    Logger::log('auth', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], $response, 500);
    jsonResponse($response, 500);
}
