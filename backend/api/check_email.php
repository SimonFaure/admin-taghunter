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

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        jsonResponse(['error' => 'Method not allowed'], 405);
    }

    $email = $_GET['email'] ?? '';

    if (empty($email)) {
        jsonResponse(['error' => 'Email parameter is required'], 400);
    }

    $db = Database::getInstance();

    $client = $db->fetch(
        'SELECT id FROM clients WHERE email = ?',
        [$email]
    );

    jsonResponse(['exists' => $client !== null]);

} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
