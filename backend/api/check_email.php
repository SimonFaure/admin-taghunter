<?php

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

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

    $response = ['data' => ['exists' => $client !== null]];
    Logger::log('check_email', 'GET', 'check', null, ['email' => $email], $response, 200);
    jsonResponse($response);

} catch (Exception $e) {
    $response = ['error' => 'Server error: ' . $e->getMessage()];
    Logger::log('check_email', 'GET', 'check', null, ['email' => $email ?? ''], $response, 500);
    jsonResponse($response, 500);
}
