<?php
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/PlaygroundAuth.php';
require_once __DIR__ . '/../utils/LocalizedCompat.php';

SecurityHeaders::setHeaders();
setCorsHeaders();

header('Content-Type: application/json');

try {
    $db = Database::getInstance();
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    switch ($action) {
    case 'test':
        // Unauthenticated health check.
        Logger::log('playground', $method, 'test', null, [], ['status' => 'ok'], 200, 'playground');
        jsonResponse([
            'status' => 'ok',
            'timestamp' => time(),
            'database' => 'connected'
        ]);
        break;

    case 'auth_state':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        Logger::log('playground', $method, 'auth_state', $client['id'], [], ['success' => true], 200, 'playground');
        jsonResponseWithAuthState($db, $client['id'], ['success' => true]);
        break;

    case 'get_user_scenarios':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        $licenseType = $client['license_type'] ?? '';

        if ($licenseType === 'premium') {
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

        Logger::log('playground', $method, 'get_user_scenarios', $userId, [], ['count' => count($scenarios)], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, [
            'client' => [
                'id' => $userId,
                'email' => $client['email'],
                'license_type' => $licenseType,
            ],
            'scenarios' => $scenarios,
        ]);
        break;

    case 'get_available_scenarios':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        if (($client['license_type'] ?? '') === 'premium') {
            Logger::log('playground', $method, 'get_available_scenarios', $userId, [], ['scenarios' => []], 200, 'playground');
            jsonResponseWithAuthState($db, $userId, ['scenarios' => []]);
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

        Logger::log('playground', $method, 'get_available_scenarios', $userId, [], ['count' => count($availableScenarios)], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, ['scenarios' => $availableScenarios]);
        break;

    case 'get_scenario_game_data':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        $uniqid = $_GET['uniqid'] ?? null;

        if (!$uniqid) {
            jsonResponse(['error' => 'uniqid is required'], 400);
        }

        $scenario = $db->fetch('SELECT * FROM scenarios WHERE uniqid = ?', [$uniqid]);

        if (!$scenario) {
            Logger::log('playground', $method, 'get_scenario_game_data', $userId, ['uniqid' => $uniqid], ['error' => 'Scenario not found'], 404, 'playground');
            jsonResponse(['error' => 'Scenario not found'], 404);
        }

        if (!playgroundClientCanAccessScenario($db, $client, $scenario)) {
            Logger::log('playground', $method, 'get_scenario_game_data', $userId, ['uniqid' => $uniqid], ['error' => 'Access denied'], 403, 'playground');
            jsonResponse(['error' => 'Access denied to this scenario'], 403);
        }

        $gameData = !empty($scenario['data']) ? json_decode($scenario['data'], true) : null;

        // Stage 3 (D5) compat layer: studio writes the new shape (per-field
        // `Localized<string>` maps inline in `game_meta`); the Tauri 2
        // playground still reads the legacy `translations[lang] = {full
        // copy}` envelope. Transform on the way out so the playground sees
        // zero change. Idempotent (legacy data passes through).
        if (is_array($gameData)) {
            $gameData = LocalizedCompat::toLegacyShape($gameData);
        }

        // Image+sound filenames moved from `data.game_meta` into the
        // structured `scenarios.medias` column (scenarios refactor). The
        // playground still wants the legacy `game_media_images` / `game_sounds`
        // field→filename maps next to game_meta, so splice them back in here.
        $structuredMedias = !empty($scenario['medias']) ? json_decode($scenario['medias'], true) : null;
        if (is_array($gameData)) {
            $mediaImages = is_array($structuredMedias['images'] ?? null) ? $structuredMedias['images'] : [];
            $mediaSounds = is_array($structuredMedias['sounds'] ?? null) ? $structuredMedias['sounds'] : [];
            // Mystery's level-gauge images live in `medias.levels` (a legacy
            // overload of the name — these are images, not gameplay levels;
            // see studio mystery/mediaSlots.ts). `cleanGameMetaForData` strips
            // them out of game_meta on save, so they only survive here.
            $mediaLevels = is_array($structuredMedias['levels'] ?? null) ? $structuredMedias['levels'] : [];

            // Sibling field→filename maps — the scenario list view + test
            // modals read `game_media_images` / `game_sounds` directly. The
            // gauge images are image fields too, so fold them into the same map.
            $allImages = array_merge($mediaImages, $mediaLevels);
            $gameData['game_media_images'] = $allImages ?: new stdClass();
            $gameData['game_sounds'] = $mediaSounds ?: new stdClass();

            // Pre-refactor, top-level image filenames (`background_image`,
            // `malus_image`, `custom_template`, …) lived INSIDE `game_meta`.
            // The playground's tagquest renderer still resolves sentinel
            // filenames (`@background`, `@malus_image`, `@template`) against
            // `game_meta`, and the mystery renderer reads `levels_gauge_image`
            // / `levels_gauge_player_icon_image` / … from game_meta — so splice
            // both the medias-column images AND the gauge images back in.
            if (is_array($gameData['game_meta'] ?? null)) {
                foreach ($allImages as $field => $filename) {
                    $gameData['game_meta'][$field] = $filename;
                }
            }

            // The new shape keeps `quests` INSIDE `game_meta`; the legacy
            // shape the playground reads has `quests` as a TOP-LEVEL sibling
            // (see the ZIP `buildZipPayload` contract). Per-quest media
            // (`main_image`, `image_1..4`, `sound`) also lived INLINE on each
            // quest object pre-refactor — `cleanGameMetaForData` strips quests
            // down to {name, points} on save and parks the media in the
            // `medias` column. Rebuild the full quest objects (base fields +
            // media, matched by `quest_index`) and expose them top-level so
            // the playground renders quest names, icons + punch-animation
            // slot images. Keep `game_meta.quests` in sync for any reader
            // that still looks there.
            if (is_array($gameData['game_meta']['quests'] ?? null)) {
                $quests = array_values($gameData['game_meta']['quests']);
                $questMediaList = is_array($structuredMedias['quests'] ?? null)
                    ? $structuredMedias['quests']
                    : [];
                foreach ($questMediaList as $pos => $questMedia) {
                    if (!is_array($questMedia)) {
                        continue;
                    }
                    $idx = $questMedia['quest_index'] ?? $pos;
                    if (!isset($quests[$idx]) || !is_array($quests[$idx])) {
                        continue;
                    }
                    foreach ($questMedia as $key => $val) {
                        if ($key === 'quest_index' || $val === '' || $val === null) {
                            continue;
                        }
                        $quests[$idx][$key] = $val;
                    }
                }
                $gameData['quests'] = $quests;
                $gameData['game_meta']['quests'] = $quests;
            }

            // Mystery equivalent: the runtime (MysteryGamePage) reads
            // `game_data.game_enigmas` (top-level), but the modern shape keeps
            // enigmas at `game_meta.enigmas` with `good_answer_image` parked
            // in the structured `medias.enigmas[]` list keyed by enigma_number.
            // Merge them and expose at top-level so the enigmas grid renders.
            if (
                ($scenario['game_type'] ?? '') === 'mystery'
                && is_array($gameData['game_meta']['enigmas'] ?? null)
            ) {
                $enigmaMediaByNumber = [];
                $enigmaMediaList = is_array($structuredMedias['enigmas'] ?? null)
                    ? $structuredMedias['enigmas']
                    : [];
                foreach ($enigmaMediaList as $em) {
                    if (!is_array($em)) continue;
                    $num = $em['enigma_number'] ?? null;
                    if ($num === null || $num === '') continue;
                    $enigmaMediaByNumber[(string)$num] = $em;
                }
                $merged = [];
                foreach ($gameData['game_meta']['enigmas'] as $e) {
                    $entry = is_array($e) ? $e : [];
                    $num = $entry['number'] ?? null;
                    if ($num !== null && $num !== '' && isset($enigmaMediaByNumber[(string)$num])) {
                        foreach ($enigmaMediaByNumber[(string)$num] as $k => $v) {
                            if ($k === 'enigma_number' || $v === '' || $v === null) continue;
                            $entry[$k] = $v;
                        }
                    }
                    $merged[] = $entry;
                }
                $gameData['game_enigmas'] = $merged;
                $gameData['game_meta']['enigmas'] = $merged;
            }

            // Tracks equivalent: per-checkpoint images live in the structured
            // `medias.checkpoints[]` list (keyed by `checkpoint_id`, with
            // `checkpoint_number` / position as fallbacks). The playground
            // runtime reads `game_meta.checkpoints[].image`, so splice each
            // filename back onto its checkpoint — otherwise checkpoints render
            // as blank/placeholder markers.
            if (
                ($scenario['game_type'] ?? '') === 'tracks'
                && is_array($gameData['game_meta']['checkpoints'] ?? null)
            ) {
                $cpMediaById = [];
                $cpMediaByNumber = [];
                $cpMediaList = is_array($structuredMedias['checkpoints'] ?? null)
                    ? $structuredMedias['checkpoints']
                    : [];
                foreach ($cpMediaList as $pos => $cm) {
                    if (!is_array($cm)) continue;
                    if (isset($cm['checkpoint_id']) && $cm['checkpoint_id'] !== '') {
                        $cpMediaById[(string)$cm['checkpoint_id']] = $cm;
                    }
                    $num = $cm['checkpoint_number'] ?? ($pos + 1);
                    $cpMediaByNumber[(string)$num] = $cm;
                }
                $mergedCps = [];
                $i = 0;
                foreach ($gameData['game_meta']['checkpoints'] as $cp) {
                    $entry = is_array($cp) ? $cp : [];
                    $i++;
                    $cm = null;
                    if (isset($entry['id']) && isset($cpMediaById[(string)$entry['id']])) {
                        $cm = $cpMediaById[(string)$entry['id']];
                    } elseif (isset($cpMediaByNumber[(string)$i])) {
                        $cm = $cpMediaByNumber[(string)$i];
                    }
                    if (is_array($cm) && isset($cm['image']) && $cm['image'] !== '') {
                        $entry['image'] = $cm['image'];
                    }
                    $mergedCps[] = $entry;
                }
                $gameData['game_meta']['checkpoints'] = $mergedCps;
            }
        }

        // The `medias` column historically holds a structured object
        // ({images, quests, sounds, overscores}) — useful for studio admin
        // but not what the playground client wants. The client needs a flat
        // list of filenames it can pass to ?action=get_media&filename=...
        // We scan the on-disk media dir to produce that list authoritatively
        // (any file that exists on disk is a file the client needs to mirror).
        $medias = [];
        $mediaDir = __DIR__ . '/../../media/' . $uniqid;
        if (is_dir($mediaDir)) {
            foreach (scandir($mediaDir) as $entry) {
                if ($entry === '.' || $entry === '..') continue;
                $path = $mediaDir . '/' . $entry;
                if (is_file($path)) {
                    $medias[] = $entry;
                }
            }
        }

        Logger::log('playground', $method, 'get_scenario_game_data', $userId, ['uniqid' => $uniqid], ['success' => true, 'media_count' => count($medias)], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, [
            'scenario' => [
                'id' => $scenario['id'],
                'name' => $scenario['title'] ?? null,
                'uniqid' => $scenario['uniqid'],
                'scenario_type' => $scenario['scenario_type'],
            ],
            'game_data' => $gameData,
            'medias' => $medias,
        ]);
        break;

    case 'get_media':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        $uniqid = $_GET['uniqid'] ?? null;
        $filename = $_GET['filename'] ?? null;

        if (!$uniqid || !$filename) {
            jsonResponse(['error' => 'uniqid and filename are required'], 400);
        }

        $scenario = $db->fetch('SELECT * FROM scenarios WHERE uniqid = ?', [$uniqid]);

        if (!$scenario) {
            jsonResponse(['error' => 'Scenario not found'], 404);
        }

        if (!playgroundClientCanAccessScenario($db, $client, $scenario)) {
            Logger::log('playground', $method, 'get_media', $userId, ['uniqid' => $uniqid, 'filename' => $filename], ['error' => 'Access denied'], 403, 'playground');
            jsonResponse(['error' => 'Access denied to this scenario media'], 403);
        }

        $mediaPath = __DIR__ . '/../../media/' . $uniqid . '/' . $filename;

        if (!file_exists($mediaPath)) {
            jsonResponse(['error' => 'Media file not found'], 404);
        }

        // Binary streaming response — no auth_state wrapper here, this is a file download.
        $mimeType = mime_content_type($mediaPath);
        header('Content-Type: ' . $mimeType);
        header('Content-Length: ' . filesize($mediaPath));
        header('Content-Disposition: inline; filename="' . basename($filename) . '"');

        Logger::log('playground', $method, 'get_media', $userId, ['uniqid' => $uniqid, 'filename' => $filename], ['success' => true], 200, 'playground');

        readfile($mediaPath);
        exit;

    case 'get_game_type_media':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        $code = $_GET['code'] ?? '';
        $variant = $_GET['variant'] ?? 'admin';
        $version = (int)($_GET['version'] ?? 0);
        $filename = $_GET['filename'] ?? '';
        $subtitleLang = $_GET['subtitle_lang'] ?? '';

        $supportedLangs = ['en','fr','es','de','it','pt','nl','pl','ru','ja','zh','ar'];

        if (!$code || !$version || (!$filename && !$subtitleLang)) {
            jsonResponse(['error' => 'Missing params'], 400);
        }
        if (!preg_match('/^[a-z0-9_-]+$/', $code)) {
            jsonResponse(['error' => 'Invalid code'], 400);
        }

        if ($variant === 'admin') {
            $baseDir = __DIR__ . "/../../media/game_types/$code/v$version";
        } elseif ($variant === 'client') {
            $baseDir = __DIR__ . "/../../media/game_types/$code/clients/$userId/v$version";
        } else {
            jsonResponse(['error' => 'Invalid variant'], 400);
        }

        if ($subtitleLang) {
            if (!in_array($subtitleLang, $supportedLangs, true)) {
                jsonResponse(['error' => 'Invalid lang'], 400);
            }
            $path = "$baseDir/subtitles/$subtitleLang.vtt";
            $mime = 'text/vtt';
        } else {
            if (strpos($filename, '..') !== false || strpos($filename, '/') !== false || strpos($filename, '\\') !== false) {
                jsonResponse(['error' => 'Invalid filename'], 400);
            }
            $path = "$baseDir/$filename";
            $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
            $mimeMap = ['mp4' => 'video/mp4', 'webm' => 'video/webm', 'ogg' => 'video/ogg', 'mov' => 'video/quicktime'];
            $mime = $mimeMap[$ext] ?? 'application/octet-stream';
        }

        if (!is_file($path)) {
            jsonResponse(['error' => 'File not found'], 404);
        }

        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($path));
        header('Content-Disposition: inline; filename="' . basename($path) . '"');
        Logger::log('playground', $method, 'get_game_type_media', $userId, ['code' => $code, 'variant' => $variant, 'version' => $version], ['success' => true], 200, 'playground');
        readfile($path);
        exit;

    case 'get_available_scenario_data':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        $uniqid = $_GET['uniqid'] ?? null;

        if (!$uniqid) {
            jsonResponse(['error' => 'uniqid is required'], 400);
        }

        $scenario = $db->fetch('SELECT * FROM scenarios WHERE uniqid = ?', [$uniqid]);

        if (!$scenario) {
            jsonResponse(['error' => 'Scenario not found'], 404);
        }

        if (!playgroundClientCanAccessScenario($db, $client, $scenario)) {
            Logger::log('playground', $method, 'get_available_scenario_data', $userId, ['uniqid' => $uniqid], ['error' => 'Access denied'], 403, 'playground');
            jsonResponse(['error' => 'Access denied to this scenario'], 403);
        }

        $medias = !empty($scenario['medias']) ? json_decode($scenario['medias'], true) : null;

        Logger::log('playground', $method, 'get_available_scenario_data', $userId, ['uniqid' => $uniqid], ['success' => true], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, [
            'scenario' => [
                'id' => $scenario['id'],
                'name' => $scenario['name'],
                'uniqid' => $scenario['uniqid'],
                'scenario_type' => $scenario['scenario_type'],
                'available_for_purchase' => true,
            ],
            'medias' => $medias,
        ]);
        break;

    case 'get_billing_status':
        // Kept for backwards compatibility, but auth_state already carries this.
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        Logger::log('playground', $method, 'get_billing_status', $userId, [], [
            'billing_up_to_date' => $client['billing_up_to_date'],
            'license_type' => $client['license_type'],
        ], 200, 'playground');

        jsonResponseWithAuthState($db, $userId, [
            'billing_up_to_date' => (bool)$client['billing_up_to_date'],
            'license_type' => $client['license_type'],
        ]);
        break;

    case 'get_cards_version':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        $metadata = $db->fetch(
            'SELECT version, updated_at FROM client_cards_metadata WHERE client_id = ? ORDER BY version DESC LIMIT 1',
            [$userId]
        );

        Logger::log('playground', $method, 'get_cards_version', $userId, [], $metadata ?: [], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, [
            // version is DECIMAL(10,2); cast to float so JSON emits a number, not a string.
            'version' => $metadata ? round((float)$metadata['version'], 2) : null,
            'updated_at' => $metadata ? $metadata['updated_at'] : null,
        ]);
        break;

    case 'get_patterns':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        $patterns = $db->fetchAll(
            'SELECT id, name, game_type, version, is_default, owner_type, pattern_uniqid, pattern_slug, description, created_at
             FROM patterns
             WHERE is_default = TRUE OR (owner_type = ? AND owner_id = ?)
             ORDER BY game_type, is_default DESC, name',
            ['client', $userId]
        );

        Logger::log('playground', $method, 'get_patterns', $userId, [], ['count' => count($patterns)], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, [
            'patterns' => $patterns,
            'count' => count($patterns),
        ]);
        break;

    case 'get_layouts':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        $layouts = $db->fetchAll(
            'SELECT id, game_type, status, version, owner_type, layout_uniqid, scenario_uniqid, created_at
             FROM layouts
             WHERE owner_type = ? AND status = ?
             ORDER BY game_type, version DESC',
            ['admin', 'active']
        );

        Logger::log('playground', $method, 'get_layouts', $userId, [], ['count' => count($layouts)], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, [
            'layouts' => $layouts,
            'count' => count($layouts),
        ]);
        break;

    case 'get_cards':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        $cards = $db->fetchAll(
            'SELECT id, key_number, key_name, color
             FROM client_cards
             WHERE client_id = ?
             ORDER BY key_number ASC, id ASC',
            [$userId]
        );

        $metadata = $db->fetch(
            'SELECT version FROM client_cards_metadata WHERE client_id = ?',
            [$userId]
        );
        // version is DECIMAL(10,2) — cast to float so JSON encodes as a number.
        $version = $metadata ? round((float)$metadata['version'], 2) : 0.0;

        Logger::log('playground', $method, 'get_cards', $userId, [], ['count' => count($cards), 'version' => $version], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, [
            'cards' => $cards,
            'version' => $version,
        ]);
        break;

    case 'get_user_data_update':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        $customScenarios = $db->fetchAll(
            'SELECT title, uniqid, version, game_type FROM scenarios WHERE client_id = ? AND status = "published" ORDER BY created_at DESC',
            [$userId]
        );

        // Product scenarios in the manifest MUST mirror what
        // playgroundClientCanAccessScenario() will actually allow: premium
        // clients get every product scenario, everyone else only the ones
        // granted via client_scenarios. Listing all product scenarios here
        // (the old behaviour) handed non-premium clients phantom sync items
        // that get_scenario_game_data then rejected with 403 — surfacing in
        // the playground as a permanent "1 failed".
        if (($client['license_type'] ?? '') === 'premium') {
            $productScenarios = $db->fetchAll(
                'SELECT title, uniqid, version, game_type FROM scenarios
                 WHERE scenario_type = "product" AND status = "published"
                 ORDER BY created_at DESC'
            );
        } else {
            $productScenarios = $db->fetchAll(
                'SELECT s.title, s.uniqid, s.version, s.game_type FROM scenarios s
                 JOIN client_scenarios cs ON cs.scenario_id = s.id AND cs.client_id = ?
                 WHERE s.scenario_type = "product" AND s.status = "published"
                 ORDER BY s.created_at DESC',
                [$userId]
            );
        }

        $defaultPatterns = $db->fetchAll(
            'SELECT name, game_type, version, pattern_uniqid FROM patterns WHERE is_default = TRUE ORDER BY game_type, name'
        );
        $customPatterns = $db->fetchAll(
            'SELECT name, game_type, version, pattern_uniqid FROM patterns WHERE is_default = FALSE AND owner_type = ? AND owner_id = ? ORDER BY game_type, name',
            ['client', $userId]
        );

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

        // Team-name pools version = max(global catalog, this client's pool).
        // Defensive: the team_name_pools tables may not be migrated yet on
        // older installs, so a missing table just yields version 0.
        $teamNamesVersion = 0;
        try {
            $gv = $db->fetch("SELECT current_version FROM team_name_pools_meta WHERE scope_key = 'global'");
            $cv = $db->fetch('SELECT current_version FROM team_name_pools_meta WHERE scope_key = ?', ['client:' . $userId]);
            // current_version is DECIMAL(10,2); cast to float so JSON emits a number.
            $teamNamesVersion = round(max((float)($gv['current_version'] ?? 0), (float)($cv['current_version'] ?? 0)), 2);
        } catch (Exception $e) {
            $teamNamesVersion = 0;
        }

        // Offline PIN-recovery codes version (per-client). Defensive: the
        // recovery_codes tables may not be migrated yet on older installs, so
        // a missing table just yields version 0 (no download advertised).
        $recoveryCodesVersion = 0;
        try {
            $rv = $db->fetch('SELECT current_version FROM recovery_codes_meta WHERE client_id = ?', [$userId]);
            $recoveryCodesVersion = (int)($rv['current_version'] ?? 0);
        } catch (Exception $e) {
            $recoveryCodesVersion = 0;
        }

        $layouts = $db->fetchAll(
            'SELECT id, version, game_type FROM layouts WHERE owner_type = "admin" AND status = "active" ORDER BY game_type, version DESC'
        );

        // Global admin-managed translation rows. Small enough to ship inline
        // (value is a few hundred bytes per row). Add new meta keys here to
        // surface them in the playground.
        $translations = $db->fetchAll(
            'SELECT meta AS `key`, value, version FROM default_config WHERE meta IN ("tagquest_translations") ORDER BY meta'
        );
        foreach ($translations as &$t) {
            $t['value'] = json_decode($t['value'], true);
            $t['version'] = (int)$t['version'];
        }
        unset($t);

        $gameTypeRows = $db->fetchAll(
            'SELECT code, name, supports_tutorial_video, supports_intro_video,
                    tutorial_video_path, tutorial_video_version, tutorial_subtitles
             FROM game_types ORDER BY code'
        );
        $gameTypes = [];
        foreach ($gameTypeRows as $row) {
            $gameTypes[] = [
                'code' => $row['code'],
                'name' => $row['name'],
                'supports_tutorial_video' => (bool)$row['supports_tutorial_video'],
                'supports_intro_video' => (bool)$row['supports_intro_video'],
                'tutorial_video_filename' => $row['tutorial_video_path'] ?: null,
                'tutorial_video_version' => (int)$row['tutorial_video_version'],
                'tutorial_subtitles' => $row['tutorial_subtitles'] ? json_decode($row['tutorial_subtitles'], true) : new stdClass(),
            ];
        }

        $overrideRows = $db->fetchAll(
            'SELECT game_type_code, tutorial_video_path, tutorial_video_version, tutorial_subtitles
             FROM client_game_type_overrides WHERE client_id = ?',
            [$userId]
        );
        $overrides = [];
        foreach ($overrideRows as $row) {
            $overrides[] = [
                'game_type_code' => $row['game_type_code'],
                'tutorial_video_filename' => $row['tutorial_video_path'] ?: null,
                'tutorial_video_version' => (int)$row['tutorial_video_version'],
                'tutorial_subtitles' => $row['tutorial_subtitles'] ? json_decode($row['tutorial_subtitles'], true) : new stdClass(),
            ];
        }

        $clientRow = $db->fetch('SELECT preferences FROM clients WHERE id = ?', [$userId]);
        $clientPrefs = ($clientRow && $clientRow['preferences'])
            ? json_decode($clientRow['preferences'], true)
            : new stdClass();

        Logger::log('playground', $method, 'get_user_data_update', $userId, [], [
            'custom_scenarios_count' => count($customScenarios),
            'product_scenarios_count' => count($productScenarios),
            'default_patterns_count' => count($defaultPatterns),
            'custom_patterns_count' => count($customPatterns),
            'cards_version' => $cardsMetadata ? round((float)$cardsMetadata['version'], 2) : null,
            'has_on_demand_cards' => $hasOnDemandCards,
            'team_names_version' => $teamNamesVersion,
            'recovery_codes_version' => $recoveryCodesVersion,
            'layouts_count' => count($layouts),
            'translations_count' => count($translations),
            'game_types_count' => count($gameTypes),
            'overrides_count' => count($overrides),
        ], 200, 'playground');

        jsonResponseWithAuthState($db, $userId, [
            'custom_scenarios' => $customScenarios,
            'product_scenarios' => $productScenarios,
            'default_patterns' => $defaultPatterns,
            'custom_patterns' => $customPatterns,
            'cards_version' => $cardsMetadata ? round((float)$cardsMetadata['version'], 2) : null,
            'has_on_demand_cards' => $hasOnDemandCards,
            'team_names_version' => $teamNamesVersion,
            'recovery_codes_version' => $recoveryCodesVersion,
            'layouts' => $layouts,
            'translations' => $translations,
            'game_types' => $gameTypes,
            'client_game_type_overrides' => $overrides,
            'client_preferences' => $clientPrefs,
        ]);
        break;

    case 'get_on_demand_cards':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

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

        Logger::log('playground', $method, 'get_on_demand_cards', $userId, [], ['count' => count($cards)], 200, 'playground');

        // File-style download — no auth_state wrapper (Content-Disposition: attachment).
        http_response_code(200);
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="on_demand_cards.json"');
        echo json_encode(['cards' => $cards, 'count' => count($cards)]);
        exit;

    case 'get_team_names':
        // Merged team-name pools (global catalog ∪ this client's pool), grouped
        // audience -> language -> [names], deduped case-insensitively. The
        // playground draws from this at team creation (auto-register / reuse).
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        $version = 0;
        $pools = [];
        try {
            $gv = $db->fetch("SELECT current_version FROM team_name_pools_meta WHERE scope_key = 'global'");
            $cv = $db->fetch('SELECT current_version FROM team_name_pools_meta WHERE scope_key = ?', ['client:' . $userId]);
            // current_version is DECIMAL(10,2); cast to float so JSON emits a number.
            $version = round(max((float)($gv['current_version'] ?? 0), (float)($cv['current_version'] ?? 0)), 2);
            $rows = $db->fetchAll(
                'SELECT audience, language, name FROM team_name_pools
                 WHERE client_id IS NULL OR client_id = ?
                 ORDER BY audience ASC, language ASC, name ASC',
                [$userId]
            );
            $seen = [];
            foreach ($rows as $r) {
                $a = $r['audience'];
                $l = $r['language'];
                $key = $a . '|' . $l . '|' . mb_strtolower(trim($r['name']));
                if (isset($seen[$key])) continue;
                $seen[$key] = true;
                $pools[$a][$l][] = $r['name'];
            }
        } catch (Exception $e) {
            // tables not migrated yet -> empty pools, version 0
            $version = 0;
            $pools = [];
        }

        Logger::log('playground', $method, 'get_team_names', $userId, [], ['version' => $version], 200, 'playground');

        http_response_code(200);
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="team_names.json"');
        echo json_encode(['version' => $version, 'pools' => (object)$pools]);
        exit;

    case 'get_recovery_codes':
        // This client's offline PIN-recovery codes, plaintext, in code_index
        // order (so the device's local index lines up with studio's for the
        // best-effort report-up). Codes travel over TLS and are stored on the
        // device only as salted hashes. Per-client only; no global pool.
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        $version = 0;
        $codes = [];
        try {
            $rv = $db->fetch('SELECT current_version FROM recovery_codes_meta WHERE client_id = ?', [$userId]);
            $version = (int)($rv['current_version'] ?? 0);
            $rows = $db->fetchAll(
                'SELECT code FROM recovery_codes WHERE client_id = ? ORDER BY code_index ASC',
                [$userId]
            );
            foreach ($rows as $r) {
                $codes[] = $r['code'];
            }
        } catch (Exception $e) {
            // tables not migrated yet -> empty pool, version 0
            $version = 0;
            $codes = [];
        }

        Logger::log('playground', $method, 'get_recovery_codes', $userId, [], ['version' => $version, 'count' => count($codes)], 200, 'playground');

        http_response_code(200);
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="recovery_codes.json"');
        echo json_encode(['version' => $version, 'codes' => $codes]);
        exit;

    case 'download_pattern':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        $patternUniqid = $_GET['pattern_uniqid'] ?? null;

        if (!$patternUniqid) {
            jsonResponse(['error' => 'pattern_uniqid is required'], 400);
        }

        $pattern = $db->fetch(
            'SELECT id, name, game_type, version, pattern_data, is_default, owner_type, owner_id, pattern_uniqid, pattern_slug, description
             FROM patterns WHERE pattern_uniqid = ?',
            [$patternUniqid]
        );

        if (!$pattern) {
            jsonResponse(['error' => 'Pattern not found'], 404);
        }

        $hasAccess = (bool)$pattern['is_default']
            || ($pattern['owner_type'] === 'client' && (int)$pattern['owner_id'] === $userId);

        if (!$hasAccess) {
            Logger::log('playground', $method, 'download_pattern', $userId, ['pattern_uniqid' => $patternUniqid], ['error' => 'Access denied'], 403, 'playground');
            jsonResponse(['error' => 'Access denied to this pattern'], 403);
        }

        $patternData = !empty($pattern['pattern_data']) ? json_decode($pattern['pattern_data'], true) : null;

        // ZIP-imported patterns store '[]' in pattern_data and put routing in
        // the denormalized pattern_items table. Rebuild the nested Studio
        // shape from pattern_items so the playground always sees real data.
        if (!is_array($patternData) || count($patternData) === 0) {
            $items = $db->fetchAll(
                'SELECT item_index, assignment_type, station_key_number
                 FROM pattern_items WHERE pattern_id = ?
                 ORDER BY item_index, assignment_type',
                [$pattern['id']]
            );
            if (!empty($items)) {
                $byIndex = [];
                foreach ($items as $row) {
                    $idx = (int)$row['item_index'];
                    if (!isset($byIndex[$idx])) {
                        $byIndex[$idx] = ['index' => $idx, 'assignments' => (object)[]];
                    }
                    $assignments = (array)$byIndex[$idx]['assignments'];
                    $assignments[$row['assignment_type']] = $row['station_key_number'] !== null
                        ? (int)$row['station_key_number']
                        : null;
                    $byIndex[$idx]['assignments'] = (object)$assignments;
                }
                ksort($byIndex);
                $patternData = array_values($byIndex);
            }
        }

        Logger::log('playground', $method, 'download_pattern', $userId, ['pattern_uniqid' => $patternUniqid], ['success' => true], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, [
            'name' => $pattern['name'],
            'game_type' => $pattern['game_type'],
            'version' => $pattern['version'],
            'pattern_uniqid' => $pattern['pattern_uniqid'],
            'pattern_slug' => $pattern['pattern_slug'],
            'description' => $pattern['description'],
            'is_default' => (bool)$pattern['is_default'],
            'pattern_data' => $patternData,
        ]);
        break;

    case 'download_layout':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        $layoutId = $_GET['layout_id'] ?? null;

        if (!$layoutId) {
            jsonResponse(['error' => 'layout_id is required'], 400);
        }

        $layoutId = (int)$layoutId;

        $layout = $db->fetch(
            'SELECT id, layout_data, game_type, version, status, owner_type, layout_uniqid, scenario_uniqid
             FROM layouts WHERE id = ? AND status = "active"',
            [$layoutId]
        );

        if (!$layout) {
            jsonResponse(['error' => 'Layout not found or not active'], 404);
        }

        $layoutData = !empty($layout['layout_data']) ? json_decode($layout['layout_data'], true) : null;

        $layoutJson = [
            'id' => $layout['id'],
            'layout_uniqid' => $layout['layout_uniqid'],
            'game_type' => $layout['game_type'],
            'version' => $layout['version'],
            'scenario_uniqid' => $layout['scenario_uniqid'],
            'layout_data' => $layoutData,
        ];

        $filename = $layout['game_type'] . '_layout_' . $layout['version'] . '.json';

        Logger::log('playground', $method, 'download_layout', $userId, ['layout_id' => $layoutId], ['success' => true], 200, 'playground');

        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        echo json_encode($layoutJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;

    default:
        Logger::log('playground', $method, $action ?: 'none', null, [], ['error' => 'Invalid action'], 400, 'playground');
        jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    $errorDetails = [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
    ];

    try {
        Logger::log('playground', $_SERVER['REQUEST_METHOD'], $_GET['action'] ?? 'unknown', null, $_GET, $errorDetails, 500, 'playground');
    } catch (Exception $logError) {
        error_log("Failed to log error: " . $logError->getMessage());
    }

    jsonResponse([
        'error' => 'Internal server error',
        'message' => $e->getMessage(),
    ], 500);
}

// Shared scenario-access check used by get_scenario_game_data, get_media,
// get_available_scenario_data. Premium clients access all product scenarios;
// any client accesses their own; specific grants live in client_scenarios.
function playgroundClientCanAccessScenario($db, array $client, array $scenario): bool {
    $userId = (int)$client['id'];

    if ((int)($scenario['client_id'] ?? 0) === $userId) {
        return true;
    }

    if (($client['license_type'] ?? '') === 'premium' && ($scenario['scenario_type'] ?? '') === 'product') {
        return true;
    }

    $granted = $db->fetch(
        'SELECT id FROM client_scenarios WHERE client_id = ? AND scenario_id = ?',
        [$userId, $scenario['id']]
    );

    return (bool)$granted;
}
