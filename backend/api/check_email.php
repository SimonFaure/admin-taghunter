<?php

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
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

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        jsonResponse(['error' => 'Method not allowed'], 405);
    }

    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }

    $email = $_GET['email'] ?? '';

    if (empty($email)) {
        jsonResponse(['error' => 'Email parameter is required'], 400);
    }

    $db = Database::getInstance();

    $user = $db->fetch(
        'SELECT id, email, name FROM admin_users WHERE id = ?',
        [$_SESSION['user_id']]
    );

    if (!$user) {
        session_destroy();
        jsonResponse(['error' => 'Unauthorized'], 401);
    }

    $client = $db->fetch(
        'SELECT id FROM clients WHERE email = ?',
        [$email]
    );

    jsonResponse(['exists' => $client !== null]);

} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
