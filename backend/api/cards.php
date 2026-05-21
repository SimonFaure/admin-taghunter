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

function fetchClientCardsVersion($db, $clientId) {
    // client_cards_metadata.version is DECIMAL(10,2). PDO returns it as a
    // string; cast to float so the JSON wire format is a number.
    $row = $db->fetch(
        'SELECT version FROM client_cards_metadata WHERE client_id = ?',
        [(int)$clientId]
    );
    return $row ? round((float)$row['version'], 2) : 0.0;
}

function bumpClientCardsVersion($db, $clientId) {
    // Bump by 0.01 (not 1) — versions read like 1.00, 1.01, 1.02. We do the
    // arithmetic in SQL with DECIMAL to avoid float-precision drift across
    // hundreds of mutations.
    $clientId = (int)$clientId;
    $existing = $db->fetch(
        'SELECT version FROM client_cards_metadata WHERE client_id = ?',
        [$clientId]
    );
    if ($existing) {
        $db->query(
            'UPDATE client_cards_metadata SET version = version + 0.01, updated_at = NOW() WHERE client_id = ?',
            [$clientId]
        );
    } else {
        $db->query(
            'INSERT INTO client_cards_metadata (client_id, version) VALUES (?, 1.00)',
            [$clientId]
        );
    }
    return fetchClientCardsVersion($db, $clientId);
}

function fetchClientCardsRows($db, $clientId) {
    return $db->fetchAll(
        'SELECT id, key_number, key_name, color
         FROM client_cards
         WHERE client_id = ?
         ORDER BY key_number ASC, id ASC',
        [(int)$clientId]
    );
}

function normalizeCardPayload($input) {
    $card = [];
    if (isset($input['id']))         $card['id'] = (int)$input['id'];
    if (isset($input['key_number'])) $card['key_number'] = (int)$input['key_number'];
    if (isset($input['key_name']))   $card['key_name'] = trim((string)$input['key_name']);
    if (array_key_exists('color', $input)) {
        $color = $input['color'];
        $card['color'] = ($color === null || $color === '') ? null : trim((string)$color);
    }
    return $card;
}

function validateCardForCreate($card) {
    $errors = [];
    if (!isset($card['id']) || $card['id'] <= 0) {
        $errors[] = 'id is required and must be a positive integer';
    }
    if (!isset($card['key_number']) || $card['key_number'] <= 0) {
        $errors[] = 'key_number is required and must be a positive integer';
    }
    if (!isset($card['key_name']) || $card['key_name'] === '') {
        $errors[] = 'key_name is required';
    }
    return $errors;
}

function isDuplicateKeyError(PDOException $e) {
    return ($e->errorInfo[1] ?? null) == 1062;
}

function classifyCardConflict(PDOException $e) {
    // MySQL message looks like: "Duplicate entry '...' for key 'uniq_client_keynum'"
    // The PRIMARY KEY (client_id, id) shows up as "for key 'PRIMARY'".
    $msg = $e->getMessage();
    if (strpos($msg, 'uniq_client_keynum') !== false) {
        return 'key_number_taken';
    }
    return 'card_id_exists';
}

function insertCardRow($db, $clientId, $card) {
    $db->query(
        'INSERT INTO client_cards (client_id, id, key_number, key_name, color)
         VALUES (?, ?, ?, ?, ?)',
        [
            (int)$clientId,
            (int)$card['id'],
            (int)$card['key_number'],
            $card['key_name'],
            $card['color'] ?? null,
        ]
    );
}

function updateCardRow($db, $clientId, $cardId, $fields) {
    $set = [];
    $params = [];
    if (array_key_exists('key_number', $fields)) {
        $set[] = 'key_number = ?';
        $params[] = (int)$fields['key_number'];
    }
    if (array_key_exists('key_name', $fields)) {
        $set[] = 'key_name = ?';
        $params[] = $fields['key_name'];
    }
    if (array_key_exists('color', $fields)) {
        $set[] = 'color = ?';
        $params[] = $fields['color'];
    }
    if (empty($set)) {
        return 0;
    }
    $params[] = (int)$clientId;
    $params[] = (int)$cardId;
    $stmt = $db->query(
        'UPDATE client_cards SET ' . implode(', ', $set) . ' WHERE client_id = ? AND id = ?',
        $params
    );
    return $stmt->rowCount();
}

function deleteCardRow($db, $clientId, $cardId) {
    $stmt = $db->query(
        'DELETE FROM client_cards WHERE client_id = ? AND id = ?',
        [(int)$clientId, (int)$cardId]
    );
    return $stmt->rowCount();
}

function parseCardsCsvFile($filePath) {
    $rows = [];
    $errors = [];
    $expectedHeaders = ['key_name', 'color', 'key_number', 'id'];

    $handle = fopen($filePath, 'r');
    if ($handle === false) {
        return [[], ['Could not open CSV file']];
    }

    $rowIndex = 0;
    $headers = null;
    while (($data = fgetcsv($handle, 4096, ',')) !== false) {
        if ($rowIndex === 0) {
            $headers = array_map('trim', $data);
            $missing = array_diff($expectedHeaders, $headers);
            if (!empty($missing)) {
                fclose($handle);
                return [[], ['Missing required headers: ' . implode(', ', $missing)]];
            }
            $rowIndex++;
            continue;
        }
        $rowIndex++;
        if (count($data) !== count($headers)) {
            $errors[] = "Row $rowIndex: column count mismatch";
            continue;
        }
        $assoc = array_combine($headers, array_map('trim', $data));
        $rows[] = [
            'id' => (int)$assoc['id'],
            'key_number' => (int)$assoc['key_number'],
            'key_name' => $assoc['key_name'],
            'color' => $assoc['color'] === '' ? null : $assoc['color'],
        ];
    }
    fclose($handle);
    return [$rows, $errors];
}

function importCardsRows($db, $clientId, $rows) {
    $clientId = (int)$clientId;
    $inserted = 0;
    $updated = 0;
    $skipped = 0;
    $errors = [];

    $existingStmt = $db->getConnection()->prepare(
        'SELECT 1 FROM client_cards WHERE client_id = ? AND id = ?'
    );

    foreach ($rows as $i => $row) {
        $rowLabel = 'Row ' . ($i + 1);
        $validationErrors = validateCardForCreate($row);
        if (!empty($validationErrors)) {
            $skipped++;
            $errors[] = $rowLabel . ': ' . implode('; ', $validationErrors);
            continue;
        }

        $existingStmt->execute([$clientId, $row['id']]);
        $exists = (bool)$existingStmt->fetchColumn();

        try {
            if ($exists) {
                $db->query(
                    'UPDATE client_cards SET key_number = ?, key_name = ?, color = ?
                     WHERE client_id = ? AND id = ?',
                    [$row['key_number'], $row['key_name'], $row['color'], $clientId, $row['id']]
                );
                $updated++;
            } else {
                $db->query(
                    'INSERT INTO client_cards (client_id, id, key_number, key_name, color)
                     VALUES (?, ?, ?, ?, ?)',
                    [$clientId, $row['id'], $row['key_number'], $row['key_name'], $row['color']]
                );
                $inserted++;
            }
        } catch (PDOException $e) {
            $skipped++;
            if (isDuplicateKeyError($e) && classifyCardConflict($e) === 'key_number_taken') {
                $errors[] = $rowLabel . " (id={$row['id']}): key_number {$row['key_number']} is already taken by another card";
            } else {
                $errors[] = $rowLabel . " (id={$row['id']}): " . $e->getMessage();
            }
        }
    }

    return [
        'inserted' => $inserted,
        'updated' => $updated,
        'skipped' => $skipped,
        'errors' => $errors,
    ];
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    switch ($action) {

        case 'admin_list_all_db':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $adminId = requireAdminAuth($db);

            $rows = $db->fetchAll('
                SELECT
                    c.id,
                    c.email,
                    c.name,
                    ccm.version,
                    ccm.created_at,
                    ccm.updated_at,
                    COALESCE(cnt.card_count, 0) AS card_count
                FROM clients c
                LEFT JOIN client_cards_metadata ccm ON c.id = ccm.client_id
                LEFT JOIN (
                    SELECT client_id, COUNT(*) AS card_count
                    FROM client_cards
                    GROUP BY client_id
                ) cnt ON cnt.client_id = c.id
                ORDER BY c.name ASC, c.email ASC
            ');

            // Cast numeric columns. version is DECIMAL(10,2) — PDO returns it
            // as a string, so cast to float so the JSON wire format is a number.
            foreach ($rows as &$r) {
                $r['version'] = $r['version'] !== null ? round((float)$r['version'], 2) : null;
                $r['card_count'] = (int)$r['card_count'];
            }

            Logger::log('cards', 'GET', 'admin_list_all_db', $adminId, [], ['count' => count($rows)], 200);
            jsonResponse(['success' => true, 'data' => $rows]);
            break;

        case 'list_cards':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $cards = fetchClientCardsRows($db, $clientId);
            $version = fetchClientCardsVersion($db, $clientId);

            Logger::log('cards', 'GET', 'list_cards', $clientId, [], ['count' => count($cards), 'version' => $version], 200);
            jsonResponse(['cards' => $cards, 'version' => $version]);
            break;

        case 'admin_list_cards':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $adminId = requireAdminAuth($db);
            $clientId = (int)($_GET['client_id'] ?? 0);
            if ($clientId <= 0) {
                jsonResponse(['error' => 'client_id is required'], 400);
            }

            $cards = fetchClientCardsRows($db, $clientId);
            $version = fetchClientCardsVersion($db, $clientId);

            Logger::log('cards', 'GET', 'admin_list_cards', $adminId, ['client_id' => $clientId], ['count' => count($cards), 'version' => $version], 200);
            jsonResponse(['cards' => $cards, 'version' => $version]);
            break;

        case 'create_card':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $card = normalizeCardPayload(getRequestData());
            $errs = validateCardForCreate($card);
            if (!empty($errs)) {
                jsonResponse(['error' => implode('; ', $errs)], 400);
            }

            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                insertCardRow($db, $clientId, $card);
                $version = bumpClientCardsVersion($db, $clientId);
                $pdo->commit();
            } catch (PDOException $e) {
                $pdo->rollBack();
                if (isDuplicateKeyError($e)) {
                    $code = classifyCardConflict($e);
                    Logger::log('cards', 'POST', 'create_card', $clientId, ['card' => $card], ['conflict' => $code], 409);
                    jsonResponse(['error' => $code, 'error_code' => $code], 409);
                }
                throw $e;
            }

            Logger::log('cards', 'POST', 'create_card', $clientId, ['card' => $card], ['version' => $version], 200);
            jsonResponse(['success' => true, 'card' => $card, 'version' => $version]);
            break;

        case 'admin_create_card':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $adminId = requireAdminAuth($db);
            $input = getRequestData();
            $clientId = (int)($input['client_id'] ?? 0);
            if ($clientId <= 0) {
                jsonResponse(['error' => 'client_id is required'], 400);
            }

            $card = normalizeCardPayload($input);
            $errs = validateCardForCreate($card);
            if (!empty($errs)) {
                jsonResponse(['error' => implode('; ', $errs)], 400);
            }

            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                insertCardRow($db, $clientId, $card);
                $version = bumpClientCardsVersion($db, $clientId);
                $pdo->commit();
            } catch (PDOException $e) {
                $pdo->rollBack();
                if (isDuplicateKeyError($e)) {
                    $code = classifyCardConflict($e);
                    Logger::log('cards', 'POST', 'admin_create_card', $adminId, ['client_id' => $clientId, 'card' => $card], ['conflict' => $code], 409);
                    jsonResponse(['error' => $code, 'error_code' => $code], 409);
                }
                throw $e;
            }

            Logger::log('cards', 'POST', 'admin_create_card', $adminId, ['client_id' => $clientId, 'card' => $card], ['version' => $version], 200);
            jsonResponse(['success' => true, 'card' => $card, 'version' => $version]);
            break;

        case 'update_card':
            if ($_SERVER['REQUEST_METHOD'] !== 'PUT' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $input = getRequestData();
            $cardId = (int)($input['id'] ?? 0);
            if ($cardId <= 0) {
                jsonResponse(['error' => 'id is required'], 400);
            }

            $fields = normalizeCardPayload($input);
            unset($fields['id']);
            if (empty($fields)) {
                jsonResponse(['error' => 'No fields to update'], 400);
            }

            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                $affected = updateCardRow($db, $clientId, $cardId, $fields);
                if ($affected === 0) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Card not found'], 404);
                }
                $version = bumpClientCardsVersion($db, $clientId);
                $pdo->commit();
            } catch (PDOException $e) {
                $pdo->rollBack();
                if (isDuplicateKeyError($e)) {
                    Logger::log('cards', 'PUT', 'update_card', $clientId, ['id' => $cardId, 'fields' => $fields], ['conflict' => 'key_number_taken'], 409);
                    jsonResponse(['error' => 'key_number_taken', 'error_code' => 'key_number_taken'], 409);
                }
                throw $e;
            }

            Logger::log('cards', 'PUT', 'update_card', $clientId, ['id' => $cardId, 'fields' => $fields], ['version' => $version], 200);
            jsonResponse(['success' => true, 'version' => $version]);
            break;

        case 'admin_update_card':
            if ($_SERVER['REQUEST_METHOD'] !== 'PUT' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $adminId = requireAdminAuth($db);
            $input = getRequestData();
            $clientId = (int)($input['client_id'] ?? 0);
            $cardId = (int)($input['id'] ?? 0);
            if ($clientId <= 0 || $cardId <= 0) {
                jsonResponse(['error' => 'client_id and id are required'], 400);
            }

            $fields = normalizeCardPayload($input);
            unset($fields['id']);
            if (empty($fields)) {
                jsonResponse(['error' => 'No fields to update'], 400);
            }

            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                $affected = updateCardRow($db, $clientId, $cardId, $fields);
                if ($affected === 0) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Card not found'], 404);
                }
                $version = bumpClientCardsVersion($db, $clientId);
                $pdo->commit();
            } catch (PDOException $e) {
                $pdo->rollBack();
                if (isDuplicateKeyError($e)) {
                    Logger::log('cards', 'PUT', 'admin_update_card', $adminId, ['client_id' => $clientId, 'id' => $cardId, 'fields' => $fields], ['conflict' => 'key_number_taken'], 409);
                    jsonResponse(['error' => 'key_number_taken', 'error_code' => 'key_number_taken'], 409);
                }
                throw $e;
            }

            Logger::log('cards', 'PUT', 'admin_update_card', $adminId, ['client_id' => $clientId, 'id' => $cardId, 'fields' => $fields], ['version' => $version], 200);
            jsonResponse(['success' => true, 'version' => $version]);
            break;

        case 'delete_card':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            $cardId = (int)($_GET['id'] ?? (getRequestData()['id'] ?? 0));
            if ($cardId <= 0) {
                jsonResponse(['error' => 'id is required'], 400);
            }

            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                $affected = deleteCardRow($db, $clientId, $cardId);
                if ($affected === 0) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Card not found'], 404);
                }
                $version = bumpClientCardsVersion($db, $clientId);
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }

            Logger::log('cards', 'DELETE', 'delete_card', $clientId, ['id' => $cardId], ['version' => $version], 200);
            jsonResponse(['success' => true, 'version' => $version]);
            break;

        case 'admin_delete_card':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $adminId = requireAdminAuth($db);
            $clientId = (int)($_GET['client_id'] ?? (getRequestData()['client_id'] ?? 0));
            $cardId = (int)($_GET['id'] ?? (getRequestData()['id'] ?? 0));
            if ($clientId <= 0 || $cardId <= 0) {
                jsonResponse(['error' => 'client_id and id are required'], 400);
            }

            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                $affected = deleteCardRow($db, $clientId, $cardId);
                if ($affected === 0) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Card not found'], 404);
                }
                $version = bumpClientCardsVersion($db, $clientId);
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }

            Logger::log('cards', 'DELETE', 'admin_delete_card', $adminId, ['client_id' => $clientId, 'id' => $cardId], ['version' => $version], 200);
            jsonResponse(['success' => true, 'version' => $version]);
            break;

        case 'import_csv':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $clientId = requireClientAuth($db);
            if (!isset($_FILES['file'])) {
                jsonResponse(['error' => 'No file uploaded'], 400);
            }

            [$rows, $parseErrors] = parseCardsCsvFile($_FILES['file']['tmp_name']);
            if (!empty($parseErrors)) {
                jsonResponse(['error' => implode('; ', $parseErrors)], 400);
            }

            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                $result = importCardsRows($db, $clientId, $rows);
                $version = ($result['inserted'] + $result['updated']) > 0
                    ? bumpClientCardsVersion($db, $clientId)
                    : fetchClientCardsVersion($db, $clientId);
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }

            Logger::log('cards', 'POST', 'import_csv', $clientId, ['file' => $_FILES['file']['name']], $result + ['version' => $version], 200);
            jsonResponse($result + ['version' => $version, 'success' => true]);
            break;

        case 'admin_import_csv':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $adminId = requireAdminAuth($db);
            $clientId = (int)($_POST['client_id'] ?? 0);
            if ($clientId <= 0) {
                jsonResponse(['error' => 'client_id is required'], 400);
            }
            if (!isset($_FILES['file'])) {
                jsonResponse(['error' => 'No file uploaded'], 400);
            }

            [$rows, $parseErrors] = parseCardsCsvFile($_FILES['file']['tmp_name']);
            if (!empty($parseErrors)) {
                jsonResponse(['error' => implode('; ', $parseErrors)], 400);
            }

            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                $result = importCardsRows($db, $clientId, $rows);
                $version = ($result['inserted'] + $result['updated']) > 0
                    ? bumpClientCardsVersion($db, $clientId)
                    : fetchClientCardsVersion($db, $clientId);
                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                throw $e;
            }

            Logger::log('cards', 'POST', 'admin_import_csv', $adminId, ['client_id' => $clientId, 'file' => $_FILES['file']['name']], $result + ['version' => $version], 200);
            jsonResponse($result + ['version' => $version, 'success' => true]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    Logger::log('cards', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
