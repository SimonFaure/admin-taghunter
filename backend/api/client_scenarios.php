<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

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

// `client_scenarios.durations` holds the GO/Spot challenge offer for that grant
// (JSON array of minutes, NULL = none configured → the scenario's authored time
// is used instead). Hand it to callers as a plain int array, never a raw JSON
// string. (project_go_spot_durations)
function decodeGrantDurations(array $grants) {
    foreach ($grants as &$g) {
        $d = !empty($g['durations']) ? json_decode($g['durations'], true) : [];
        $g['durations'] = is_array($d) ? array_values(array_map('intval', $d)) : [];
    }
    unset($g);
    return $grants;
}

function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
    return $_SESSION['user_id'];
}

/**
 * The scenarios a client holds in one player app ('go' | 'spot').
 *
 * Normally that is its mode='<app>' grant rows. A PREMIUM client has none: the
 * `list` action above serves it the whole product catalogue directly, without
 * grants. Reading only grants therefore left premium clients with an empty QR
 * grid - "aucun QR code n'a été généré" (retour Ludiom #65) - even though they
 * could see the GO/Spot scenarios in their catalogue. So for premium we return
 * every product scenario carrying the app's own eligibility flag
 * (`adaptable_go` / `adaptable_spot`), LEFT JOINing whatever grant row happens to
 * exist so a configured challenge list still comes through.
 *
 * go.php applies the same rule (goResolveGrant), so a QR built from this list
 * always loads instead of refusing `not_granted`.
 *
 * `$grantsOnly` opts out of the premium widening: the admin client page manages
 * grant ROWS (add / remove), so it must see exactly the rows that exist.
 */
function appScenariosForClient($db, $clientId, $app, $grantsOnly = false) {
    $isPremium = false;
    if (!$grantsOnly) {
        $client = $db->fetch('SELECT license_type FROM clients WHERE id = ?', [$clientId]);
        if ($client && ($client['license_type'] ?? '') === 'premium') $isPremium = true;
    }

    $patternCols = $app === 'go'
        ? ', p.name AS pattern_name, p.answer_count AS pattern_answer_count'
        : '';
    $patternJoin = $app === 'go' ? ' LEFT JOIN patterns p ON cs.pattern_id = p.id' : '';

    if (!$isPremium) {
        return decodeGrantDurations($db->fetchAll(
            'SELECT cs.scenario_id, cs.pattern_id, cs.granted_at, cs.durations,
                    s.title, s.uniqid, s.status, s.medias' . $patternCols . '
             FROM client_scenarios cs
             JOIN scenarios s ON cs.scenario_id = s.id' . $patternJoin . '
             WHERE cs.client_id = ? AND cs.mode = ?
             ORDER BY cs.granted_at DESC',
            [$clientId, $app]
        ));
    }

    $rows = $db->fetchAll(
        'SELECT s.id AS scenario_id, cs.pattern_id, s.created_at AS granted_at, cs.durations,
                s.title, s.uniqid, s.status, s.medias, s.data' . $patternCols . '
         FROM scenarios s
         LEFT JOIN client_scenarios cs
                ON cs.scenario_id = s.id AND cs.client_id = ? AND cs.mode = ?' . $patternJoin . '
         WHERE s.scenario_type = "product"
         ORDER BY s.created_at DESC',
        [$clientId, $app]
    );
    // The eligibility flag lives in game_meta, so filter in PHP (both the flat
    // and wrapped shapes exist on disk, as everywhere else that reads it).
    $flag = $app === 'spot' ? 'adaptable_spot' : 'adaptable_go';
    $out = [];
    foreach ($rows as $r) {
        $dataArr = !empty($r['data']) ? json_decode($r['data'], true) : null;
        $gm = is_array($dataArr) ? ($dataArr['game_meta'] ?? ($dataArr['data']['game_meta'] ?? null)) : null;
        if (!is_array($gm) || empty($gm[$flag])) continue;
        unset($r['data']);
        $out[] = $r;
    }
    return decodeGrantDurations($out);
}

function requireClientOrAdminAuth($db) {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';

    if (!empty($token)) {
        $tokenData = TokenManager::validateToken($db, $token);
        if ($tokenData) {
            $type = $tokenData['user_type'] === 'admin' ? 'admin' : 'client';
            return ['id' => $tokenData['user_id'], 'type' => $type];
        }
    }

    if (isset($_SESSION['user_id'])) {
        return ['id' => $_SESSION['user_id'], 'type' => 'admin'];
    }

    jsonResponse(['error' => 'Unauthorized'], 401);
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    switch ($action) {
    case 'add':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $response = ['error' => 'Method not allowed'];
            Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], 'add', $_SESSION['user_id'] ?? null, [], $response, 405);
            jsonResponse($response, 405);
        }

        $addAuth = requireClientOrAdminAuth($db);
        if ($addAuth['type'] !== 'admin') {
            $response = ['error' => 'Unauthorized'];
            jsonResponse($response, 403);
        }
        $userId = $addAuth['id'];
        $data = getRequestData();

        $clientId = $data['client_id'] ?? null;
        $scenarioId = $data['scenario_id'] ?? null;
        // A grant is scoped to a mode ('playground' | 'go' | 'spot'). A scenario
        // can be granted for several (one row each). pattern_id binds the client's
        // GO plaque set (the answer key); only meaningful for mode=go (Spot ignores
        // it - Spot shows answer images on-screen, project_taghunter_spot).
        $mode = in_array($data['mode'] ?? '', ['go', 'spot'], true) ? $data['mode'] : 'playground';
        $patternId = isset($data['pattern_id']) && is_numeric($data['pattern_id']) ? (int)$data['pattern_id'] : null;

        if (!$clientId || !$scenarioId) {
            $response = ['error' => 'client_id and scenario_id are required'];
            Logger::log('client_scenarios', 'POST', 'add', $userId, $data, $response, 400);
            jsonResponse($response, 400);
        }

        $clientExists = $db->fetch('SELECT id FROM clients WHERE id = ?', [$clientId]);
        if (!$clientExists) {
            $response = ['error' => 'Client not found'];
            Logger::log('client_scenarios', 'POST', 'add', $userId, $data, $response, 404);
            jsonResponse($response, 404);
        }

        $scenarioExists = $db->fetch('SELECT id FROM scenarios WHERE id = ? AND scenario_type = "product"', [$scenarioId]);
        if (!$scenarioExists) {
            $response = ['error' => 'Product scenario not found'];
            Logger::log('client_scenarios', 'POST', 'add', $userId, $data, $response, 404);
            jsonResponse($response, 404);
        }

        $exists = $db->fetch(
            'SELECT id FROM client_scenarios WHERE client_id = ? AND scenario_id = ? AND mode = ?',
            [$clientId, $scenarioId, $mode]
        );

        if ($exists) {
            // Already granted for this mode - treat a re-add as a pattern_id update
            // (lets the admin re-bind the GO plaque pattern without removing first).
            $db->execute(
                'UPDATE client_scenarios SET pattern_id = ? WHERE id = ?',
                [$patternId, $exists['id']]
            );
            $response = ['message' => 'Grant updated'];
            Logger::log('client_scenarios', 'POST', 'add', $userId, $data, $response, 200);
            jsonResponse($response);
        }

        $db->execute(
            'INSERT INTO client_scenarios (client_id, scenario_id, granted_by, mode, pattern_id) VALUES (?, ?, ?, ?, ?)',
            [$clientId, $scenarioId, $userId, $mode, $patternId]
        );

        $response = ['message' => 'Scenario added to client successfully'];
        Logger::log('client_scenarios', 'POST', 'add', $userId, $data, $response, 200);
        jsonResponse($response);
        break;

    case 'remove':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            $response = ['error' => 'Method not allowed'];
            Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], 'remove', $_SESSION['user_id'] ?? null, [], $response, 405);
            jsonResponse($response, 405);
        }

        $auth = requireClientOrAdminAuth($db);
        if ($auth['type'] !== 'admin') {
            $response = ['error' => 'Unauthorized'];
            jsonResponse($response, 403);
        }
        $userId = $auth['id'];
        $data = getRequestData();

        $clientId = $data['client_id'] ?? null;
        $scenarioId = $data['scenario_id'] ?? null;
        // Scope the removal to a mode so removing one grant leaves the others
        // (playground / go / spot) intact. Defaults to 'playground' for callers
        // that predate the GO/Spot modes.
        $mode = in_array($data['mode'] ?? '', ['go', 'spot'], true) ? $data['mode'] : 'playground';

        if (!$clientId || !$scenarioId) {
            $response = ['error' => 'client_id and scenario_id are required'];
            Logger::log('client_scenarios', 'POST', 'remove', $userId, $data, $response, 400);
            jsonResponse($response, 400);
        }

        $db->execute(
            'DELETE FROM client_scenarios WHERE client_id = ? AND scenario_id = ? AND mode = ?',
            [$clientId, $scenarioId, $mode]
        );

        $response = ['message' => 'Scenario removed from client successfully'];
        Logger::log('client_scenarios', 'POST', 'remove', $userId, $data, $response, 200);
        jsonResponse($response);
        break;

    case 'list':
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            $response = ['error' => 'Method not allowed'];
            Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], 'list', null, [], $response, 405);
            jsonResponse($response, 405);
        }

        $auth = requireClientOrAdminAuth($db);
        $clientId = $_GET['client_id'] ?? null;

        if ($auth['type'] === 'client') {
            $clientId = $auth['id'];
        }

        if (!$clientId) {
            $response = ['error' => 'client_id is required'];
            Logger::log('client_scenarios', 'GET', 'list', $auth['id'], [], $response, 400);
            jsonResponse($response, 400);
        }

        if ($auth['type'] === 'client' && $clientId !== $auth['id']) {
            jsonResponse(['error' => 'Unauthorized'], 403);
        }

        $client = $db->fetch('SELECT license_type FROM clients WHERE id = ?', [$clientId]);
        $isPremium = $client && $client['license_type'] === 'premium';

        if ($isPremium) {
            $scenarios = $db->fetchAll(
                'SELECT s.id, s.title, s.description, s.uniqid, s.game_type, s.scenario_type, s.status,
                        IFNULL(s.version, "1.0") as version, s.medias, s.data, s.client_id, s.created_at, s.updated_at,
                        s.created_at as granted_at, NULL as granted_by, NULL as granted_by_email,
                        (SELECT COUNT(*) FROM scenario_files sf WHERE sf.scenario_id = s.id) as files_count
                 FROM scenarios s
                 WHERE s.scenario_type = "product"
                 ORDER BY s.created_at DESC'
            );
        } else {
            $scenarios = $db->fetchAll(
                // A scenario can be granted to a client in MORE THAN ONE mode
                // (e.g. both "playground" and "go"), which is several
                // client_scenarios rows. Collapse them to one row per scenario so
                // the client sees it once (one card, one QR), not once per mode.
                'SELECT s.id, s.title, s.description, s.uniqid, s.game_type, s.scenario_type, s.status,
                        IFNULL(s.version, "1.0") as version, s.medias, s.data, s.client_id, s.created_at, s.updated_at,
                        cs.granted_at, cs.granted_by, a.email as granted_by_email,
                        (SELECT COUNT(*) FROM scenario_files sf WHERE sf.scenario_id = s.id) as files_count
                 FROM (
                        SELECT scenario_id, MIN(granted_at) AS granted_at, MIN(granted_by) AS granted_by
                        FROM client_scenarios WHERE client_id = ?
                        GROUP BY scenario_id
                      ) cs
                 JOIN scenarios s ON cs.scenario_id = s.id
                 LEFT JOIN admin_users a ON cs.granted_by = a.id
                 UNION ALL
                 SELECT s.id, s.title, s.description, s.uniqid, s.game_type, s.scenario_type, s.status,
                        IFNULL(s.version, "1.0") as version, s.medias, s.data, s.client_id, s.created_at, s.updated_at,
                        s.created_at as granted_at, s.created_by as granted_by, NULL as granted_by_email,
                        (SELECT COUNT(*) FROM scenario_files sf WHERE sf.scenario_id = s.id) as files_count
                 FROM scenarios s
                 WHERE s.client_id = ?
                   AND s.scenario_type != "product"
                   AND s.id NOT IN (
                       SELECT scenario_id FROM client_scenarios WHERE client_id = ?
                   )
                 ORDER BY granted_at DESC',
                [$clientId, $clientId, $clientId]
            );
        }

        // Cascade: a client never sees scenarios of a game type disabled for them
        // (globally or per-client). Admin inspection of a client's list is unfiltered.
        if ($auth['type'] === 'client') {
            require_once __DIR__ . '/../utils/GameTypes.php';
            $disabledTypes = GameTypes::disabledForClient($db->getConnection(), $clientId);
            if ($disabledTypes) {
                $scenarios = array_values(array_filter($scenarios, function($s) use ($disabledTypes) {
                    return !in_array($s['game_type'] ?? '', $disabledTypes, true);
                }));
            }
        }

        $scenarios = array_map(function($s) {
            $s['has_zip_files'] = (int)($s['files_count'] ?? 0) > 0;
            $s['files_count'] = (int)($s['files_count'] ?? 0);
            // Surface difficulty / audience (game_meta) for the list cards, then
            // drop the heavy data blob so the payload stays lean. Tolerate both
            // the flat (`game_meta.…`) and wrapped (`data.game_meta.…`) shapes.
            $dataArr = !empty($s['data']) ? json_decode($s['data'], true) : null;
            $gm = is_array($dataArr) ? ($dataArr['game_meta'] ?? ($dataArr['data']['game_meta'] ?? null)) : null;
            $s['difficulty'] = (is_array($gm) && isset($gm['difficulty'])) ? $gm['difficulty'] : null;
            $s['audience'] = (is_array($gm) && isset($gm['game_public'])) ? $gm['game_public'] : null;
            // Age bands (the fine-grained taxonomy the admin catalog uses) and the
            // univers tags, so the client list can filter on the same criteria as
            // admin instead of the coarse mini_kids/kids/ado_adultes trio.
            $s['audience_bands'] = (is_array($gm) && is_array($gm['audience_bands'] ?? null))
                ? array_values($gm['audience_bands'])
                : [];
            $s['univers'] = (is_array($gm) && is_array($gm['univers'] ?? null))
                ? array_values(array_filter($gm['univers'], 'is_string'))
                : [];
            // Languages the scenario is authored in, for the list card chips.
            $langRoot = is_array($dataArr)
                ? ((isset($dataArr['available_languages']) || isset($dataArr['default_language']))
                    ? $dataArr
                    : ($dataArr['data'] ?? $dataArr))
                : null;
            $s['available_languages'] = (is_array($langRoot) && is_array($langRoot['available_languages'] ?? null))
                ? array_values(array_filter($langRoot['available_languages'], 'is_string'))
                : [];
            $s['default_language'] = (is_array($langRoot) && is_string($langRoot['default_language'] ?? null))
                ? $langRoot['default_language']
                : null;
            // Tag Hunter GO: surface whether this scenario exists in GO mode, for
            // the list "GO" badge + filter.
            $s['adaptable_go'] = (is_array($gm) && !empty($gm['adaptable_go']));
            $s['go_answer_count'] = (is_array($gm) && isset($gm['go_answer_count'])) ? (int)$gm['go_answer_count'] : null;
            // Tag Hunter Spot: surface whether this scenario is Spot-capable, for
            // the list "Spot" badge + filter.
            $s['adaptable_spot'] = (is_array($gm) && !empty($gm['adaptable_spot']));
            unset($s['data']);
            return $s;
        }, $scenarios);

        $response = ['data' => $scenarios];
        Logger::log('client_scenarios', 'GET', 'list', $auth['id'], ['client_id' => $clientId], $response, 200);
        jsonResponse($response);
        break;

    case 'list_go':
        // Tag Hunter GO: the GO grants for a client (mode='go'), with the bound
        // GO pattern + the scenario's challenge offer (cs.durations). This is
        // exactly the set go.php will serve in GO, which is why the client QR
        // grid reads it rather than the generic `list` action - that one returns
        // every product scenario for PREMIUM clients regardless of grants, so its
        // QR codes could refuse with `not_granted` when scanned.
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $auth = requireClientOrAdminAuth($db);
        $clientId = $auth['type'] === 'client' ? $auth['id'] : ($_GET['client_id'] ?? null);
        if (!$clientId) {
            jsonResponse(['error' => 'client_id is required'], 400);
        }
        if ($auth['type'] === 'client' && (string)$clientId !== (string)$auth['id']) {
            jsonResponse(['error' => 'Unauthorized'], 403);
        }
        $grants = appScenariosForClient($db, $clientId, 'go', !empty($_GET['grants_only']));
        $response = ['data' => $grants];
        Logger::log('client_scenarios', 'GET', 'list_go', $auth['id'], ['client_id' => $clientId], ['count' => count($grants)], 200);
        jsonResponse($response);
        break;

    case 'list_spot':
        // Tag Hunter Spot: the Spot grants for a client (mode='spot'). No bound
        // pattern - Spot shows answer images on-screen and shuffles them, so
        // correctness is the good_answer_image (project_taghunter_spot). Used by
        // the admin client page to manage Spot scenario access.
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $auth = requireClientOrAdminAuth($db);
        $clientId = $auth['type'] === 'client' ? $auth['id'] : ($_GET['client_id'] ?? null);
        if (!$clientId) {
            jsonResponse(['error' => 'client_id is required'], 400);
        }
        if ($auth['type'] === 'client' && (string)$clientId !== (string)$auth['id']) {
            jsonResponse(['error' => 'Unauthorized'], 403);
        }
        $grants = appScenariosForClient($db, $clientId, 'spot', !empty($_GET['grants_only']));
        $response = ['data' => $grants];
        Logger::log('client_scenarios', 'GET', 'list_spot', $auth['id'], ['client_id' => $clientId], ['count' => count($grants)], 200);
        jsonResponse($response);
        break;

    default:
        $response = ['error' => 'Invalid action'];
        Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], $action, $_SESSION['user_id'] ?? null, [], $response, 400);
        jsonResponse($response, 400);
    }
} catch (Exception $e) {
    $response = ['error' => 'Server error: ' . $e->getMessage()];
    Logger::log('client_scenarios', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], $response, 500);
    jsonResponse($response, 500);
}
