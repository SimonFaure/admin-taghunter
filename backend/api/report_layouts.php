<?php
session_start();

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/ReportLayouts.php';
require_once __DIR__ . '/../utils/TokenManager.php';

// Admin API for the per-game-type mission-report PDF layouts (the "PDF editor"
// defaults). Global, admin-owned; synced to playground via playground.php
// get_report_layouts. Per-scenario overrides live in game_meta, not here.
// Mirrors recovery_codes.php conventions.

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

// Token takes precedence; the session is only a fallback. The studio admin is
// token-based (secure_auth.php sets no PHP session), so without bridging the
// X-Auth-Token here this endpoint 401s. Mirrors telemetry_admin.php.
function requireAdminAuth($db) {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        if (strpos($header, 'Bearer ') === 0) {
            $header = substr($header, 7);
        }
        $tokenData = TokenManager::validateToken($db, $header);
        if ($tokenData && ($tokenData['user_type'] ?? '') === 'admin') {
            // Overwrite any stale session with the authoritative token values.
            $_SESSION['user_id'] = $tokenData['user_id'];
            $_SESSION['user_type'] = 'admin';
            return (int)$tokenData['user_id'];
        }
    }
    if (isset($_SESSION['user_id'])) {
        $adminUser = $db->fetch('SELECT id FROM admin_users WHERE id = ?', [$_SESSION['user_id']]);
        if ($adminUser) {
            return (int)$adminUser['id'];
        }
    }
    jsonResponse(['error' => 'Unauthorized - Admin login required'], 401);
}

// Resolve a client X-Auth-Token to its client_id. Used by the client-portal
// actions so a client can only ever read/modify its OWN layout overrides.
// Mirrors team_name_pools.php::requireClientAuth.
function requireClientAuth($db) {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($token, 'Bearer ') === 0) {
        $token = substr($token, 7);
    }
    if (empty($token)) {
        jsonResponse(['error' => 'Unauthorized - Token required'], 401);
    }
    $tokenData = TokenManager::validateToken($db, $token);
    if (!$tokenData) {
        jsonResponse(['error' => 'Unauthorized - Invalid or expired token'], 401);
    }
    if ($tokenData['user_type'] !== 'client') {
        jsonResponse(['error' => 'Unauthorized - Client login required'], 403);
    }
    return (int)$tokenData['user_id'];
}

try {
    $db = Database::getInstance();
    ReportLayouts::ensureTables($db);
    $action = $_GET['action'] ?? '';

    switch ($action) {

        case 'get_all':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            requireAdminAuth($db);
            jsonResponse([
                'success' => true,
                'version' => ReportLayouts::currentVersion($db),
                'game_types' => ReportLayouts::GAME_TYPES,
                'stat_fields' => ReportLayouts::STAT_FIELDS,
                'layouts' => ReportLayouts::getAll($db),
                'print_format' => ReportLayouts::getPrintFormat($db),
            ]);
            break;

        case 'save_print_format':
            // Default paper size + orientation pushed to playgrounds. A device's
            // local Settings → Printing choice always wins over this.
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $adminId = requireAdminAuth($db);
            $body = json_decode(file_get_contents('php://input'), true) ?: [];
            $format = ReportLayouts::normalizePrintFormat($body['print_format'] ?? null);
            if ($format === null) {
                jsonResponse(['error' => 'A valid print_format {paper, customMm, orientation} is required'], 400);
            }
            $version = ReportLayouts::savePrintFormat($db, $format);
            Logger::log('report_layouts', 'POST', 'save_print_format', $adminId, $format, ['success' => true, 'version' => $version], 200);
            jsonResponse(['success' => true, 'version' => $version, 'print_format' => $format]);
            break;

        case 'save':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $adminId = requireAdminAuth($db);
            $body = json_decode(file_get_contents('php://input'), true) ?: [];
            $gameType = $body['game_type'] ?? '';
            $layout = $body['layout'] ?? null;
            if (!$gameType || !is_array($layout) || !isset($layout['blocks']) || !is_array($layout['blocks'])) {
                jsonResponse(['error' => 'game_type and a valid layout (with blocks[]) are required'], 400);
            }
            $version = ReportLayouts::save($db, $gameType, $layout);
            Logger::log('report_layouts', 'POST', 'save', $adminId, ['game_type' => $gameType], ['success' => true, 'version' => $version], 200);
            jsonResponse(['success' => true, 'version' => $version]);
            break;

        case 'reset':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $adminId = requireAdminAuth($db);
            $body = json_decode(file_get_contents('php://input'), true) ?: [];
            $gameType = $body['game_type'] ?? '';
            if (!$gameType) jsonResponse(['error' => 'game_type is required'], 400);
            $layout = ReportLayouts::resetToDefault($db, $gameType);
            $version = ReportLayouts::currentVersion($db);
            Logger::log('report_layouts', 'POST', 'reset', $adminId, ['game_type' => $gameType], ['success' => true, 'version' => $version], 200);
            jsonResponse(['success' => true, 'version' => $version, 'layout' => $layout]);
            break;

        // ─────────────── client-portal actions (X-Auth-Token gated) ───────────────
        // A client designs its own per-game-type layouts; a saved override wins
        // over the admin default on that client's playgrounds only. The advertised
        // version is admin_version + client_version so a save on either side makes
        // devices re-pull (see playground.php get_report_layouts).

        case 'client_get_all':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            $clientId = requireClientAuth($db);
            $merged = ReportLayouts::getAllForClient($db, $clientId);
            jsonResponse([
                'success' => true,
                'version' => ReportLayouts::combinedVersion($db, $clientId),
                'game_types' => ReportLayouts::GAME_TYPES,
                'stat_fields' => ReportLayouts::STAT_FIELDS,
                'layouts' => $merged['layouts'],
                'customized' => $merged['customized'],
                // The client's own print format (null = inheriting) and the admin
                // default it would inherit (null = playground built-in).
                'print_format' => ReportLayouts::getClientPrintFormat($db, $clientId),
                'default_print_format' => ReportLayouts::getPrintFormat($db),
            ]);
            break;

        case 'client_save_print_format':
            // The client's own default paper size + orientation for its devices.
            // print_format: null clears it (back to the admin default). A device's
            // local Settings → Printing choice still wins over both.
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $clientId = requireClientAuth($db);
            $body = json_decode(file_get_contents('php://input'), true) ?: [];
            $format = null;
            if (array_key_exists('print_format', $body) && $body['print_format'] !== null) {
                $format = ReportLayouts::normalizePrintFormat($body['print_format']);
                if ($format === null) {
                    jsonResponse(['error' => 'A valid print_format {paper, customMm, orientation} (or null) is required'], 400);
                }
            }
            ReportLayouts::saveClientPrintFormat($db, $clientId, $format);
            $version = ReportLayouts::combinedVersion($db, $clientId);
            Logger::log('report_layouts', 'POST', 'client_save_print_format', $clientId, ['cleared' => $format === null], ['success' => true, 'version' => $version], 200);
            jsonResponse(['success' => true, 'version' => $version, 'print_format' => $format]);
            break;

        case 'client_save':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $clientId = requireClientAuth($db);
            $body = json_decode(file_get_contents('php://input'), true) ?: [];
            $gameType = $body['game_type'] ?? '';
            $layout = $body['layout'] ?? null;
            if (!$gameType || !is_array($layout) || !isset($layout['blocks']) || !is_array($layout['blocks'])) {
                jsonResponse(['error' => 'game_type and a valid layout (with blocks[]) are required'], 400);
            }
            ReportLayouts::saveClient($db, $clientId, $gameType, $layout);
            $version = ReportLayouts::combinedVersion($db, $clientId);
            Logger::log('report_layouts', 'POST', 'client_save', $clientId, ['game_type' => $gameType], ['success' => true, 'version' => $version], 200);
            jsonResponse(['success' => true, 'version' => $version]);
            break;

        case 'client_reset':
            // Drop the client's override; the game type falls back to the admin default.
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $clientId = requireClientAuth($db);
            $body = json_decode(file_get_contents('php://input'), true) ?: [];
            $gameType = $body['game_type'] ?? '';
            if (!$gameType) jsonResponse(['error' => 'game_type is required'], 400);
            $layout = ReportLayouts::resetClient($db, $clientId, $gameType);
            $version = ReportLayouts::combinedVersion($db, $clientId);
            Logger::log('report_layouts', 'POST', 'client_reset', $clientId, ['game_type' => $gameType], ['success' => true, 'version' => $version], 200);
            jsonResponse(['success' => true, 'version' => $version, 'layout' => $layout]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    Logger::log('report_layouts', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
