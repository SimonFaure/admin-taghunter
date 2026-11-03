<?php
// Licensee Mystery scoring defaults (add_client_mystery_scoring.sql, utils/MysteryScoring.php).
//   GET  ?action=get  [&client_id=N admin]  -> { data: { scoring, scenarios[] } }
//   POST ?action=save { scoring, client_id? } -> { ok, scoring }
// A licensee always acts on itself (any client_id it sends is ignored); an admin
// must name the licensee - the same editor is embedded in the admin licensee page.
// The playground receives the blob in the get_user_data_update manifest.

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ScenarioLanguages.php';
require_once __DIR__ . '/../utils/AudienceCompat.php';
require_once __DIR__ . '/../utils/MysteryScoring.php';

setCorsHeaders();
header('Content-Type: application/json');
header('Cache-Control: no-store');

function msJson($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

// [clientId] the call acts on. Client token -> itself; admin token -> client_id param.
function msClientScope($db, $clientIdParam) {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    $auth = $token ? TokenManager::validateToken($db, $token) : null;
    if (!$auth) msJson(['error' => 'unauthorized'], 401);
    $type = $auth['user_type'] ?? '';
    if ($type === 'client') return (int) $auth['user_id'];
    if ($type !== 'admin') msJson(['error' => 'unauthorized'], 401);
    $id = (int) $clientIdParam;
    if ($id <= 0) msJson(['error' => 'missing_params', 'reason' => 'client_id required'], 400);
    return $id;
}

// The Mystery scenarios this licensee plays - mirrors what get_user_data_update
// ships to its playgrounds (own published + premium-all / granted products,
// products filtered to the licensee's language).
function msScenarios($db, array $client) {
    $clientId = (int) $client['id'];
    $own = $db->fetchAll(
        'SELECT uniqid, title, data, "custom" AS origin FROM scenarios
          WHERE client_id = ? AND status = "published" AND game_type = "mystery"
          ORDER BY title ASC',
        [$clientId]
    );
    if (($client['license_type'] ?? '') === 'premium') {
        $products = $db->fetchAll(
            'SELECT uniqid, title, data, scenario_type, client_id, validated_languages FROM scenarios
              WHERE scenario_type = "product" AND status = "published" AND game_type = "mystery"
              ORDER BY title ASC'
        );
        $products = ScenarioLanguages::filterProducts(
            $products,
            ScenarioLanguages::clientLanguage($db, $clientId),
            $db,
            $clientId
        );
    } else {
        $products = $db->fetchAll(
            'SELECT DISTINCT s.uniqid, s.title, s.data FROM scenarios s
               JOIN client_scenarios cs ON cs.scenario_id = s.id AND cs.client_id = ?
              WHERE s.scenario_type = "product" AND s.status = "published" AND s.game_type = "mystery"
              ORDER BY s.title ASC',
            [$clientId]
        );
    }

    $out = [];
    $seen = [];
    foreach ([[$own, false], [$products, true]] as [$rows, $isProduct]) {
        foreach ($rows as $r) {
            if (isset($seen[$r['uniqid']])) continue;
            $seen[$r['uniqid']] = true;
            $data = $r['data'] ? json_decode($r['data'], true) : [];
            $gm = is_array($data['game_meta'] ?? null) ? $data['game_meta'] : [];
            $bands = AudienceCompat::normalizeBands($gm['audience_bands'] ?? null);
            if (!$bands) $bands = AudienceCompat::bandsFromTier($gm['game_public'] ?? '');
            $out[] = [
                'uniqid' => $r['uniqid'],
                'title' => $r['title'],
                'is_product' => $isProduct,
                'bands' => $bands,
                // The age default that applies to it in the playground.
                'age_band' => $bands[0] ?? null,
            ];
        }
    }
    usort($out, fn($a, $b) => strcasecmp((string) $a['title'], (string) $b['title']));
    return $out;
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($action === 'get') {
        if ($method !== 'GET') msJson(['error' => 'method_not_allowed'], 405);
        $clientId = msClientScope($db, $_GET['client_id'] ?? null);
        $client = $db->fetch('SELECT id, license_type FROM clients WHERE id = ?', [$clientId]);
        if (!$client) msJson(['error' => 'unknown_client'], 404);
        $scoring = MysteryScoring::load($db, $clientId);
        if ($scoring === null) msJson(['error' => 'not_migrated'], 503);
        msJson(['data' => [
            'scoring' => MysteryScoring::forJson($scoring),
            'scenarios' => msScenarios($db, $client),
        ]]);
    }

    if ($action === 'save') {
        if ($method !== 'POST') msJson(['error' => 'method_not_allowed'], 405);
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $clientId = msClientScope($db, $body['client_id'] ?? null);
        $client = $db->fetch('SELECT id, license_type FROM clients WHERE id = ?', [$clientId]);
        if (!$client) msJson(['error' => 'unknown_client'], 404);
        // Rows for scenarios the licensee plays, plus rows already stored (a
        // scenario briefly unpublished must not lose its values on the next save).
        $existing = MysteryScoring::load($db, $clientId);
        if ($existing === null) msJson(['error' => 'not_migrated'], 503);
        $allowed = array_merge(
            array_column(msScenarios($db, $client), 'uniqid'),
            array_map('strval', array_keys($existing['by_scenario']))
        );
        $norm = MysteryScoring::normalize($body['scoring'] ?? null, $allowed);
        $json = MysteryScoring::forJson($norm);
        $empty = !$norm['by_age'] && !$norm['by_scenario'];
        $db->execute(
            'UPDATE clients SET mystery_scoring = ? WHERE id = ?',
            [$empty ? null : json_encode($json), $clientId]
        );
        msJson(['ok' => true, 'scoring' => $json]);
    }

    msJson(['error' => 'unknown_action'], 400);
} catch (Exception $e) {
    error_log('mystery_scoring.php: ' . $e->getMessage());
    msJson(['error' => 'server_error'], 500);
}
