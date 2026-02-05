<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

function requireClientAuth() {
    if (!isset($_SESSION['client_id'])) {
        jsonResponse(['error' => 'Unauthorized - Client login required'], 401);
    }
    return $_SESSION['client_id'];
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth();

            $cards = $db->fetchAll(
                'SELECT * FROM client_cards WHERE client_id = ? ORDER BY created_at DESC',
                [$clientId]
            );

            foreach ($cards as &$card) {
                if (!empty($card['additional_data'])) {
                    $card['additional_data'] = json_decode($card['additional_data'], true);
                }
            }

            jsonResponse(['data' => $cards]);
            break;

        case 'import':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth();
            $data = getRequestData();

            if (!isset($data['cards']) || !is_array($data['cards'])) {
                jsonResponse(['error' => 'Invalid cards data'], 400);
            }

            $db->query('DELETE FROM client_cards WHERE client_id = ?', [$clientId]);

            $stmt = $db->prepare(
                'INSERT INTO client_cards (client_id, card_name, card_type, card_rarity, card_power, card_description, additional_data, import_batch)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            );

            $batchId = $data['batchId'] ?? uniqid('batch_', true);
            $insertedCount = 0;

            foreach ($data['cards'] as $card) {
                $additionalData = isset($card['additional_data']) && !empty($card['additional_data'])
                    ? json_encode($card['additional_data'])
                    : null;

                $stmt->execute([
                    $clientId,
                    $card['card_name'] ?? '',
                    $card['card_type'] ?? '',
                    $card['card_rarity'] ?? '',
                    $card['card_power'] ?? '',
                    $card['card_description'] ?? '',
                    $additionalData,
                    $batchId
                ]);
                $insertedCount++;
            }

            Logger::log('cards', 'POST', 'import', $clientId, ['count' => $insertedCount], ['success' => true, 'count' => $insertedCount], 200);
            jsonResponse(['success' => true, 'imported' => $insertedCount]);
            break;

        case 'delete_all':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth();

            $result = $db->query('DELETE FROM client_cards WHERE client_id = ?', [$clientId]);
            $deletedCount = $result->rowCount();

            Logger::log('cards', 'DELETE', 'delete_all', $clientId, [], ['success' => true, 'count' => $deletedCount], 200);
            jsonResponse(['success' => true, 'deleted' => $deletedCount]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    Logger::log('cards', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', $_SESSION['client_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
