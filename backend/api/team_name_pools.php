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

// Resolve a client X-Auth-Token (minted by auth.php login) to its client_id.
// Used by the client-portal actions so a client can only ever read/modify its
// OWN per-client pool (never the global catalog, never another client's pool).
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

// Canonical audience trio - mirrors src/types/audience.ts (game_meta.game_public).
const TEAM_NAME_AUDIENCES = ['mini_kids', 'kids', 'ado_adultes'];

// Fold legacy / mislabelled values onto the canonical trio (mirror of the TS
// normalizeAudience): adults/teens/etc -> ado_adultes; else lowercased as-is.
function normalizeAudience($raw) {
    $v = strtolower(trim((string)$raw));
    if (in_array($v, ['adults', 'adult', 'adultes', 'teens', 'ado'], true)) {
        return 'ado_adultes';
    }
    return $v;
}

function ensureNamePoolTables($db) {
    $db->query('
        CREATE TABLE IF NOT EXISTS team_name_pools (
            id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
            client_id INT NULL DEFAULT NULL,
            audience ENUM(\'mini_kids\',\'kids\',\'ado_adultes\') NOT NULL,
            language VARCHAR(5) NOT NULL,
            name VARCHAR(255) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_scope (client_id, audience, language)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ');
    $db->query('
        CREATE TABLE IF NOT EXISTS team_name_pools_meta (
            scope_key VARCHAR(64) PRIMARY KEY,
            current_version DECIMAL(10,2) NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ');
    $db->query('INSERT IGNORE INTO team_name_pools_meta (scope_key, current_version) VALUES (\'global\', 0)');
}

// Resolve a `scope` request param into [client_id (int|null), scope_key (string)].
// 'global' -> [null, 'global']; numeric -> [N, 'client:N'] (verifies the client exists).
function resolveScope($db, $scope) {
    if ($scope === null || $scope === '' || $scope === 'global') {
        return [null, 'global'];
    }
    $clientId = (int)$scope;
    if ($clientId <= 0) {
        jsonResponse(['error' => 'Invalid scope'], 400);
    }
    $client = $db->fetch('SELECT id FROM clients WHERE id = ?', [$clientId]);
    if (!$client) {
        jsonResponse(['error' => 'Client not found'], 404);
    }
    return [$clientId, 'client:' . $clientId];
}

function getScopeVersion($db, $scopeKey) {
    // current_version is DECIMAL(10,2); cast to float so JSON emits a number.
    $row = $db->fetch('SELECT current_version FROM team_name_pools_meta WHERE scope_key = ?', [$scopeKey]);
    return round((float)($row['current_version'] ?? 0), 2);
}

// Bump a scope's version by 0.10 (creating its meta row if needed). Arithmetic
// runs in SQL on the DECIMAL column to avoid float-precision drift, mirroring
// cards_version (cards.php).
function bumpScopeVersion($db, $scopeKey) {
    $db->query(
        'INSERT INTO team_name_pools_meta (scope_key, current_version) VALUES (?, 0.1)
         ON DUPLICATE KEY UPDATE current_version = current_version + 0.1, updated_at = NOW()',
        [$scopeKey]
    );
    return getScopeVersion($db, $scopeKey);
}

// SELECT clause fragment that matches a scope (NULL client_id needs IS NULL).
function scopeWhere($clientId) {
    return $clientId === null ? 'client_id IS NULL' : 'client_id = ?';
}
function scopeArgs($clientId) {
    return $clientId === null ? [] : [$clientId];
}

// Load a scope's full pool payload: pools[audience][language][] = {id,name},
// per-audience/language counts, and the scope version. Shared by the admin
// get_pool/get_pool_meta actions and the client-portal read actions.
function loadScopePools($db, $clientId, $scopeKey) {
    $rows = $db->fetchAll(
        'SELECT id, audience, language, name FROM team_name_pools
         WHERE ' . scopeWhere($clientId) . ' ORDER BY audience ASC, language ASC, name ASC',
        scopeArgs($clientId)
    );
    $pools = [];
    $counts = [];
    foreach ($rows as $r) {
        $pools[$r['audience']][$r['language']][] = ['id' => $r['id'], 'name' => $r['name']];
        $counts[$r['audience']][$r['language']] = ($counts[$r['audience']][$r['language']] ?? 0) + 1;
    }
    return [
        'version' => getScopeVersion($db, $scopeKey),
        'pools' => (object)$pools,
        'counts' => (object)$counts,
    ];
}

try {
    $db = Database::getInstance();
    ensureNamePoolTables($db);
    $action = $_GET['action'] ?? '';

    switch ($action) {

        case 'get_pool_meta':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            requireAdminAuth($db);
            [$clientId, $scopeKey] = resolveScope($db, $_GET['scope'] ?? 'global');

            $rows = $db->fetchAll(
                'SELECT audience, language, COUNT(*) as cnt FROM team_name_pools
                 WHERE ' . scopeWhere($clientId) . ' GROUP BY audience, language',
                scopeArgs($clientId)
            );
            $counts = [];
            foreach ($rows as $r) {
                $counts[$r['audience']][$r['language']] = (int)$r['cnt'];
            }
            $metaRow = $db->fetch('SELECT updated_at FROM team_name_pools_meta WHERE scope_key = ?', [$scopeKey]);
            jsonResponse(['success' => true, 'data' => [
                'current_version' => getScopeVersion($db, $scopeKey),
                'counts' => (object)$counts,
                'updated_at' => $metaRow['updated_at'] ?? null,
            ]]);
            break;

        case 'get_pool':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            requireAdminAuth($db);
            [$clientId, $scopeKey] = resolveScope($db, $_GET['scope'] ?? 'global');

            $rows = $db->fetchAll(
                'SELECT id, audience, language, name FROM team_name_pools
                 WHERE ' . scopeWhere($clientId) . ' ORDER BY audience ASC, language ASC, name ASC',
                scopeArgs($clientId)
            );
            $pools = [];
            foreach ($rows as $r) {
                $pools[$r['audience']][$r['language']][] = ['id' => $r['id'], 'name' => $r['name']];
            }
            jsonResponse(['success' => true, 'version' => getScopeVersion($db, $scopeKey), 'pools' => (object)$pools]);
            break;

        case 'add_names':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $adminId = requireAdminAuth($db);
            $body = json_decode(file_get_contents('php://input'), true);
            [$clientId, $scopeKey] = resolveScope($db, $body['scope'] ?? 'global');

            $audience = normalizeAudience($body['audience'] ?? '');
            $language = strtolower(trim($body['language'] ?? ''));
            $names = $body['names'] ?? [];
            if (!in_array($audience, TEAM_NAME_AUDIENCES, true)) jsonResponse(['error' => 'Invalid audience'], 400);
            if ($language === '' || strlen($language) > 5) jsonResponse(['error' => 'Invalid language'], 400);
            if (!is_array($names) || empty($names)) jsonResponse(['error' => 'names must be a non-empty array'], 400);

            // De-dup (case-insensitive) against names already in this scope/audience/language.
            $existing = $db->fetchAll(
                'SELECT name FROM team_name_pools WHERE ' . scopeWhere($clientId) . ' AND audience = ? AND language = ?',
                array_merge(scopeArgs($clientId), [$audience, $language])
            );
            $seen = [];
            foreach ($existing as $e) $seen[mb_strtolower(trim($e['name']))] = true;

            $conn = $db->getConnection();
            $conn->beginTransaction();
            $added = 0; $skipped = 0;
            try {
                foreach ($names as $raw) {
                    $name = trim((string)$raw);
                    if ($name === '') { continue; }
                    $key = mb_strtolower($name);
                    if (isset($seen[$key])) { $skipped++; continue; }
                    $seen[$key] = true;
                    $db->query(
                        'INSERT INTO team_name_pools (client_id, audience, language, name) VALUES (?, ?, ?, ?)',
                        [$clientId, $audience, $language, $name]
                    );
                    $added++;
                }
                if ($added > 0) { bumpScopeVersion($db, $scopeKey); }
                $conn->commit();
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }
            Logger::log('team_name_pools', 'POST', 'add_names', $adminId, ['scope' => $scopeKey, 'audience' => $audience, 'language' => $language, 'added' => $added], ['success' => true], 200);
            jsonResponse(['success' => true, 'added' => $added, 'skipped' => $skipped, 'version' => getScopeVersion($db, $scopeKey)]);
            break;

        case 'delete_names':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'DELETE') jsonResponse(['error' => 'Method not allowed'], 405);
            $adminId = requireAdminAuth($db);
            $body = json_decode(file_get_contents('php://input'), true);
            [$clientId, $scopeKey] = resolveScope($db, $body['scope'] ?? 'global');
            $ids = $body['ids'] ?? [];
            if (!is_array($ids) || empty($ids)) jsonResponse(['error' => 'ids must be a non-empty array'], 400);

            $conn = $db->getConnection();
            $conn->beginTransaction();
            $deleted = 0;
            try {
                foreach ($ids as $id) {
                    $id = trim((string)$id);
                    if ($id === '') continue;
                    // Scope-guard the delete so a client scope can't delete global rows.
                    $db->query(
                        'DELETE FROM team_name_pools WHERE id = ? AND ' . scopeWhere($clientId),
                        array_merge([$id], scopeArgs($clientId))
                    );
                    $deleted++;
                }
                if ($deleted > 0) { bumpScopeVersion($db, $scopeKey); }
                $conn->commit();
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }
            Logger::log('team_name_pools', 'POST', 'delete_names', $adminId, ['scope' => $scopeKey, 'count' => $deleted], ['success' => true], 200);
            jsonResponse(['success' => true, 'deleted' => $deleted, 'version' => getScopeVersion($db, $scopeKey)]);
            break;

        case 'upload_csv':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $adminId = requireAdminAuth($db);
            [$clientId, $scopeKey] = resolveScope($db, $_POST['scope'] ?? 'global');

            if (!isset($_FILES['file'])) jsonResponse(['error' => 'No file uploaded'], 400);
            $file = $_FILES['file'];
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if ($ext !== 'csv') jsonResponse(['error' => 'Only CSV files are allowed'], 400);

            $expectedHeaders = ['audience', 'language', 'name'];
            $rowsIn = [];
            if (($handle = fopen($file['tmp_name'], 'r')) !== false) {
                $headers = [];
                $rowIndex = 0;
                while (($data = fgetcsv($handle, 1000, ',')) !== false) {
                    if ($rowIndex === 0) {
                        $headers = array_map(function ($h) { return strtolower(trim($h)); }, $data);
                        $missing = array_diff($expectedHeaders, $headers);
                        if (!empty($missing)) {
                            fclose($handle);
                            jsonResponse([
                                'error' => 'Invalid CSV format. Missing required headers: ' . implode(', ', $missing),
                                'expected_headers' => $expectedHeaders,
                                'found_headers' => $headers,
                            ], 400);
                        }
                    } else {
                        if (count($data) === count($headers)) {
                            $rowsIn[] = array_combine($headers, array_map('trim', $data));
                        }
                    }
                    $rowIndex++;
                }
                fclose($handle);
            }
            if (empty($rowsIn)) jsonResponse(['error' => 'CSV file contains no data rows'], 400);

            // Preload existing names per (audience,language) so we can de-dup case-insensitively.
            $existingRows = $db->fetchAll(
                'SELECT audience, language, name FROM team_name_pools WHERE ' . scopeWhere($clientId),
                scopeArgs($clientId)
            );
            $seen = [];
            foreach ($existingRows as $e) {
                $seen[$e['audience'] . '|' . $e['language'] . '|' . mb_strtolower(trim($e['name']))] = true;
            }

            $conn = $db->getConnection();
            $conn->beginTransaction();
            $added = 0; $skipped = 0;
            try {
                foreach ($rowsIn as $row) {
                    $audience = normalizeAudience($row['audience'] ?? '');
                    $language = strtolower(trim($row['language'] ?? ''));
                    $name = trim($row['name'] ?? '');
                    if (!in_array($audience, TEAM_NAME_AUDIENCES, true) || $language === '' || strlen($language) > 5 || $name === '') {
                        $skipped++;
                        continue;
                    }
                    $key = $audience . '|' . $language . '|' . mb_strtolower($name);
                    if (isset($seen[$key])) { $skipped++; continue; }
                    $seen[$key] = true;
                    $db->query(
                        'INSERT INTO team_name_pools (client_id, audience, language, name) VALUES (?, ?, ?, ?)',
                        [$clientId, $audience, $language, $name]
                    );
                    $added++;
                }
                if ($added > 0) { bumpScopeVersion($db, $scopeKey); }
                $conn->commit();
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }
            Logger::log('team_name_pools', 'POST', 'upload_csv', $adminId, ['scope' => $scopeKey, 'filename' => $file['name'], 'added' => $added], ['success' => true], 200);
            jsonResponse(['success' => true, 'added' => $added, 'skipped' => $skipped, 'version' => getScopeVersion($db, $scopeKey)]);
            break;

        // ---- Client-portal actions ------------------------------------------
        // These derive the scope from the client's auth token; the client can
        // ONLY touch its own per-client pool. The global catalog is read-only.

        case 'client_get_catalog':
            // Read-only view of the global catalog (the default names).
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            requireClientAuth($db);
            jsonResponse(['success' => true] + loadScopePools($db, null, 'global'));
            break;

        case 'client_get_pool':
            // The client's own additions.
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            $clientId = requireClientAuth($db);
            jsonResponse(['success' => true] + loadScopePools($db, $clientId, 'client:' . $clientId));
            break;

        case 'client_add_names':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $clientId = requireClientAuth($db);
            $scopeKey = 'client:' . $clientId;
            $body = json_decode(file_get_contents('php://input'), true);

            $audience = normalizeAudience($body['audience'] ?? '');
            $language = strtolower(trim($body['language'] ?? ''));
            $names = $body['names'] ?? [];
            if (!in_array($audience, TEAM_NAME_AUDIENCES, true)) jsonResponse(['error' => 'Invalid audience'], 400);
            if ($language === '' || strlen($language) > 5) jsonResponse(['error' => 'Invalid language'], 400);
            if (!is_array($names) || empty($names)) jsonResponse(['error' => 'names must be a non-empty array'], 400);

            // De-dup (case-insensitive) against the client's own names AND the
            // global catalog, so a client can't shadow a default name.
            $existing = $db->fetchAll(
                'SELECT name FROM team_name_pools
                 WHERE (client_id = ? OR client_id IS NULL) AND audience = ? AND language = ?',
                [$clientId, $audience, $language]
            );
            $seen = [];
            foreach ($existing as $e) $seen[mb_strtolower(trim($e['name']))] = true;

            $conn = $db->getConnection();
            $conn->beginTransaction();
            $added = 0; $skipped = 0;
            try {
                foreach ($names as $raw) {
                    $name = trim((string)$raw);
                    if ($name === '') { continue; }
                    $key = mb_strtolower($name);
                    if (isset($seen[$key])) { $skipped++; continue; }
                    $seen[$key] = true;
                    $db->query(
                        'INSERT INTO team_name_pools (client_id, audience, language, name) VALUES (?, ?, ?, ?)',
                        [$clientId, $audience, $language, $name]
                    );
                    $added++;
                }
                if ($added > 0) { bumpScopeVersion($db, $scopeKey); }
                $conn->commit();
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }
            Logger::log('team_name_pools', 'POST', 'client_add_names', $clientId, ['scope' => $scopeKey, 'audience' => $audience, 'language' => $language, 'added' => $added], ['success' => true], 200);
            jsonResponse(['success' => true, 'added' => $added, 'skipped' => $skipped, 'version' => getScopeVersion($db, $scopeKey)]);
            break;

        case 'client_delete_names':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'DELETE') jsonResponse(['error' => 'Method not allowed'], 405);
            $clientId = requireClientAuth($db);
            $scopeKey = 'client:' . $clientId;
            $body = json_decode(file_get_contents('php://input'), true);
            $ids = $body['ids'] ?? [];
            if (!is_array($ids) || empty($ids)) jsonResponse(['error' => 'ids must be a non-empty array'], 400);

            $conn = $db->getConnection();
            $conn->beginTransaction();
            $deleted = 0;
            try {
                foreach ($ids as $id) {
                    $id = trim((string)$id);
                    if ($id === '') continue;
                    // Scope-guard: a client can only delete its OWN rows, never
                    // the global catalog (client_id = ? excludes NULL rows).
                    $db->query(
                        'DELETE FROM team_name_pools WHERE id = ? AND client_id = ?',
                        [$id, $clientId]
                    );
                    $deleted++;
                }
                if ($deleted > 0) { bumpScopeVersion($db, $scopeKey); }
                $conn->commit();
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }
            Logger::log('team_name_pools', 'POST', 'client_delete_names', $clientId, ['scope' => $scopeKey, 'count' => $deleted], ['success' => true], 200);
            jsonResponse(['success' => true, 'deleted' => $deleted, 'version' => getScopeVersion($db, $scopeKey)]);
            break;

        case 'client_upload_csv':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $clientId = requireClientAuth($db);
            $scopeKey = 'client:' . $clientId;

            if (!isset($_FILES['file'])) jsonResponse(['error' => 'No file uploaded'], 400);
            $file = $_FILES['file'];
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if ($ext !== 'csv') jsonResponse(['error' => 'Only CSV files are allowed'], 400);

            $expectedHeaders = ['audience', 'language', 'name'];
            $rowsIn = [];
            if (($handle = fopen($file['tmp_name'], 'r')) !== false) {
                $headers = [];
                $rowIndex = 0;
                while (($data = fgetcsv($handle, 1000, ',')) !== false) {
                    if ($rowIndex === 0) {
                        $headers = array_map(function ($h) { return strtolower(trim($h)); }, $data);
                        $missing = array_diff($expectedHeaders, $headers);
                        if (!empty($missing)) {
                            fclose($handle);
                            jsonResponse([
                                'error' => 'Invalid CSV format. Missing required headers: ' . implode(', ', $missing),
                                'expected_headers' => $expectedHeaders,
                                'found_headers' => $headers,
                            ], 400);
                        }
                    } else {
                        if (count($data) === count($headers)) {
                            $rowsIn[] = array_combine($headers, array_map('trim', $data));
                        }
                    }
                    $rowIndex++;
                }
                fclose($handle);
            }
            if (empty($rowsIn)) jsonResponse(['error' => 'CSV file contains no data rows'], 400);

            // De-dup against the client's own names AND the global catalog.
            $existingRows = $db->fetchAll(
                'SELECT audience, language, name FROM team_name_pools WHERE client_id = ? OR client_id IS NULL',
                [$clientId]
            );
            $seen = [];
            foreach ($existingRows as $e) {
                $seen[$e['audience'] . '|' . $e['language'] . '|' . mb_strtolower(trim($e['name']))] = true;
            }

            $conn = $db->getConnection();
            $conn->beginTransaction();
            $added = 0; $skipped = 0;
            try {
                foreach ($rowsIn as $row) {
                    $audience = normalizeAudience($row['audience'] ?? '');
                    $language = strtolower(trim($row['language'] ?? ''));
                    $name = trim($row['name'] ?? '');
                    if (!in_array($audience, TEAM_NAME_AUDIENCES, true) || $language === '' || strlen($language) > 5 || $name === '') {
                        $skipped++;
                        continue;
                    }
                    $key = $audience . '|' . $language . '|' . mb_strtolower($name);
                    if (isset($seen[$key])) { $skipped++; continue; }
                    $seen[$key] = true;
                    $db->query(
                        'INSERT INTO team_name_pools (client_id, audience, language, name) VALUES (?, ?, ?, ?)',
                        [$clientId, $audience, $language, $name]
                    );
                    $added++;
                }
                if ($added > 0) { bumpScopeVersion($db, $scopeKey); }
                $conn->commit();
            } catch (Exception $e) {
                $conn->rollBack();
                throw $e;
            }
            Logger::log('team_name_pools', 'POST', 'client_upload_csv', $clientId, ['scope' => $scopeKey, 'filename' => $file['name'], 'added' => $added], ['success' => true], 200);
            jsonResponse(['success' => true, 'added' => $added, 'skipped' => $skipped, 'version' => getScopeVersion($db, $scopeKey)]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }

} catch (Exception $e) {
    Logger::log('team_name_pools', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => $e->getMessage()], 500);
}
