<?php
session_start();

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/ReportLayouts.php';

// Admin API for the per-game-type mission-report PDF layouts (the "PDF editor"
// defaults). Global, admin-owned; synced to playground via playground.php
// get_report_layouts. Per-scenario overrides live in game_meta, not here.
// Mirrors recovery_codes.php conventions.

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function requireAdminAuth($db) {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Unauthorized - Admin login required'], 401);
    }
    $adminUser = $db->fetch('SELECT id FROM admin_users WHERE id = ?', [$_SESSION['user_id']]);
    if (!$adminUser) {
        jsonResponse(['error' => 'Unauthorized - Admin login required'], 401);
    }
    return $adminUser['id'];
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
            ]);
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

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    Logger::log('report_layouts', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
