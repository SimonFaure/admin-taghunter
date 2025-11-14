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

require_once __DIR__ . '/../database/Database.php';

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
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $email = $data['email'] ?? '';
            $password = $data['password'] ?? '';

            if (empty($email) || empty($password)) {
                jsonResponse(['error' => 'Email and password are required'], 400);
            }

            $user = $db->fetch(
                'SELECT id, email, password, name FROM admin_users WHERE email = ?',
                [$email]
            );

            if (!$user) {
                jsonResponse(['error' => 'User not found. Please run the database migration or create_admin.php script.'], 401);
            }

            if (!password_verify($password, $user['password'])) {
                jsonResponse(['error' => 'Invalid password'], 401);
            }

            unset($user['password']);
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['user'] = $user;

            jsonResponse([
                'user' => $user,
                'message' => 'Login successful'
            ]);
            break;

        case 'logout':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            session_destroy();
            jsonResponse(['message' => 'Logout successful']);
            break;

        case 'check':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            if (!isset($_SESSION['user_id'])) {
                jsonResponse(['user' => null]);
            }

            $user = $db->fetch(
                'SELECT id, email, name FROM admin_users WHERE id = ?',
                [$_SESSION['user_id']]
            );

            if (!$user) {
                session_destroy();
                jsonResponse(['user' => null]);
            }

            jsonResponse(['user' => $user]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
