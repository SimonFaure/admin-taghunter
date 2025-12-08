<?php

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/../utils/Logger.php';

try {
    $permissions = Logger::checkPermissions();

    $testResult = Logger::log('test_logging', 'GET', 'test', null, ['test' => 'data'], ['success' => true], 200);

    $response = [
        'success' => $testResult,
        'permissions' => $permissions,
        'last_error' => Logger::getLastError(),
        'server_user' => function_exists('posix_getpwuid') && function_exists('posix_geteuid')
            ? posix_getpwuid(posix_geteuid())['name']
            : 'unknown',
        'php_error_log' => ini_get('error_log')
    ];

    http_response_code(200);
    echo json_encode($response, JSON_PRETTY_PRINT);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ], JSON_PRETTY_PRINT);
}
