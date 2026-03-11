<?php
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

SecurityHeaders::setHeaders();
setCorsHeaders();

header('Content-Type: application/json');

function jsonResponse($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function resolveUser($db, $email) {
    $client = $db->fetch('SELECT * FROM clients WHERE email = ?', [$email]);
    if ($client) {
        return ['type' => 'client', 'data' => $client];
    }
    $admin = $db->fetch('SELECT id, email, name FROM admin_users WHERE email = ?', [$email]);
    if ($admin) {
        return ['type' => 'admin', 'data' => $admin];
    }
    return null;
}

try {
    $db = Database::getInstance();
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    switch ($action) {
    case 'test':
        Logger::log('playground', $method, 'test', null, [], ['status' => 'ok'], 200, 'playground');
        jsonResponse([
            'status' => 'ok',
            'timestamp' => time(),
            'database' => 'connected'
        ]);
        break;

    case 'get_user_scenarios':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_user_scenarios', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_user_scenarios', null, [], ['error' => 'Missing email'], 400, 'playground');
            jsonResponse(['error' => 'email is required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_user_scenarios', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $isAdmin = $user['type'] === 'admin';
        $userId = $user['data']['id'];
        $scenarios = [];

        if ($isAdmin) {
            $scenarios = $db->fetchAll(
                'SELECT s.* FROM scenarios s ORDER BY s.created_at DESC'
            );
        } elseif (($user['data']['license_type'] ?? '') === 'premium') {
            $scenarios = $db->fetchAll(
                'SELECT s.* FROM scenarios s
                 WHERE s.client_id = ? OR s.scenario_type = "product"
                 ORDER BY s.created_at DESC',
                [$userId]
            );
        } else {
            $scenarios = $db->fetchAll(
                'SELECT s.* FROM scenarios s
                 LEFT JOIN client_scenarios cs ON s.id = cs.scenario_id AND cs.client_id = ?
                 WHERE s.client_id = ? OR cs.id IS NOT NULL
                 ORDER BY s.created_at DESC',
                [$userId, $userId]
            );
        }

        foreach ($scenarios as &$scenario) {
            $fileCount = 0;
            $totalSize = 0;

            if (!empty($scenario['uniqid'])) {
                $mediaDir = __DIR__ . '/../../media/' . $scenario['uniqid'];

                if (is_dir($mediaDir)) {
                    $files = scandir($mediaDir);

                    foreach ($files as $file) {
                        if ($file !== '.' && $file !== '..') {
                            $filePath = $mediaDir . '/' . $file;

                            if (is_file($filePath)) {
                                $fileCount++;
                                $totalSize += filesize($filePath);
                            }
                        }
                    }
                }
            }

            $scenario['file_count'] = $fileCount;
            $scenario['total_size'] = $totalSize;
        }

        $responseData = [
            'client' => [
                'id' => $userId,
                'email' => $user['data']['email'],
                'license_type' => $isAdmin ? 'admin' : ($user['data']['license_type'] ?? null),
                'company_name' => $isAdmin ? null : ($user['data']['company_name'] ?? null)
            ],
            'scenarios' => $scenarios
        ];

        Logger::log('playground', $method, 'get_user_scenarios', $userId, ['email' => $email, 'user_type' => $user['type']], ['count' => count($scenarios)], 200, 'playground');
        jsonResponse($responseData);
        break;

    case 'get_available_scenarios':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_available_scenarios', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_available_scenarios', null, [], ['error' => 'Missing email'], 400, 'playground');
            jsonResponse(['error' => 'email is required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_available_scenarios', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $isAdmin = $user['type'] === 'admin';
        $userId = $user['data']['id'];

        if ($isAdmin || ($user['data']['license_type'] ?? '') === 'premium') {
            Logger::log('playground', $method, 'get_available_scenarios', $userId, ['email' => $email, 'user_type' => $user['type']], ['scenarios' => []], 200, 'playground');
            jsonResponse(['scenarios' => []]);
        }

        $availableScenarios = $db->fetchAll(
            'SELECT s.* FROM scenarios s
             WHERE s.scenario_type = "product"
             AND s.id NOT IN (
                 SELECT scenario_id FROM client_scenarios WHERE client_id = ?
             )
             ORDER BY s.created_at DESC',
            [$userId]
        );

        Logger::log('playground', $method, 'get_available_scenarios', $userId, ['email' => $email, 'user_type' => $user['type']], ['count' => count($availableScenarios)], 200, 'playground');
        jsonResponse(['scenarios' => $availableScenarios]);
        break;

    case 'get_scenario_game_data':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_scenario_game_data', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;
        $uniqid = $_GET['uniqid'] ?? null;

        if (!$email || !$uniqid) {
            Logger::log('playground', $method, 'get_scenario_game_data', null, $_GET, ['error' => 'Missing parameters', 'email' => $email, 'uniqid' => $uniqid], 400, 'playground');
            jsonResponse(['error' => 'email and uniqid are required', 'received' => ['email' => $email, 'uniqid' => $uniqid, 'all_params' => $_GET]], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_scenario_game_data', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $isAdmin = $user['type'] === 'admin';
        $userId = $user['data']['id'];
        $scenario = $db->fetch('SELECT * FROM scenarios WHERE uniqid = ?', [$uniqid]);

        if (!$scenario) {
            Logger::log('playground', $method, 'get_scenario_game_data', $userId, ['uniqid' => $uniqid], ['error' => 'Scenario not found'], 404, 'playground');
            jsonResponse(['error' => 'Scenario not found'], 404);
        }

        $hasAccess = $isAdmin;

        if (!$hasAccess && $scenario['client_id'] == $userId) {
            $hasAccess = true;
        } elseif (!$hasAccess && ($user['data']['license_type'] ?? '') === 'premium' && $scenario['scenario_type'] === 'product') {
            $hasAccess = true;
        } elseif (!$hasAccess) {
            $grantedScenario = $db->fetch(
                'SELECT id FROM client_scenarios WHERE client_id = ? AND scenario_id = ?',
                [$userId, $scenario['id']]
            );

            if ($grantedScenario) {
                $hasAccess = true;
            }
        }

        if (!$hasAccess) {
            Logger::log('playground', $method, 'get_scenario_game_data', $userId, ['email' => $email, 'uniqid' => $uniqid], ['error' => 'Access denied'], 403, 'playground');
            jsonResponse(['error' => 'Access denied to this scenario'], 403);
        }

        $gameData = null;
        if (!empty($scenario['data'])) {
            $gameData = json_decode($scenario['data'], true);
        }

        $medias = null;
        if (!empty($scenario['medias'])) {
            $medias = json_decode($scenario['medias'], true);
        }

        $responseData = [
            'scenario' => [
                'id' => $scenario['id'],
                'name' => $scenario['name'],
                'uniqid' => $scenario['uniqid'],
                'scenario_type' => $scenario['scenario_type']
            ],
            'game_data' => $gameData,
            'medias' => $medias
        ];

        Logger::log('playground', $method, 'get_scenario_game_data', $userId, ['email' => $email, 'uniqid' => $uniqid, 'user_type' => $user['type']], ['success' => true], 200, 'playground');
        jsonResponse($responseData);
        break;

    case 'get_media':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_media', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;
        $uniqid = $_GET['uniqid'] ?? null;
        $filename = $_GET['filename'] ?? null;

        if (!$email || !$uniqid || !$filename) {
            Logger::log('playground', $method, 'get_media', null, $_GET, ['error' => 'Missing parameters'], 400, 'playground');
            jsonResponse(['error' => 'email, uniqid and filename are required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_media', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $isAdmin = $user['type'] === 'admin';
        $userId = $user['data']['id'];
        $scenario = $db->fetch('SELECT * FROM scenarios WHERE uniqid = ?', [$uniqid]);

        if (!$scenario) {
            Logger::log('playground', $method, 'get_media', $userId, ['uniqid' => $uniqid], ['error' => 'Scenario not found'], 404, 'playground');
            jsonResponse(['error' => 'Scenario not found'], 404);
        }

        $hasAccess = $isAdmin;

        if (!$hasAccess && $scenario['client_id'] == $userId) {
            $hasAccess = true;
        } elseif (!$hasAccess && ($user['data']['license_type'] ?? '') === 'premium' && $scenario['scenario_type'] === 'product') {
            $hasAccess = true;
        } elseif (!$hasAccess) {
            $grantedScenario = $db->fetch(
                'SELECT id FROM client_scenarios WHERE client_id = ? AND scenario_id = ?',
                [$userId, $scenario['id']]
            );

            if ($grantedScenario) {
                $hasAccess = true;
            }
        }

        if (!$hasAccess) {
            Logger::log('playground', $method, 'get_media', $userId, ['email' => $email, 'uniqid' => $uniqid, 'filename' => $filename], ['error' => 'Access denied'], 403, 'playground');
            jsonResponse(['error' => 'Access denied to this scenario media'], 403);
        }

        $mediaPath = __DIR__ . '/../../media/' . $uniqid . '/' . $filename;

        if (!file_exists($mediaPath)) {
            Logger::log('playground', $method, 'get_media', $userId, ['uniqid' => $uniqid, 'filename' => $filename], ['error' => 'File not found'], 404, 'playground');
            jsonResponse(['error' => 'Media file not found'], 404);
        }

        $mimeType = mime_content_type($mediaPath);
        header('Content-Type: ' . $mimeType);
        header('Content-Length: ' . filesize($mediaPath));
        header('Content-Disposition: inline; filename="' . basename($filename) . '"');

        Logger::log('playground', $method, 'get_media', $userId, ['email' => $email, 'uniqid' => $uniqid, 'filename' => $filename, 'user_type' => $user['type']], ['success' => true], 200, 'playground');

        readfile($mediaPath);
        exit;

    case 'get_available_scenario_data':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_available_scenario_data', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;
        $uniqid = $_GET['uniqid'] ?? null;

        if (!$email || !$uniqid) {
            Logger::log('playground', $method, 'get_available_scenario_data', null, $_GET, ['error' => 'Missing parameters'], 400, 'playground');
            jsonResponse(['error' => 'email and uniqid are required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_available_scenario_data', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $isAdmin = $user['type'] === 'admin';
        $userId = $user['data']['id'];
        $scenario = $db->fetch('SELECT * FROM scenarios WHERE uniqid = ?', [$uniqid]);

        if (!$scenario) {
            Logger::log('playground', $method, 'get_available_scenario_data', $userId, ['uniqid' => $uniqid], ['error' => 'Scenario not found'], 404, 'playground');
            jsonResponse(['error' => 'Scenario not found'], 404);
        }

        $hasAccess = $isAdmin;

        if (!$hasAccess && $scenario['client_id'] == $userId) {
            $hasAccess = true;
        } elseif (!$hasAccess && ($user['data']['license_type'] ?? '') === 'premium' && $scenario['scenario_type'] === 'product') {
            $hasAccess = true;
        } elseif (!$hasAccess) {
            $grantedScenario = $db->fetch(
                'SELECT id FROM client_scenarios WHERE client_id = ? AND scenario_id = ?',
                [$userId, $scenario['id']]
            );

            if ($grantedScenario) {
                $hasAccess = true;
            }
        }

        if (!$hasAccess) {
            Logger::log('playground', $method, 'get_available_scenario_data', $userId, ['email' => $email, 'uniqid' => $uniqid], ['error' => 'Access denied'], 403, 'playground');
            jsonResponse(['error' => 'Access denied to this scenario'], 403);
        }

        $medias = null;
        if (!empty($scenario['medias'])) {
            $medias = json_decode($scenario['medias'], true);
        }

        $responseData = [
            'scenario' => [
                'id' => $scenario['id'],
                'name' => $scenario['name'],
                'uniqid' => $scenario['uniqid'],
                'scenario_type' => $scenario['scenario_type'],
                'available_for_purchase' => true
            ],
            'medias' => $medias
        ];

        Logger::log('playground', $method, 'get_available_scenario_data', $userId, ['email' => $email, 'uniqid' => $uniqid, 'user_type' => $user['type']], ['success' => true], 200, 'playground');
        jsonResponse($responseData);
        break;

    case 'get_billing_status':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_billing_status', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_billing_status', null, [], ['error' => 'Missing email'], 400, 'playground');
            jsonResponse(['error' => 'email is required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_billing_status', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $isAdmin = $user['type'] === 'admin';
        $userId = $user['data']['id'];

        if ($isAdmin) {
            $responseData = ['billing_up_to_date' => true, 'license_type' => 'admin'];
        } else {
            $client = $db->fetch(
                'SELECT id, email, billing_up_to_date, license_type FROM clients WHERE id = ?',
                [$userId]
            );
            $responseData = [
                'billing_up_to_date' => (bool)$client['billing_up_to_date'],
                'license_type' => $client['license_type']
            ];
        }

        Logger::log('playground', $method, 'get_billing_status', $userId, ['email' => $email, 'user_type' => $user['type']], $responseData, 200, 'playground');
        jsonResponse($responseData);
        break;

    case 'get_cards_version':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_cards_version', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_cards_version', null, [], ['error' => 'Missing email'], 400, 'playground');
            jsonResponse(['error' => 'email is required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_cards_version', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $userId = $user['data']['id'];

        $metadata = $db->fetch(
            'SELECT version, updated_at FROM client_cards_metadata WHERE client_id = ? ORDER BY version DESC LIMIT 1',
            [$userId]
        );

        $responseData = [
            'version' => $metadata ? (int)$metadata['version'] : null,
            'updated_at' => $metadata ? $metadata['updated_at'] : null
        ];

        Logger::log('playground', $method, 'get_cards_version', $userId, ['email' => $email, 'user_type' => $user['type']], $responseData, 200, 'playground');
        jsonResponse($responseData);
        break;

    case 'get_patterns':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_patterns', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_patterns', null, [], ['error' => 'Missing email'], 400, 'playground');
            jsonResponse(['error' => 'email is required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_patterns', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $isAdmin = $user['type'] === 'admin';
        $userId = $user['data']['id'];

        if ($isAdmin) {
            $patterns = $db->fetchAll(
                'SELECT id, name, game_type, version, is_default, owner_type, pattern_uniqid, pattern_slug, description, created_at
                 FROM patterns ORDER BY game_type, is_default DESC, name'
            );
        } else {
            $patterns = $db->fetchAll(
                'SELECT id, name, game_type, version, is_default, owner_type, pattern_uniqid, pattern_slug, description, created_at
                 FROM patterns
                 WHERE is_default = TRUE OR (owner_type = ? AND owner_id = ?)
                 ORDER BY game_type, is_default DESC, name',
                ['client', $userId]
            );
        }

        $responseData = [
            'patterns' => $patterns,
            'count' => count($patterns)
        ];

        Logger::log('playground', $method, 'get_patterns', $userId, ['email' => $email, 'user_type' => $user['type']], ['count' => count($patterns)], 200, 'playground');
        jsonResponse($responseData);
        break;

    case 'get_layouts':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_layouts', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_layouts', null, [], ['error' => 'Missing email'], 400, 'playground');
            jsonResponse(['error' => 'email is required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_layouts', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $userId = $user['data']['id'];

        $layouts = $db->fetchAll(
            'SELECT id, game_type, status, version, owner_type, layout_uniqid, scenario_uniqid, created_at
             FROM layouts
             WHERE owner_type = ? AND status = ?
             ORDER BY game_type, version DESC',
            ['admin', 'active']
        );

        $responseData = [
            'layouts' => $layouts,
            'count' => count($layouts)
        ];

        Logger::log('playground', $method, 'get_layouts', $userId, ['email' => $email, 'user_type' => $user['type']], ['count' => count($layouts)], 200, 'playground');
        jsonResponse($responseData);
        break;

    case 'get_cards':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_cards', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_cards', null, [], ['error' => 'Missing email'], 400, 'playground');
            jsonResponse(['error' => 'email is required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_cards', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $userId = $user['data']['id'];

        $metadata = $db->fetch(
            'SELECT version FROM client_cards_metadata WHERE client_id = ? ORDER BY version DESC LIMIT 1',
            [$userId]
        );

        if (!$metadata) {
            $responseData = ['cards' => [], 'version' => null];
            Logger::log('playground', $method, 'get_cards', $userId, ['email' => $email, 'user_type' => $user['type']], $responseData, 200, 'playground');
            jsonResponse($responseData);
            break;
        }

        $version = $metadata['version'];
        $cardsFile = __DIR__ . '/../../cards/' . $userId . '/cards_v' . $version . '.csv';

        if (!file_exists($cardsFile)) {
            Logger::log('playground', $method, 'get_cards', $userId, ['email' => $email], ['error' => 'Cards file not found', 'version' => $version], 404, 'playground');
            jsonResponse(['error' => 'Cards file not found'], 404);
        }

        $cards = [];
        $handle = fopen($cardsFile, 'r');

        if ($handle !== false) {
            $headers = fgetcsv($handle);

            while (($row = fgetcsv($handle)) !== false) {
                if (count($row) >= count($headers)) {
                    $cards[] = array_combine($headers, array_slice($row, 0, count($headers)));
                }
            }

            fclose($handle);
        }

        $responseData = [
            'cards' => $cards,
            'version' => (int)$version,
            'count' => count($cards)
        ];

        Logger::log('playground', $method, 'get_cards', $userId, ['email' => $email, 'user_type' => $user['type']], ['version' => $version, 'count' => count($cards)], 200, 'playground');
        jsonResponse($responseData);
        break;

    case 'get_on_demand_cards':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_on_demand_cards', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_on_demand_cards', null, [], ['error' => 'Missing email'], 400, 'playground');
            jsonResponse(['error' => 'email is required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_on_demand_cards', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $userId = $user['data']['id'];

        $cards = $db->fetchAll(
            'SELECT coc.id, coc.pool_card_id, coc.end_date, coc.assigned_at,
                    p.key_name, p.color, p.key_number, p.card_id
             FROM client_on_demand_cards coc
             JOIN on_demand_cards_pool p ON coc.pool_card_id = p.id
             WHERE coc.client_id = ?
               AND (coc.end_date IS NULL OR coc.end_date >= CURDATE())
             ORDER BY p.key_number ASC, p.key_name ASC',
            [$userId]
        );

        $responseData = [
            'cards' => $cards,
            'count' => count($cards)
        ];

        Logger::log('playground', $method, 'get_on_demand_cards', $userId, ['email' => $email, 'user_type' => $user['type']], ['count' => count($cards)], 200, 'playground');
        jsonResponse($responseData);
        break;

    default:
        Logger::log('playground', $method, $action ?: 'none', null, [], ['error' => 'Invalid action'], 400, 'playground');
        jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    $errorDetails = [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ];

    try {
        Logger::log('playground', $_SERVER['REQUEST_METHOD'], $_GET['action'] ?? 'unknown', null, $_GET, $errorDetails, 500, 'playground');
    } catch (Exception $logError) {
        error_log("Failed to log error: " . $logError->getMessage());
    }

    jsonResponse([
        'error' => 'Internal server error',
        'message' => $e->getMessage(),
        'details' => $errorDetails
    ], 500);
}
