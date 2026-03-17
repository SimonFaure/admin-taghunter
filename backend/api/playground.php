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

    case 'get_user_data_update':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_user_data_update', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_user_data_update', null, [], ['error' => 'Missing email'], 400, 'playground');
            jsonResponse(['error' => 'email is required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'get_user_data_update', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $isAdmin = $user['type'] === 'admin';
        $userId = $user['data']['id'];

        if ($isAdmin) {
            $customScenarios = $db->fetchAll(
                'SELECT title, uniqid, version FROM scenarios WHERE status = "published" ORDER BY created_at DESC'
            );
        } else {
            $customScenarios = $db->fetchAll(
                'SELECT title, uniqid, version FROM scenarios WHERE client_id = ? AND status = "published" ORDER BY created_at DESC',
                [$userId]
            );
        }

        $productScenarios = $db->fetchAll(
            'SELECT title, uniqid, version FROM scenarios WHERE scenario_type = "product" AND status = "published" ORDER BY created_at DESC'
        );

        if ($isAdmin) {
            $defaultPatterns = $db->fetchAll(
                'SELECT name, game_type, version, pattern_uniqid FROM patterns WHERE is_default = TRUE ORDER BY game_type, name'
            );
            $customPatterns = $db->fetchAll(
                'SELECT name, game_type, version, pattern_uniqid FROM patterns WHERE is_default = FALSE ORDER BY game_type, name'
            );
        } else {
            $defaultPatterns = $db->fetchAll(
                'SELECT name, game_type, version, pattern_uniqid FROM patterns WHERE is_default = TRUE ORDER BY game_type, name'
            );
            $customPatterns = $db->fetchAll(
                'SELECT name, game_type, version, pattern_uniqid FROM patterns WHERE is_default = FALSE AND owner_type = ? AND owner_id = ? ORDER BY game_type, name',
                ['client', $userId]
            );
        }

        $cardsMetadata = $db->fetch(
            'SELECT version FROM client_cards_metadata WHERE client_id = ? ORDER BY version DESC LIMIT 1',
            [$userId]
        );

        $hasOnDemandCards = false;
        $onDemandCount = $db->fetch(
            'SELECT COUNT(*) as cnt FROM client_on_demand_cards WHERE client_id = ? AND (end_date IS NULL OR end_date >= CURDATE())',
            [$userId]
        );
        if ($onDemandCount && (int)$onDemandCount['cnt'] > 0) {
            $hasOnDemandCards = true;
        }

        $layouts = $db->fetchAll(
            'SELECT id, version, game_type FROM layouts WHERE owner_type = "admin" AND status = "active" ORDER BY game_type, version DESC'
        );

        if ($isAdmin) {
            $billingUpToDate = true;
            $licenseType = 'admin';
        } else {
            $clientBilling = $db->fetch(
                'SELECT billing_up_to_date, license_type FROM clients WHERE id = ?',
                [$userId]
            );
            $billingUpToDate = (bool)($clientBilling['billing_up_to_date'] ?? false);
            $licenseType = $clientBilling['license_type'] ?? null;
        }

        $responseData = [
            'custom_scenarios' => $customScenarios,
            'product_scenarios' => $productScenarios,
            'default_patterns' => $defaultPatterns,
            'custom_patterns' => $customPatterns,
            'cards_version' => $cardsMetadata ? (int)$cardsMetadata['version'] : null,
            'has_on_demand_cards' => $hasOnDemandCards,
            'layouts' => $layouts,
            'billing_up_to_date' => $billingUpToDate,
            'license_type' => $licenseType
        ];

        Logger::log('playground', $method, 'get_user_data_update', $userId, ['email' => $email, 'user_type' => $user['type']], [
            'custom_scenarios_count' => count($customScenarios),
            'product_scenarios_count' => count($productScenarios),
            'default_patterns_count' => count($defaultPatterns),
            'custom_patterns_count' => count($customPatterns),
            'cards_version' => $cardsMetadata ? (int)$cardsMetadata['version'] : null,
            'has_on_demand_cards' => $hasOnDemandCards,
            'layouts_count' => count($layouts),
            'billing_up_to_date' => $billingUpToDate,
            'license_type' => $licenseType
        ], 200, 'playground');
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

    case 'download_pattern':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'download_pattern', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;
        $patternUniqid = $_GET['pattern_uniqid'] ?? null;

        if (!$email || !$patternUniqid) {
            Logger::log('playground', $method, 'download_pattern', null, $_GET, ['error' => 'Missing parameters'], 400, 'playground');
            jsonResponse(['error' => 'email and pattern_uniqid are required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'download_pattern', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $isAdmin = $user['type'] === 'admin';
        $userId = $user['data']['id'];

        $pattern = $db->fetch(
            'SELECT id, name, game_type, version, pattern_data, is_default, owner_type, owner_id, pattern_uniqid, pattern_slug, description
             FROM patterns WHERE pattern_uniqid = ?',
            [$patternUniqid]
        );

        if (!$pattern) {
            Logger::log('playground', $method, 'download_pattern', $userId, ['pattern_uniqid' => $patternUniqid], ['error' => 'Pattern not found'], 404, 'playground');
            jsonResponse(['error' => 'Pattern not found'], 404);
        }

        $hasAccess = $isAdmin || (bool)$pattern['is_default'];

        if (!$hasAccess && $pattern['owner_type'] === 'client' && (int)$pattern['owner_id'] === (int)$userId) {
            $hasAccess = true;
        }

        if (!$hasAccess) {
            Logger::log('playground', $method, 'download_pattern', $userId, ['pattern_uniqid' => $patternUniqid], ['error' => 'Access denied'], 403, 'playground');
            jsonResponse(['error' => 'Access denied to this pattern'], 403);
        }

        $patternData = !empty($pattern['pattern_data']) ? json_decode($pattern['pattern_data'], true) : null;

        $responseData = [
            'name' => $pattern['name'],
            'game_type' => $pattern['game_type'],
            'version' => $pattern['version'],
            'pattern_uniqid' => $pattern['pattern_uniqid'],
            'pattern_slug' => $pattern['pattern_slug'],
            'description' => $pattern['description'],
            'is_default' => (bool)$pattern['is_default'],
            'pattern_data' => $patternData
        ];

        Logger::log('playground', $method, 'download_pattern', $userId, ['email' => $email, 'pattern_uniqid' => $patternUniqid, 'user_type' => $user['type']], ['success' => true], 200, 'playground');
        jsonResponse($responseData);
        break;

    case 'download_cards':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'download_cards', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;
        $cardsVersion = $_GET['version'] ?? null;

        if (!$email || $cardsVersion === null) {
            Logger::log('playground', $method, 'download_cards', null, $_GET, ['error' => 'Missing parameters'], 400, 'playground');
            jsonResponse(['error' => 'email and version are required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'download_cards', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $userId = $user['data']['id'];
        $cardsVersion = (int)$cardsVersion;

        $metadata = $db->fetch(
            'SELECT version FROM client_cards_metadata WHERE client_id = ? AND version = ?',
            [$userId, $cardsVersion]
        );

        if (!$metadata) {
            Logger::log('playground', $method, 'download_cards', $userId, ['email' => $email, 'version' => $cardsVersion], ['error' => 'Cards version not found'], 404, 'playground');
            jsonResponse(['error' => 'Cards version not found for this user'], 404);
        }

        $cardsFile = __DIR__ . '/../../cards/' . $userId . '/cards_v' . $cardsVersion . '.csv';

        if (!file_exists($cardsFile)) {
            Logger::log('playground', $method, 'download_cards', $userId, ['email' => $email, 'version' => $cardsVersion], ['error' => 'Cards file not found on filesystem'], 404, 'playground');
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
            'version' => $cardsVersion,
            'count' => count($cards),
            'cards' => $cards
        ];

        Logger::log('playground', $method, 'download_cards', $userId, ['email' => $email, 'version' => $cardsVersion, 'user_type' => $user['type']], ['version' => $cardsVersion, 'count' => count($cards)], 200, 'playground');
        jsonResponse($responseData);
        break;

    case 'download_layout':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'download_layout', null, [], ['error' => 'Method not allowed'], 405, 'playground');
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;
        $layoutId = $_GET['layout_id'] ?? null;

        if (!$email || !$layoutId) {
            Logger::log('playground', $method, 'download_layout', null, $_GET, ['error' => 'Missing parameters'], 400, 'playground');
            jsonResponse(['error' => 'email and layout_id are required'], 400);
        }

        $user = resolveUser($db, $email);

        if (!$user) {
            Logger::log('playground', $method, 'download_layout', null, ['email' => $email], ['error' => 'User not found'], 404, 'playground');
            jsonResponse(['error' => 'User not found'], 404);
        }

        $userId = $user['data']['id'];
        $layoutId = (int)$layoutId;

        $layout = $db->fetch(
            'SELECT id, layout_data, game_type, version, status, owner_type, layout_uniqid, scenario_uniqid
             FROM layouts WHERE id = ? AND status = "active"',
            [$layoutId]
        );

        if (!$layout) {
            Logger::log('playground', $method, 'download_layout', $userId, ['layout_id' => $layoutId], ['error' => 'Layout not found'], 404, 'playground');
            jsonResponse(['error' => 'Layout not found or not active'], 404);
        }

        $layoutData = !empty($layout['layout_data']) ? json_decode($layout['layout_data'], true) : null;

        $layoutJson = [
            'id' => $layout['id'],
            'layout_uniqid' => $layout['layout_uniqid'],
            'game_type' => $layout['game_type'],
            'version' => $layout['version'],
            'scenario_uniqid' => $layout['scenario_uniqid'],
            'layout_data' => $layoutData
        ];

        Logger::log('playground', $method, 'download_layout', $userId, ['email' => $email, 'layout_id' => $layoutId, 'user_type' => $user['type']], ['success' => true, 'layout_id' => $layoutId], 200, 'playground');
        jsonResponse($layoutJson);
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
