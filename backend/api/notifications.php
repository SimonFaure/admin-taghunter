<?php
// Licensee notifications - the bell on /my/home. Logic: utils/LicenseeNotifications.php.
// Tables: database/add_licensee_notifications.sql (the endpoint still answers
// without them, with order updates only and nothing unread).
//
// Licensee token only:
//   GET  list       -> {items, unread_count}
//   POST mark_seen  -> {success}   (everything up to now is read, on every browser)

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
header('Cache-Control: no-store');
ini_set('display_errors', '0');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/LicenseeNotifications.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') jsonResponse([], 204);

try {
    $db = Database::getInstance();

    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($header, 'Bearer ') === 0) $header = substr($header, 7);
    $tokenData = $header !== '' ? TokenManager::validateToken($db, $header) : null;
    if (!$tokenData) jsonResponse(['error' => 'Unauthorized'], 401);
    // Licensees only (not admins, not device tokens).
    if (($tokenData['user_type'] ?? '') !== 'client' || !empty($tokenData['device_id'])) jsonResponse(['error' => 'Forbidden'], 403);
    $clientId = (int)$tokenData['user_id'];

    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];
    switch ($action) {
        case 'list':
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            jsonResponse(LicenseeNotifications::listFor($db, $clientId));
        case 'mark_seen':
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            LicenseeNotifications::markSeen($db, $clientId);
            jsonResponse(['success' => true]);
        default:
            jsonResponse(['error' => 'Unknown action'], 400);
    }
} catch (Throwable $e) {
    error_log('notifications.php: ' . $e->getMessage());
    jsonResponse(['error' => 'server_error'], 500);
}
