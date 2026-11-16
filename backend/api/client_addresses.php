<?php
// Licensee addresses: main (company) + shipping. Utils: ClientAddresses.php.
//   Licensee token:  GET get / POST save            (own account)
//   Admin token:     GET get&client_id=N / POST save&client_id=N
// POST body: {main:{company,address_line1,address_line2,postal_code,city,country,phone},
//             shipping_same_as_main: bool, shipping:{name,company,address_line1,...,phone}}

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
header('Cache-Control: no-store');
ini_set('display_errors', '0');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ClientAddresses.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function fail(string $code, int $status = 422, array $extra = []): void {
    jsonResponse(['error' => $code] + $extra, $status);
}

try {
    $db = Database::getInstance();
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($header, 'Bearer ') === 0) $header = substr($header, 7);
    $tok = $header !== '' ? TokenManager::validateToken($db, $header) : null;
    if (!$tok) fail('Unauthorized', 401);
    if (($tok['user_type'] ?? '') === 'admin') {
        $clientId = (int)($_GET['client_id'] ?? 0);
        $actor = 'admin';
    } elseif (($tok['user_type'] ?? '') === 'client' && empty($tok['device_id'])) {
        $clientId = (int)$tok['user_id'];
        $actor = 'client';
    } else {
        fail('Forbidden', 403);
    }
    $c = $clientId > 0 ? $db->fetch('SELECT * FROM clients WHERE id = ?', [$clientId]) : null;
    if (!$c) fail('not_found', 404);
    if (!array_key_exists('shipping_same_as_main', $c)) fail('addresses_unavailable', 503);

    $action = $_GET['action'] ?? 'get';
    if ($action === 'get') {
        jsonResponse(ClientAddresses::toApi($c));
    }
    if ($action === 'save' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $in = json_decode(file_get_contents('php://input') ?: '[]', true);
        if (!is_array($in)) fail('invalid_json', 400);
        [$main, $same, $ship, $errors] = ClientAddresses::validate($in);
        if ($errors) fail('validation', 422, ['errors' => $errors]);
        ClientAddresses::save($db, $clientId, $main, $same, $ship);
        Logger::log('client_addresses', 'POST', 'save', (int)$tok['user_id'], ['client_id' => $clientId], ['success' => true], 200, $actor === 'admin' ? 'admin' : 'client');
        jsonResponse(ClientAddresses::toApi($db->fetch('SELECT * FROM clients WHERE id = ?', [$clientId])));
    }
    fail('Invalid action', 400);
} catch (Throwable $e) {
    error_log('[client_addresses] ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    jsonResponse(['error' => 'Server error'], 500);
}
