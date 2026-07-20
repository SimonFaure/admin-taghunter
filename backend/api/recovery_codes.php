<?php
session_start();

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/RecoveryCodes.php';

// Admin API for per-client offline PIN-recovery codes. The admin issues a pool
// of one-time codes here; they sync down to the client's playground devices
// (playground.php get_recovery_codes) and are validated offline. A code is
// consumed ONCE PER DEVICE - `used_at` here is a best-effort report-up from the
// device (recovery_codes.php is the plaintext source of truth so the admin can
// read a code aloud over the phone). Mirrors team_name_pools.php conventions.

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function requireAdminAuth($db) {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Unauthorized - Admin login required'], 401);
    }
    $adminUser = $db->fetch('SELECT id, email FROM admin_users WHERE id = ?', [$_SESSION['user_id']]);
    if (!$adminUser) {
        jsonResponse(['error' => 'Unauthorized - Admin login required'], 401);
    }
    return $adminUser['id'];
}

// Resolve a required numeric client scope (recovery codes are per-client only;
// there is no global pool). Verifies the client exists.
function resolveClient($db, $scope) {
    $clientId = (int)$scope;
    if ($clientId <= 0) {
        jsonResponse(['error' => 'A numeric client_id is required'], 400);
    }
    $client = $db->fetch('SELECT id FROM clients WHERE id = ?', [$clientId]);
    if (!$client) {
        jsonResponse(['error' => 'Client not found'], 404);
    }
    return $clientId;
}

try {
    $db = Database::getInstance();
    RecoveryCodes::ensureTables($db);
    $action = $_GET['action'] ?? '';

    switch ($action) {

        case 'get_pool':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            requireAdminAuth($db);
            $clientId = resolveClient($db, $_GET['client_id'] ?? $_GET['scope'] ?? '');

            // Auto-provision on first view so every client always shows a pool,
            // even ones created before recovery codes existed (idempotent).
            RecoveryCodes::ensureForClient($db, $clientId);

            $rows = $db->fetchAll(
                'SELECT code_index, code, used_at, used_device_label, used_context FROM recovery_codes
                 WHERE client_id = ? ORDER BY code_index ASC',
                [$clientId]
            );
            $codes = [];
            foreach ($rows as $r) {
                $codes[] = [
                    'code_index' => (int)$r['code_index'],
                    'code' => $r['code'],
                    'used_at' => $r['used_at'],
                    'used_device_label' => $r['used_device_label'],
                    // 'pin' (forgot-PIN reset) | 'billing' (device-lock reprieve) | null.
                    'used_context' => $r['used_context'] ?? null,
                ];
            }
            jsonResponse([
                'success' => true,
                'version' => RecoveryCodes::currentVersion($db, $clientId),
                'pool_size' => RecoveryCodes::POOL_SIZE,
                'codes' => $codes,
            ]);
            break;

        case 'regenerate':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $adminId = requireAdminAuth($db);
            $body = json_decode(file_get_contents('php://input'), true) ?: [];
            $clientId = resolveClient($db, $body['client_id'] ?? $body['scope'] ?? '');

            $newCodes = RecoveryCodes::regenerate($db, $clientId);
            $version = RecoveryCodes::currentVersion($db, $clientId);

            $codes = [];
            foreach ($newCodes as $c) {
                $codes[] = ['code_index' => $c['code_index'], 'code' => $c['code'], 'used_at' => null, 'used_device_label' => null];
            }
            Logger::log('recovery_codes', 'POST', 'regenerate', $adminId, ['client_id' => $clientId, 'count' => count($newCodes)], ['success' => true, 'version' => $version], 200);
            jsonResponse([
                'success' => true,
                'version' => $version,
                'pool_size' => RecoveryCodes::POOL_SIZE,
                'codes' => $codes,
            ]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    Logger::log('recovery_codes', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
