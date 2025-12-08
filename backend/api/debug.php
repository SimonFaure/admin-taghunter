<?php
require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

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

echo json_encode($debug_info, JSON_PRETTY_PRINT);
