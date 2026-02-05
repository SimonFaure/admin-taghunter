<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

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

    return $tokenData['user_id'];
}

function getCardsDirectory($clientId) {
    $baseDir = __DIR__ . '/../../cards';
    $clientDir = $baseDir . '/' . $clientId;

    if (!is_dir($baseDir)) {
        mkdir($baseDir, 0755, true);
    }

    if (!is_dir($clientDir)) {
        mkdir($clientDir, 0755, true);
    }

    return $clientDir;
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'get_metadata':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);

            $metadata = $db->fetch(
                'SELECT * FROM client_cards_metadata WHERE client_id = ?',
                [$clientId]
            );

            if ($metadata) {
                $cardsFile = getCardsDirectory($clientId) . '/cards.csv';
                $metadata['has_file'] = file_exists($cardsFile);
            }

            jsonResponse(['data' => $metadata]);
            break;

        case 'upload':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);

            if (!isset($_FILES['file'])) {
                jsonResponse(['error' => 'No file uploaded'], 400);
            }

            $file = $_FILES['file'];

            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if ($ext !== 'csv') {
                jsonResponse(['error' => 'Only CSV files are allowed'], 400);
            }

            $mimeType = mime_content_type($file['tmp_name']);
            if (!in_array($mimeType, ['text/plain', 'text/csv', 'application/csv', 'application/vnd.ms-excel'])) {
                jsonResponse(['error' => 'Invalid file type. Only CSV files are allowed.'], 400);
            }

            $cardsDir = getCardsDirectory($clientId);
            $targetFile = $cardsDir . '/cards.csv';

            if (!move_uploaded_file($file['tmp_name'], $targetFile)) {
                jsonResponse(['error' => 'Failed to save file'], 500);
            }

            $currentMetadata = $db->fetch(
                'SELECT version FROM client_cards_metadata WHERE client_id = ?',
                [$clientId]
            );

            if ($currentMetadata) {
                $newVersion = (int)$currentMetadata['version'] + 1;
                $db->query(
                    'UPDATE client_cards_metadata SET version = ?, updated_at = NOW() WHERE client_id = ?',
                    [$newVersion, $clientId]
                );
            } else {
                $newVersion = 1;
                $db->query(
                    'INSERT INTO client_cards_metadata (client_id, version) VALUES (?, ?)',
                    [$clientId, $newVersion]
                );
            }

            Logger::log('cards', 'POST', 'upload', $clientId, ['filename' => $file['name']], ['success' => true, 'version' => $newVersion], 200);
            jsonResponse(['success' => true, 'version' => $newVersion]);
            break;

        case 'download':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $cardsFile = getCardsDirectory($clientId) . '/cards.csv';

            if (!file_exists($cardsFile)) {
                jsonResponse(['error' => 'No cards file found'], 404);
            }

            header('Content-Type: text/csv');
            header('Content-Disposition: attachment; filename="cards.csv"');
            header('Content-Length: ' . filesize($cardsFile));
            readfile($cardsFile);
            exit;

        case 'get_data':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $cardsFile = getCardsDirectory($clientId) . '/cards.csv';

            if (!file_exists($cardsFile)) {
                jsonResponse(['error' => 'No cards file found'], 404);
            }

            $cards = [];
            $headers = [];

            if (($handle = fopen($cardsFile, 'r')) !== false) {
                $rowIndex = 0;
                while (($data = fgetcsv($handle, 1000, ',')) !== false) {
                    if ($rowIndex === 0) {
                        $headers = $data;
                    } else {
                        if (count($data) === count($headers)) {
                            $cards[] = array_combine($headers, $data);
                        }
                    }
                    $rowIndex++;
                }
                fclose($handle);
            }

            Logger::log('cards', 'GET', 'get_data', $clientId, [], ['success' => true, 'count' => count($cards)], 200);
            jsonResponse(['success' => true, 'data' => $cards, 'headers' => $headers, 'count' => count($cards)]);
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $cardsFile = getCardsDirectory($clientId) . '/cards.csv';

            if (file_exists($cardsFile)) {
                unlink($cardsFile);
            }

            $db->query(
                'DELETE FROM client_cards_metadata WHERE client_id = ?',
                [$clientId]
            );

            Logger::log('cards', 'DELETE', 'delete', $clientId, [], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    Logger::log('cards', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
