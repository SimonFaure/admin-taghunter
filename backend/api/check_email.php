<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');

// Cache-busting headers to prevent SiteGround and browser caching
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');
header('Expires: 0');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        $response = ['error' => 'Method not allowed'];
        Logger::log('check_email', $_SERVER['REQUEST_METHOD'], 'check', null, [], $response, 405);
        jsonResponse($response, 405);
    }

    $email = $_GET['email'] ?? '';

    if (empty($email)) {
        $response = ['error' => 'Email parameter is required'];
        Logger::log('check_email', 'GET', 'check', null, ['email' => ''], $response, 400);
        jsonResponse($response, 400);
    }

    $db = Database::getInstance();

    $client = $db->fetch(
        'SELECT id FROM clients WHERE email = ?',
        [$email]
    );

    $admin = $db->fetch(
        'SELECT id FROM admin_users WHERE email = ?',
        [$email]
    );

    $exists = !empty($client) || !empty($admin);
    $responseData = [
        'exists' => $exists,
        'is_admin' => !empty($admin)
    ];

    if ($client) {
        $responseData['client_id'] = (int)$client['id'];
    }

    if ($admin) {
        $responseData['admin_id'] = (int)$admin['id'];
    }

    $response = ['data' => $responseData];
    Logger::log('check_email', 'GET', 'check', null, ['email' => $email], $response, 200);
    jsonResponse($response);

} catch (Exception $e) {
    $response = ['error' => 'Server error: ' . $e->getMessage()];
    Logger::log('check_email', 'GET', 'check', null, ['email' => $email ?? ''], $response, 500);
    jsonResponse($response, 500);
}
