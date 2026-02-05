<?php
session_start();

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

function requireAdminAuth($db) {
    $adminUser = $db->fetch(
        'SELECT id, email FROM admin_users WHERE id = ? AND is_active = 1',
        [$_SESSION['admin_id'] ?? null]
    );

    if (!$adminUser) {
        jsonResponse(['error' => 'Unauthorized - Admin login required'], 401);
    }

    return $adminUser['id'];
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
            $cardsFile = getCardsDirectory($clientId) . '/cards.csv';
            $fileExists = file_exists($cardsFile);

            $metadata = $db->fetch(
                'SELECT * FROM client_cards_metadata WHERE client_id = ?',
                [$clientId]
            );

            if ($fileExists && !$metadata) {
                $db->query(
                    'INSERT INTO client_cards_metadata (client_id, version) VALUES (?, ?)',
                    [$clientId, 1]
                );
                $metadata = $db->fetch(
                    'SELECT * FROM client_cards_metadata WHERE client_id = ?',
                    [$clientId]
                );
            }

            if ($metadata) {
                $metadata['has_file'] = $fileExists;
            }

            jsonResponse(['data' => $metadata]);
            break;

        case 'admin_get_metadata':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            requireAdminAuth($db);

            if (!isset($_GET['client_id'])) {
                jsonResponse(['error' => 'Client ID is required'], 400);
            }

            $clientId = $_GET['client_id'];

            error_log("Admin getting metadata for client: " . $clientId);

            $client = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$clientId]
            );

            if (!$client) {
                error_log("Client not found: " . $clientId);
                jsonResponse(['error' => 'Client not found'], 404);
            }

            $cardsFile = getCardsDirectory($clientId) . '/cards.csv';
            $fileExists = file_exists($cardsFile);
            error_log("Cards file exists: " . ($fileExists ? 'yes' : 'no') . " at " . $cardsFile);

            $metadata = $db->fetch(
                'SELECT * FROM client_cards_metadata WHERE client_id = ?',
                [$clientId]
            );

            error_log("Metadata from DB: " . json_encode($metadata));

            if ($fileExists && !$metadata) {
                $db->query(
                    'INSERT INTO client_cards_metadata (client_id, version) VALUES (?, ?)',
                    [$clientId, 1]
                );
                $metadata = $db->fetch(
                    'SELECT * FROM client_cards_metadata WHERE client_id = ?',
                    [$clientId]
                );
            }

            if ($metadata) {
                $metadata['has_file'] = $fileExists;
            }

            error_log("Final metadata: " . json_encode($metadata));
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

        case 'admin_upload':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            error_log("Admin upload request received");
            error_log("POST data: " . json_encode($_POST));
            error_log("FILES data: " . json_encode($_FILES));

            requireAdminAuth($db);

            if (!isset($_POST['client_id'])) {
                error_log("Client ID not provided in POST");
                jsonResponse(['error' => 'Client ID is required'], 400);
            }

            $clientId = $_POST['client_id'];
            error_log("Client ID: " . $clientId);

            $client = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$clientId]
            );

            if (!$client) {
                error_log("Client not found: " . $clientId);
                jsonResponse(['error' => 'Client not found'], 404);
            }

            if (!isset($_FILES['file'])) {
                error_log("No file uploaded");
                jsonResponse(['error' => 'No file uploaded'], 400);
            }

            $file = $_FILES['file'];
            error_log("File uploaded: " . $file['name']);

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

            Logger::log('cards', 'POST', 'admin_upload', $clientId, ['filename' => $file['name']], ['success' => true, 'version' => $newVersion], 200);
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
