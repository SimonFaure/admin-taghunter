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
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Unauthorized - Admin login required'], 401);
    }

    $adminUser = $db->fetch(
        'SELECT id, email FROM admin_users WHERE id = ?',
        [$_SESSION['user_id']]
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

function getCardsFilePath($clientId, $version) {
    return getCardsDirectory($clientId) . '/cards_v' . $version . '.csv';
}

function getCurrentCardsFile($db, $clientId) {
    $clientIdInt = (int)$clientId;

    Logger::log('cards', 'GET', 'getCurrentCardsFile', null, [
        'client_id' => $clientIdInt,
        'query' => 'SELECT version FROM client_cards_metadata WHERE client_id = ?'
    ], ['step' => 'starting'], 200);

    $metadata = $db->fetch(
        'SELECT version FROM client_cards_metadata WHERE client_id = ?',
        [$clientIdInt]
    );

    Logger::log('cards', 'GET', 'getCurrentCardsFile', null, [
        'client_id' => $clientIdInt
    ], [
        'step' => 'metadata_fetched',
        'metadata' => $metadata,
        'found' => !empty($metadata)
    ], 200);

    if (!$metadata) {
        Logger::log('cards', 'GET', 'getCurrentCardsFile', null, [
            'client_id' => $clientIdInt
        ], [
            'step' => 'no_metadata_found',
            'error' => 'No metadata found in client_cards_metadata table'
        ], 404);
        return null;
    }

    $filePath = getCardsFilePath($clientId, $metadata['version']);
    $fileExists = file_exists($filePath);

    Logger::log('cards', 'GET', 'getCurrentCardsFile', null, [
        'client_id' => $clientIdInt,
        'version' => $metadata['version']
    ], [
        'step' => 'file_path_check',
        'file_path' => $filePath,
        'file_exists' => $fileExists
    ], 200);

    return $fileExists ? $filePath : null;
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

            Logger::log('cards', 'GET', 'get_metadata', $clientId, [
                'client_id' => $clientId,
                'query' => 'SELECT * FROM client_cards_metadata WHERE client_id = ?'
            ], ['step' => 'starting'], 200);

            $metadata = $db->fetch(
                'SELECT * FROM client_cards_metadata WHERE client_id = ?',
                [$clientId]
            );

            Logger::log('cards', 'GET', 'get_metadata', $clientId, [
                'client_id' => $clientId
            ], [
                'step' => 'metadata_fetched',
                'metadata' => $metadata,
                'found' => !empty($metadata)
            ], 200);

            $fileExists = false;
            if ($metadata) {
                $cardsFile = getCardsFilePath($clientId, $metadata['version']);
                $fileExists = file_exists($cardsFile);
                $metadata['has_file'] = $fileExists;

                Logger::log('cards', 'GET', 'get_metadata', $clientId, [
                    'client_id' => $clientId,
                    'version' => $metadata['version']
                ], [
                    'step' => 'file_check',
                    'file_path' => $cardsFile,
                    'file_exists' => $fileExists
                ], 200);
            }

            jsonResponse(['data' => $metadata]);
            break;

        case 'admin_get_metadata':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $adminId = requireAdminAuth($db);

            if (!isset($_GET['client_id'])) {
                jsonResponse(['error' => 'Client ID is required'], 400);
            }

            $clientId = (int)$_GET['client_id'];

            Logger::log('cards', 'GET', 'admin_get_metadata', $adminId, [
                'client_id' => $clientId,
                'admin_id' => $adminId
            ], ['step' => 'starting'], 200);

            $client = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$clientId]
            );

            Logger::log('cards', 'GET', 'admin_get_metadata', $adminId, [
                'client_id' => $clientId
            ], [
                'step' => 'client_lookup',
                'client_found' => !empty($client)
            ], 200);

            if (!$client) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

            $metadata = $db->fetch(
                'SELECT * FROM client_cards_metadata WHERE client_id = ?',
                [$clientId]
            );

            Logger::log('cards', 'GET', 'admin_get_metadata', $adminId, [
                'client_id' => $clientId
            ], [
                'step' => 'metadata_fetched',
                'metadata' => $metadata,
                'found' => !empty($metadata)
            ], 200);

            $fileExists = false;
            if ($metadata) {
                $cardsFile = getCardsFilePath($clientId, $metadata['version']);
                $fileExists = file_exists($cardsFile);
                $metadata['has_file'] = $fileExists;

                Logger::log('cards', 'GET', 'admin_get_metadata', $adminId, [
                    'client_id' => $clientId,
                    'version' => $metadata['version']
                ], [
                    'step' => 'file_check',
                    'file_path' => $cardsFile,
                    'file_exists' => $fileExists
                ], 200);
            } else {
                Logger::log('cards', 'GET', 'admin_get_metadata', $adminId, [
                    'client_id' => $clientId
                ], [
                    'step' => 'no_metadata',
                    'message' => 'No metadata found in client_cards_metadata table'
                ], 200);
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

            $targetFile = getCardsFilePath($clientId, $newVersion);

            if (!move_uploaded_file($file['tmp_name'], $targetFile)) {
                jsonResponse(['error' => 'Failed to save file'], 500);
            }

            Logger::log('cards', 'POST', 'upload', $clientId, ['filename' => $file['name']], ['success' => true, 'version' => $newVersion], 200);
            jsonResponse(['success' => true, 'version' => $newVersion]);
            break;

        case 'admin_upload':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            requireAdminAuth($db);

            if (!isset($_POST['client_id'])) {
                jsonResponse(['error' => 'Client ID is required'], 400);
            }

            $clientId = (int)$_POST['client_id'];

            $client = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$clientId]
            );

            if (!$client) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

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

            $targetFile = getCardsFilePath($clientId, $newVersion);

            if (!move_uploaded_file($file['tmp_name'], $targetFile)) {
                jsonResponse(['error' => 'Failed to save file'], 500);
            }

            Logger::log('cards', 'POST', 'admin_upload', $clientId, ['filename' => $file['name']], ['success' => true, 'version' => $newVersion], 200);
            jsonResponse(['success' => true, 'version' => $newVersion]);
            break;

        case 'download':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $cardsFile = getCurrentCardsFile($db, $clientId);

            if (!$cardsFile) {
                jsonResponse(['error' => 'No cards file found'], 404);
            }

            $metadata = $db->fetch(
                'SELECT version FROM client_cards_metadata WHERE client_id = ?',
                [$clientId]
            );

            $filename = 'cards_v' . ($metadata['version'] ?? '1') . '.csv';

            header('Content-Type: text/csv');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . filesize($cardsFile));
            readfile($cardsFile);
            exit;

        case 'get_data':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);

            Logger::log('cards', 'GET', 'get_data', $clientId, [
                'client_id' => $clientId
            ], ['step' => 'starting'], 200);

            $cardsFile = getCurrentCardsFile($db, $clientId);

            Logger::log('cards', 'GET', 'get_data', $clientId, [
                'client_id' => $clientId
            ], [
                'step' => 'file_retrieved',
                'file_path' => $cardsFile,
                'found' => !empty($cardsFile)
            ], 200);

            if (!$cardsFile) {
                Logger::log('cards', 'GET', 'get_data', $clientId, [
                    'client_id' => $clientId
                ], ['error' => 'No cards file found'], 404);
                jsonResponse(['error' => 'No cards file found'], 404);
            }

            $cards = [];
            $headers = [];
            $expectedHeaders = ['key_name', 'color', 'key_number', 'id'];

            if (($handle = fopen($cardsFile, 'r')) !== false) {
                $rowIndex = 0;
                while (($data = fgetcsv($handle, 1000, ',')) !== false) {
                    if ($rowIndex === 0) {
                        $headers = array_map('trim', $data);

                        $missingHeaders = array_diff($expectedHeaders, $headers);
                        if (!empty($missingHeaders)) {
                            fclose($handle);
                            jsonResponse([
                                'error' => 'Invalid CSV format. Missing required headers: ' . implode(', ', $missingHeaders),
                                'expected_headers' => $expectedHeaders,
                                'found_headers' => $headers
                            ], 400);
                        }
                    } else {
                        if (count($data) === count($headers)) {
                            $cards[] = array_combine($headers, array_map('trim', $data));
                        }
                    }
                    $rowIndex++;
                }
                fclose($handle);
            }

            Logger::log('cards', 'GET', 'get_data', $clientId, [], ['success' => true, 'count' => count($cards)], 200);
            jsonResponse(['success' => true, 'data' => $cards, 'headers' => $headers, 'count' => count($cards)]);
            break;

        case 'admin_get_data':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $adminId = requireAdminAuth($db);
            $clientId = (int)($_GET['client_id'] ?? 0);

            if (empty($clientId)) {
                jsonResponse(['error' => 'client_id is required'], 400);
            }

            Logger::log('cards', 'GET', 'admin_get_data', $adminId, [
                'client_id' => $clientId,
                'admin_id' => $adminId
            ], ['step' => 'starting'], 200);

            $cardsFile = getCurrentCardsFile($db, $clientId);

            Logger::log('cards', 'GET', 'admin_get_data', $adminId, [
                'client_id' => $clientId
            ], [
                'step' => 'file_retrieved',
                'file_path' => $cardsFile,
                'found' => !empty($cardsFile)
            ], 200);

            if (!$cardsFile) {
                Logger::log('cards', 'GET', 'admin_get_data', $adminId, [
                    'client_id' => $clientId
                ], ['error' => 'No cards file found'], 404);
                jsonResponse(['error' => 'No cards file found'], 404);
            }

            $cards = [];
            $headers = [];
            $expectedHeaders = ['key_name', 'color', 'key_number', 'id'];

            if (($handle = fopen($cardsFile, 'r')) !== false) {
                $rowIndex = 0;
                while (($data = fgetcsv($handle, 1000, ',')) !== false) {
                    if ($rowIndex === 0) {
                        $headers = array_map('trim', $data);

                        $missingHeaders = array_diff($expectedHeaders, $headers);
                        if (!empty($missingHeaders)) {
                            fclose($handle);
                            jsonResponse([
                                'error' => 'Invalid CSV format. Missing required headers: ' . implode(', ', $missingHeaders),
                                'expected_headers' => $expectedHeaders,
                                'found_headers' => $headers
                            ], 400);
                        }
                    } else {
                        if (count($data) === count($headers)) {
                            $cards[] = array_combine($headers, array_map('trim', $data));
                        }
                    }
                    $rowIndex++;
                }
                fclose($handle);
            }

            Logger::log('cards', 'GET', 'admin_get_data', $_SESSION['user_id'] ?? null, ['client_id' => $clientId], ['success' => true, 'count' => count($cards)], 200);
            jsonResponse(['success' => true, 'data' => $cards, 'headers' => $headers, 'count' => count($cards)]);
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $cardsDir = getCardsDirectory($clientId);

            $files = glob($cardsDir . '/cards_v*.csv');
            foreach ($files as $file) {
                if (file_exists($file)) {
                    unlink($file);
                }
            }

            $db->query(
                'DELETE FROM client_cards_metadata WHERE client_id = ?',
                [$clientId]
            );

            Logger::log('cards', 'DELETE', 'delete', $clientId, [], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;

        case 'debug_metadata':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $adminId = requireAdminAuth($db);
            $clientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : null;

            // Get all metadata records or just for specific client
            if ($clientId) {
                $allMetadata = $db->query(
                    'SELECT * FROM client_cards_metadata WHERE client_id = ?',
                    [$clientId]
                );
            } else {
                $allMetadata = $db->query('SELECT * FROM client_cards_metadata');
            }

            // Also check if the table exists and its structure
            $tableExists = $db->fetch("SHOW TABLES LIKE 'client_cards_metadata'");
            $tableStructure = [];
            if ($tableExists) {
                $tableStructure = $db->query("DESCRIBE client_cards_metadata");
            }

            jsonResponse([
                'table_exists' => !empty($tableExists),
                'table_structure' => $tableStructure,
                'metadata_records' => $allMetadata,
                'record_count' => count($allMetadata),
                'query_client_id' => $clientId
            ]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    Logger::log('cards', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
