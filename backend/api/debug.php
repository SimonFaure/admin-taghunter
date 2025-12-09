<?php
require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

$debug_info = [
    'session_id' => session_id(),
    'session_status' => session_status(),
    'session_data' => $_SESSION ?? [],
    'is_authenticated' => isset($_SESSION['user_id']),
    'user_id' => $_SESSION['user_id'] ?? null,
    'origin' => $_SERVER['HTTP_ORIGIN'] ?? 'not set',
    'cookies' => $_COOKIE ?? [],
    'request_method' => $_SERVER['REQUEST_METHOD'],
    'headers' => getallheaders(),
];

try {
    $db = Database::getInstance();
    $debug_info['database_connection'] = 'OK';

    $result = $db->fetch("SHOW TABLES LIKE 'api_logs'");
    $debug_info['api_logs_table_exists'] = !empty($result);

    if (!empty($result)) {
        $count = $db->fetch("SELECT COUNT(*) as count FROM api_logs");
        $debug_info['api_logs_count'] = $count['count'] ?? 0;

        $recent = $db->fetchAll("SELECT * FROM api_logs ORDER BY timestamp DESC LIMIT 3");
        $debug_info['recent_logs'] = $recent;
    }

    $testLog = Logger::log('debug', 'GET', 'test', null, [], ['test' => 'data'], 200);
    $debug_info['test_log_written'] = $testLog;
    $debug_info['logger_last_error'] = Logger::getLastError();

} catch (Exception $e) {
    $debug_info['database_error'] = $e->getMessage();
}

echo json_encode($debug_info, JSON_PRETTY_PRINT);
