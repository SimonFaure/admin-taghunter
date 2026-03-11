<?php
session_start();

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
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

function ensurePoolTables($db) {
    $db->query('
        CREATE TABLE IF NOT EXISTS on_demand_cards_pool (
            id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
            key_name VARCHAR(255) NOT NULL DEFAULT \'\',
            color VARCHAR(100) NOT NULL DEFAULT \'\',
            key_number VARCHAR(100) NOT NULL DEFAULT \'\',
            card_id VARCHAR(100) NOT NULL DEFAULT \'\',
            pool_version INT NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ');

    $db->query('
        CREATE TABLE IF NOT EXISTS on_demand_cards_pool_meta (
            id INT PRIMARY KEY DEFAULT 1,
            current_version INT NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ');

    $meta = $db->fetch('SELECT id FROM on_demand_cards_pool_meta WHERE id = 1');
    if (!$meta) {
        $db->query('INSERT INTO on_demand_cards_pool_meta (id, current_version) VALUES (1, 0)');
    }

    $db->query('
        CREATE TABLE IF NOT EXISTS client_on_demand_cards (
            id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
            client_id INT NOT NULL,
            pool_card_id VARCHAR(36) NOT NULL,
            end_date DATE NULL,
            assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            assigned_by VARCHAR(255) NULL,
            FOREIGN KEY (pool_card_id) REFERENCES on_demand_cards_pool(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ');
}

try {
    $db = Database::getInstance();
    ensurePoolTables($db);
    $action = $_GET['action'] ?? '';

    switch ($action) {

        case 'get_pool_meta':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $adminId = requireAdminAuth($db);
            $meta = $db->fetch('SELECT * FROM on_demand_cards_pool_meta WHERE id = 1');
            $count = $db->fetch('SELECT COUNT(*) as cnt FROM on_demand_cards_pool WHERE pool_version = ?', [$meta['current_version'] ?? 0]);
            jsonResponse([
                'success' => true,
                'data' => [
                    'current_version' => (int)($meta['current_version'] ?? 0),
                    'card_count' => (int)($count['cnt'] ?? 0),
                    'updated_at' => $meta['updated_at'] ?? null,
                ]
            ]);
            break;

        case 'upload_pool':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $adminId = requireAdminAuth($db);

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
                jsonResponse(['error' => 'Invalid file type'], 400);
            }

            $meta = $db->fetch('SELECT current_version FROM on_demand_cards_pool_meta WHERE id = 1');
            $newVersion = ((int)($meta['current_version'] ?? 0)) + 1;

            $expectedHeaders = ['key_name', 'color', 'key_number', 'id'];
            $cards = [];

            if (($handle = fopen($file['tmp_name'], 'r')) !== false) {
                $headers = [];
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
                            $row = array_combine($headers, array_map('trim', $data));
                            $cards[] = $row;
                        }
                    }
                    $rowIndex++;
                }
                fclose($handle);
            }

            if (empty($cards)) {
                jsonResponse(['error' => 'CSV file contains no data rows'], 400);
            }

            $conn = $db->getConnection();
            $conn->beginTransaction();
            try {
                foreach ($cards as $card) {
                    $db->query(
                        'INSERT INTO on_demand_cards_pool (key_name, color, key_number, card_id, pool_version) VALUES (?, ?, ?, ?, ?)',
                        [
                            $card['key_name'] ?? '',
                            $card['color'] ?? '',
                            $card['key_number'] ?? '',
                            $card['id'] ?? '',
                            $newVersion
                        ]
                    );
                }
                $db->query(
                    'UPDATE on_demand_cards_pool_meta SET current_version = ?, updated_at = NOW() WHERE id = 1',
                    [$newVersion]
                );
                $conn->commit();
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }

            Logger::log('on_demand_cards', 'POST', 'upload_pool', $adminId, ['filename' => $file['name']], ['success' => true, 'version' => $newVersion, 'count' => count($cards)], 200);
            jsonResponse(['success' => true, 'version' => $newVersion, 'count' => count($cards)]);
            break;

        case 'get_pool':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $adminId = requireAdminAuth($db);

            $meta = $db->fetch('SELECT current_version FROM on_demand_cards_pool_meta WHERE id = 1');
            $currentVersion = (int)($meta['current_version'] ?? 0);

            if ($currentVersion === 0) {
                jsonResponse(['success' => true, 'data' => [], 'version' => 0]);
            }

            $cards = $db->fetchAll(
                'SELECT id, key_name, color, key_number, card_id, pool_version, created_at FROM on_demand_cards_pool WHERE pool_version = ? ORDER BY key_number ASC, key_name ASC',
                [$currentVersion]
            );

            jsonResponse(['success' => true, 'data' => $cards, 'version' => $currentVersion]);
            break;

        case 'get_client_assignments':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $adminId = requireAdminAuth($db);

            $clientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : null;
            if (!$clientId) {
                jsonResponse(['error' => 'client_id is required'], 400);
            }

            $assignments = $db->fetchAll(
                'SELECT coc.id, coc.pool_card_id, coc.end_date, coc.assigned_at, coc.assigned_by,
                        p.key_name, p.color, p.key_number, p.card_id
                 FROM client_on_demand_cards coc
                 JOIN on_demand_cards_pool p ON coc.pool_card_id = p.id
                 WHERE coc.client_id = ?
                 ORDER BY p.key_number ASC, p.key_name ASC',
                [$clientId]
            );

            jsonResponse(['success' => true, 'data' => $assignments]);
            break;

        case 'assign_cards':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $adminId = requireAdminAuth($db);

            $body = json_decode(file_get_contents('php://input'), true);
            $clientId = isset($body['client_id']) ? (int)$body['client_id'] : null;
            $poolCardIds = $body['pool_card_ids'] ?? [];
            $endDate = $body['end_date'] ?? null;

            if (!$clientId) {
                jsonResponse(['error' => 'client_id is required'], 400);
            }
            if (empty($poolCardIds) || !is_array($poolCardIds)) {
                jsonResponse(['error' => 'pool_card_ids must be a non-empty array'], 400);
            }

            $client = $db->fetch('SELECT id, email FROM clients WHERE id = ?', [$clientId]);
            if (!$client) {
                jsonResponse(['error' => 'Client not found'], 404);
            }

            $adminUser = $db->fetch('SELECT email FROM admin_users WHERE id = ?', [$adminId]);
            $assignedBy = $adminUser['email'] ?? 'admin';

            $endDateVal = null;
            if (!empty($endDate)) {
                $parsed = date('Y-m-d', strtotime($endDate));
                $endDateVal = ($parsed !== '1970-01-01') ? $parsed : null;
            }

            $conn = $db->getConnection();
            $conn->beginTransaction();
            $inserted = 0;
            $skipped = 0;
            try {
                foreach ($poolCardIds as $poolCardId) {
                    $poolCardId = trim($poolCardId);
                    if (empty($poolCardId)) continue;

                    $poolCard = $db->fetch('SELECT id FROM on_demand_cards_pool WHERE id = ?', [$poolCardId]);
                    if (!$poolCard) {
                        $skipped++;
                        continue;
                    }

                    $existing = $db->fetch(
                        'SELECT id FROM client_on_demand_cards WHERE client_id = ? AND pool_card_id = ?',
                        [$clientId, $poolCardId]
                    );
                    if ($existing) {
                        $db->query(
                            'UPDATE client_on_demand_cards SET end_date = ?, assigned_by = ?, assigned_at = NOW() WHERE id = ?',
                            [$endDateVal, $assignedBy, $existing['id']]
                        );
                    } else {
                        $db->query(
                            'INSERT INTO client_on_demand_cards (client_id, pool_card_id, end_date, assigned_by) VALUES (?, ?, ?, ?)',
                            [$clientId, $poolCardId, $endDateVal, $assignedBy]
                        );
                    }
                    $inserted++;
                }
                $conn->commit();
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }

            Logger::log('on_demand_cards', 'POST', 'assign_cards', $adminId, ['client_id' => $clientId, 'count' => $inserted], ['success' => true], 200);
            jsonResponse(['success' => true, 'assigned' => $inserted, 'skipped' => $skipped]);
            break;

        case 'remove_assignment':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $adminId = requireAdminAuth($db);

            $body = json_decode(file_get_contents('php://input'), true);
            $assignmentId = $body['assignment_id'] ?? null;

            if (!$assignmentId) {
                jsonResponse(['error' => 'assignment_id is required'], 400);
            }

            $db->query('DELETE FROM client_on_demand_cards WHERE id = ?', [$assignmentId]);

            Logger::log('on_demand_cards', 'DELETE', 'remove_assignment', $adminId, ['assignment_id' => $assignmentId], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;

        case 'remove_all_assignments':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }
            $adminId = requireAdminAuth($db);

            $body = json_decode(file_get_contents('php://input'), true);
            $clientId = isset($body['client_id']) ? (int)$body['client_id'] : null;

            if (!$clientId) {
                jsonResponse(['error' => 'client_id is required'], 400);
            }

            $db->query('DELETE FROM client_on_demand_cards WHERE client_id = ?', [$clientId]);

            Logger::log('on_demand_cards', 'DELETE', 'remove_all_assignments', $adminId, ['client_id' => $clientId], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    Logger::log('on_demand_cards', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
