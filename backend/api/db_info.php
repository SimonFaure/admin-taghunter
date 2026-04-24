<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

try {
    $config = require __DIR__ . '/../config/database.php';
    $db = Database::getInstance()->getConnection();

    $serverVersion = $db->getAttribute(PDO::ATTR_SERVER_VERSION);
    $serverInfo = $db->getAttribute(PDO::ATTR_CONNECTION_STATUS);

    echo json_encode([
        'success' => true,
        'data' => [
            'host' => $config['host'],
            'port' => (int)$config['port'],
            'database' => $config['database'],
            'charset' => $config['charset'],
            'server_version' => $serverVersion,
            'connection_status' => $serverInfo,
        ],
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
