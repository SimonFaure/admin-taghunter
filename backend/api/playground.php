<?php
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/PlaygroundAuth.php';
require_once __DIR__ . '/../utils/LocalizedCompat.php';
require_once __DIR__ . '/../utils/AudienceCompat.php';
require_once __DIR__ . '/../utils/ScenarioHashes.php';
require_once __DIR__ . '/../utils/GameTypes.php';

SecurityHeaders::setHeaders();
setCorsHeaders();

header('Content-Type: application/json');

// Cascade gate: a device never receives scenarios/patterns/etc. of a game type
// disabled for it. Resolution is DEVICE-aware (device override -> client override
// -> test-channel override -> global), so per-device and all-testers grants from
// the admin Testers page actually reach the device. $client is the resolved auth
// row (has 'id' and 'device_id'). Computed once per (client,device) and memoised.
// See utils/GameTypes.php, plans/tester-game-types-page.md and disable-game-types.md.
function playgroundDisabledTypes($db, $client) {
    static $cache = [];
    $clientId = $client['id'] ?? 0;
    $deviceId = $client['device_id'] ?? null;
    $key = $clientId . ':' . ($deviceId ?? '');
    if (!array_key_exists($key, $cache)) {
        $cache[$key] = GameTypes::disabledForDevice($db->getConnection(), $clientId, $deviceId);
    }
    return $cache[$key];
}

// Filter a list of associative rows by their game-type column, dropping any whose
// type is disabled for this device. $col defaults to 'game_type'.
function playgroundFilterDisabledTypes($db, $client, array $rows, $col = 'game_type') {
    $disabled = playgroundDisabledTypes($db, $client);
    if (empty($disabled)) return $rows;
    return array_values(array_filter($rows, function ($r) use ($disabled, $col) {
        return !in_array($r[$col] ?? '', $disabled, true);
    }));
}

// Read a client's "use my own team-name lists only" preference from the
// clients.preferences JSON blob. Defaults to false (use the merged global ∪
// client pool). Defensive: missing column / unparsable JSON -> false.
function teamNamesOwnOnlyPref($db, int $clientId): bool {
    try {
        $row = $db->fetch('SELECT preferences FROM clients WHERE id = ?', [$clientId]);
        if (!$row || empty($row['preferences'])) return false;
        $prefs = json_decode($row['preferences'], true);
        return is_array($prefs) && !empty($prefs['team_name_pools_own_only']);
    } catch (Exception $e) {
        return false;
    }
}

// Build the team-name pools payload the playground downloads. Returns:
//   version       max(global, this client) pool version (sync signal)
//   own_only      the client's "use my own lists only" preference
//   pools_global  default catalog,  audience -> language -> [names]  (display)
//   pools_client  this client's pool, audience -> language -> [names] (display)
//   pools         the EFFECTIVE draw set (audience -> language -> [names]) that
//                 the LAN mother (Rust) and the manual "Random name" button read.
//                 When own_only is on it is the client's pool, falling back to the
//                 global catalog per (audience, language) where the client has no
//                 names of its own; otherwise it is the merged global ∪ client set.
// All three are deduped case-insensitively. Tables-not-migrated -> empty/version 0.
function buildTeamNamesPayload($db, int $clientId): array {
    $ownOnly = teamNamesOwnOnlyPref($db, $clientId);
    $version = 0;
    $global = [];   // [audience][language] => [names]
    $client = [];   // [audience][language] => [names]
    try {
        $gv = $db->fetch("SELECT current_version FROM team_name_pools_meta WHERE scope_key = 'global'");
        $cv = $db->fetch('SELECT current_version FROM team_name_pools_meta WHERE scope_key = ?', ['client:' . $clientId]);
        $version = round(max((float)($gv['current_version'] ?? 0), (float)($cv['current_version'] ?? 0)), 2);
        $rows = $db->fetchAll(
            'SELECT client_id, audience, language, name FROM team_name_pools
             WHERE client_id IS NULL OR client_id = ?
             ORDER BY audience ASC, language ASC, name ASC',
            [$clientId]
        );
        $seenG = [];
        $seenC = [];
        foreach ($rows as $r) {
            $a = $r['audience'];
            $l = $r['language'];
            $norm = mb_strtolower(trim($r['name']));
            if ($r['client_id'] === null) {
                $key = $a . '|' . $l . '|' . $norm;
                if (isset($seenG[$key])) continue;
                $seenG[$key] = true;
                $global[$a][$l][] = $r['name'];
            } else {
                $key = $a . '|' . $l . '|' . $norm;
                if (isset($seenC[$key])) continue;
                $seenC[$key] = true;
                $client[$a][$l][] = $r['name'];
            }
        }
    } catch (Exception $e) {
        $version = 0;
        $global = [];
        $client = [];
    }

    // Effective draw set.
    $effective = [];
    $audiences = array_unique(array_merge(array_keys($global), array_keys($client)));
    foreach ($audiences as $a) {
        $langs = array_unique(array_merge(
            array_keys($global[$a] ?? []),
            array_keys($client[$a] ?? [])
        ));
        foreach ($langs as $l) {
            $cNames = $client[$a][$l] ?? [];
            $gNames = $global[$a][$l] ?? [];
            if ($ownOnly) {
                // Own list when this client has one for the age+language; else
                // fall back to the default catalog for that (audience, language).
                $effective[$a][$l] = !empty($cNames) ? $cNames : $gNames;
            } else {
                // Merged global ∪ client, deduped case-insensitively.
                $merged = [];
                $seen = [];
                foreach (array_merge($gNames, $cNames) as $n) {
                    $norm = mb_strtolower(trim($n));
                    if (isset($seen[$norm])) continue;
                    $seen[$norm] = true;
                    $merged[] = $n;
                }
                $effective[$a][$l] = $merged;
            }
        }
    }

    return [
        'version'      => $version,
        'own_only'     => $ownOnly,
        'pools'        => (object)$effective,
        'pools_global' => (object)$global,
        'pools_client' => (object)$client,
    ];
}

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

        // Cascade: never serve scenarios of a game type disabled for this client.
        $scenarios = playgroundFilterDisabledTypes($db, $client, $scenarios);

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

        $availableScenarios = playgroundFilterDisabledTypes($db, $client, $availableScenarios);

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
            // overload of the name - these are images, not gameplay levels;
            // see studio mystery/mediaSlots.ts). `cleanGameMetaForData` strips
            // them out of game_meta on save, so they only survive here.
            $mediaLevels = is_array($structuredMedias['levels'] ?? null) ? $structuredMedias['levels'] : [];

            // Sibling field→filename maps - the scenario list view + test
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
            // / `levels_gauge_player_icon_image` / … from game_meta - so splice
            // both the medias-column images AND the gauge images back in.
            if (is_array($gameData['game_meta'] ?? null)) {
                foreach ($allImages as $field => $filename) {
                    $gameData['game_meta'][$field] = $filename;
                }
            }

            // Catalog metadata derive-on-read: guarantee the playground always
            // sees `audience_bands` + `univers` even for rows the one-time
            // backfill hasn't reached (legacy ZIP imports, races). Bands fall
            // back to the `game_public` tier; difficulty stays as stored (the
            // playground coerces legacy enum strings to a star level itself).
            if (is_array($gameData['game_meta'] ?? null)) {
                $gm = $gameData['game_meta'];
                $bands = AudienceCompat::normalizeBands($gm['audience_bands'] ?? null);
                if (empty($bands)) {
                    $bands = AudienceCompat::bandsFromTier($gm['game_public'] ?? '');
                }
                $gameData['game_meta']['audience_bands'] = $bands;
                if (!isset($gm['univers']) || !is_array($gm['univers'])) {
                    $gameData['game_meta']['univers'] = [];
                }
            }

            // The new shape keeps `quests` INSIDE `game_meta`; the legacy
            // shape the playground reads has `quests` as a TOP-LEVEL sibling
            // (see the ZIP `buildZipPayload` contract). Per-quest media
            // (`main_image`, `image_1..4`, `sound`) also lived INLINE on each
            // quest object pre-refactor - `cleanGameMetaForData` strips quests
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

            // Mystery bonus ("overscore") tiers - the rewards a team unlocks by
            // scoring ABOVE `score_full_game`. `cleanGameMetaForData` strips
            // `image_overscore_step` out of game_meta on save and parks it in
            // the structured `medias.overscores[]` list (keyed by
            // `overscore_step`, the 1-based tier index). Splice it back or the
            // playground renders the tier names with no badge image.
            if (
                ($scenario['game_type'] ?? '') === 'mystery'
                && is_array($gameData['game_meta']['overscores'] ?? null)
            ) {
                $overscoreMediaByStep = [];
                $overscoreMediaList = is_array($structuredMedias['overscores'] ?? null)
                    ? $structuredMedias['overscores']
                    : [];
                foreach ($overscoreMediaList as $om) {
                    if (!is_array($om)) continue;
                    $step = $om['overscore_step'] ?? null;
                    if ($step === null || $step === '') continue;
                    $overscoreMediaByStep[(string)$step] = $om;
                }
                $mergedOverscores = [];
                $pos = 0;
                foreach ($gameData['game_meta']['overscores'] as $o) {
                    $entry = is_array($o) ? $o : [];
                    $pos++;
                    // Match on the authored step index, falling back to position
                    // for rows that never got one filled in.
                    $step = ($entry['overscore_step'] ?? '') !== ''
                        ? (string)$entry['overscore_step']
                        : (string)$pos;
                    $om = $overscoreMediaByStep[$step]
                        ?? ($overscoreMediaList[$pos - 1] ?? null);
                    if (is_array($om) && ($om['image_overscore_step'] ?? '') !== '') {
                        $entry['image_overscore_step'] = $om['image_overscore_step'];
                    }
                    $mergedOverscores[] = $entry;
                }
                $gameData['game_meta']['overscores'] = $mergedOverscores;
            }

            // Tracks equivalent: per-checkpoint images live in the structured
            // `medias.checkpoints[]` list (keyed by `checkpoint_id`, with
            // `checkpoint_number` / position as fallbacks). The playground
            // runtime reads `game_meta.checkpoints[].image`, so splice each
            // filename back onto its checkpoint - otherwise checkpoints render
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

            // Clash: territory balises (and the purge station) are authored as
            // station NUMBERS (the si_balises.station_name label, e.g. "1"),
            // but SI punches carry the station id (si_balises.id, e.g. 31) -
            // the same convention as pattern assignments. Ship the full
            // number→id inventory map so the playground resolves numbers to
            // ids when it assembles clash_config at launch. The WHOLE table
            // rides along (it is small) because the launch modal lets the
            // operator override balises with numbers the scenario never
            // authored.
            if (($scenario['game_type'] ?? '') === 'clash') {
                $balRows = $db->fetchAll('SELECT id, station_name FROM si_balises ORDER BY id');
                $stationMap = [];
                foreach ($balRows as $br) {
                    $name = trim((string)$br['station_name']);
                    if ($name !== '' && !isset($stationMap[$name])) {
                        $stationMap[$name] = (int)$br['id'];
                    }
                }
                $gameData['station_ids_by_number'] = $stationMap ?: new stdClass();
            }

            // Tracks per-scenario layout: studio LayoutEditor saves HUD frame
            // positions (team_name, timer, score, time) into
            // `scenarios.scenario_layout`. The playground renderer needs them
            // to draw HUD boxes where the author placed them on the map -
            // otherwise it falls back to a hardcoded top strip. Splice the
            // raw column in under `scenario_layout` so the playground's
            // normalize can find it via either `raw.scenario_layout.elements`
            // (cloud path) or `raw.layout.elements` (ZIP path).
            // Authored text elements (slice 3 of tracks-text-elements.md)
            // are filtered OUT of scenario_layout on save in the studio -
            // their position lives in game_meta.text_elements[] instead -
            // so what arrives here is HUD/image elements only.
            if (!empty($scenario['scenario_layout'])) {
                $layoutCol = json_decode($scenario['scenario_layout'], true);
                if (is_array($layoutCol)) {
                    $gameData['scenario_layout'] = $layoutCol;
                }
            }
        }

        // The `medias` column historically holds a structured object
        // ({images, quests, sounds, overscores}) - useful for studio admin
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

        // Incremental-sync (CAS) manifest. `files` is the authoritative
        // per-file list with content hashes - the playground downloads only
        // blobs it doesn't already have and verifies each against its hash.
        // The first entry is game-data.json keyed by data_hash (a change token
        // over data+medias+layout+game_type - NOT a hash of these served bytes,
        // so the playground must NOT hash-verify the game-data blob). `medias`
        // (flat filename list) and `version` are retained for older clients.
        $files = ScenarioHashes::fileManifest($db->getConnection(), $uniqid);
        $dataHash = $scenario['data_hash'] ?? null;
        if (empty($dataHash)) {
            // Lazy fallback mirrors the Tier-1 gate.
            ScenarioHashes::recompute($db->getConnection(), $uniqid);
            $refreshed = $db->fetch('SELECT data_hash FROM scenarios WHERE uniqid = ?', [$uniqid]);
            $dataHash = $refreshed['data_hash'] ?? null;
            $files = ScenarioHashes::fileManifest($db->getConnection(), $uniqid);
        }

        Logger::log('playground', $method, 'get_scenario_game_data', $userId, ['uniqid' => $uniqid], ['success' => true, 'media_count' => count($medias), 'file_count' => count($files)], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, [
            'scenario' => [
                'id' => $scenario['id'],
                'name' => $scenario['title'] ?? null,
                'uniqid' => $scenario['uniqid'],
                'scenario_type' => $scenario['scenario_type'],
            ],
            'game_data' => $gameData,
            'medias' => $medias,
            'data_hash' => $dataHash,
            'files' => $files,
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

        // Binary streaming response - no auth_state wrapper here, this is a file download.
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

        // Cascade: drop patterns of game types disabled for this client.
        $patterns = playgroundFilterDisabledTypes($db, $client, $patterns);

        Logger::log('playground', $method, 'get_patterns', $userId, [], ['count' => count($patterns)], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, [
            'patterns' => $patterns,
            'count' => count($patterns),
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
        // version is DECIMAL(10,2) - cast to float so JSON encodes as a number.
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
            'SELECT title, uniqid, version, game_type, content_hash FROM scenarios WHERE client_id = ? AND status = "published" ORDER BY created_at DESC',
            [$userId]
        );

        // Product scenarios in the manifest MUST mirror what
        // playgroundClientCanAccessScenario() will actually allow: premium
        // clients get every product scenario, everyone else only the ones
        // granted via client_scenarios. Listing all product scenarios here
        // (the old behaviour) handed non-premium clients phantom sync items
        // that get_scenario_game_data then rejected with 403 - surfacing in
        // the playground as a permanent "1 failed".
        if (($client['license_type'] ?? '') === 'premium') {
            $productScenarios = $db->fetchAll(
                'SELECT title, uniqid, version, game_type, content_hash FROM scenarios
                 WHERE scenario_type = "product" AND status = "published"
                 ORDER BY created_at DESC'
            );
        } else {
            $productScenarios = $db->fetchAll(
                'SELECT s.title, s.uniqid, s.version, s.game_type, s.content_hash FROM scenarios s
                 JOIN client_scenarios cs ON cs.scenario_id = s.id AND cs.client_id = ?
                 WHERE s.scenario_type = "product" AND s.status = "published"
                 ORDER BY s.created_at DESC',
                [$userId]
            );
        }

        // Incremental-sync gate: every published scenario MUST carry a
        // content_hash. Lazily fill any NULLs (a write path that predates the
        // hash columns, or a manual DB edit) so the playground never sees a
        // missing gate value. Cheap in steady state (backfill already ran).
        $fillContentHash = function (array &$list) use ($db) {
            foreach ($list as &$s) {
                if (empty($s['content_hash'])) {
                    $s['content_hash'] = ScenarioHashes::contentHash($db->getConnection(), $s['uniqid']);
                }
            }
            unset($s);
        };
        $fillContentHash($customScenarios);
        $fillContentHash($productScenarios);

        // Cascade: drop scenarios of game types disabled for this client. They vanish
        // from the manifest, so the playground's tombstoneMissing prunes any local copy
        // on the next online sync (offline devices retain until they reconnect).
        $customScenarios  = playgroundFilterDisabledTypes($db, $client, $customScenarios);
        $productScenarios = playgroundFilterDisabledTypes($db, $client, $productScenarios);

        // Published only - mirrors the studio's own client-facing pattern list
        // (patterns.php). Without the status filter, draft catalog patterns
        // synced to every playground and could be silently picked as a launch
        // default, breaking scoring (no station ever matches a punch).
        $defaultPatterns = $db->fetchAll(
            "SELECT name, game_type, version, pattern_uniqid FROM patterns WHERE is_default = TRUE AND status = 'published' ORDER BY game_type, name"
        );
        $customPatterns = $db->fetchAll(
            'SELECT name, game_type, version, pattern_uniqid FROM patterns WHERE is_default = FALSE AND owner_type = ? AND owner_id = ? ORDER BY game_type, name',
            ['client', $userId]
        );
        // Cascade extends to patterns of disabled types.
        $defaultPatterns = playgroundFilterDisabledTypes($db, $client, $defaultPatterns);
        $customPatterns  = playgroundFilterDisabledTypes($db, $client, $customPatterns);

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

        // Mission-report PDF layout version: admin (global) + this client's own
        // overrides. Both only ever increase, so a save on either side changes
        // the sum and devices re-pull the merged set (get_report_layouts).
        // MUST use the same helper as get_report_layouts (ensureTables +
        // combinedVersion): when the two computed the version independently and
        // the client-override tables were missing, the manifest degraded to the
        // admin-only version while the download degraded to 0 - devices then
        // re-pulled (and wiped their cached layouts) on every sync, forever.
        // DB errors (e.g. no CREATE privilege) -> version 0 (nothing advertised).
        $reportLayoutsVersion = 0;
        try {
            require_once __DIR__ . '/../utils/ReportLayouts.php';
            ReportLayouts::ensureTables($db);
            $reportLayoutsVersion = ReportLayouts::combinedVersion($db, (int)$userId);
        } catch (Exception $e) {
            $reportLayoutsVersion = 0;
        }

        // Relayed default-hotspot Wi-Fi networks version (per-client). The client
        // re-pulls get_lan_networks when this advances. Defensive: the table may
        // not be migrated yet on older installs -> version 0 (nothing to pull).
        $lanNetworksVersion = 0;
        try {
            $lnv = $db->fetch('SELECT COALESCE(MAX(version),0) AS v FROM lan_networks WHERE client_id = ?', [$userId]);
            $lanNetworksVersion = (int)($lnv['v'] ?? 0);
        } catch (Exception $e) {
            $lanNetworksVersion = 0;
        }

        // Global admin-managed in-game translation rows (bucket 2). Small enough
        // to ship inline (a few hundred bytes per row). Add new meta keys here to
        // surface them in the playground. `tagquest_translations` is the legacy
        // key for the tagquest HUD labels (the playground absorbs it into the
        // `ingame_tagquest` namespace); `ingame_*` are the per-namespace blobs
        // authored in the studio Translations admin. The `__meta` source-hash
        // companions are intentionally NOT published (studio-only).
        $translations = $db->fetchAll(
            'SELECT meta AS `key`, value, version FROM default_config
             WHERE meta IN ("tagquest_translations", "ingame_common", "ingame_mystery", "ingame_tracks")
             ORDER BY meta'
        );
        foreach ($translations as &$t) {
            $t['value'] = json_decode($t['value'], true);
            $t['version'] = (int)$t['version'];
        }
        unset($t);

        // Cascade: tutorial videos / game-type metadata for disabled types are withheld.
        $disabledTypeCodes = playgroundDisabledTypes($db, $client);
        $gameTypeRows = $db->fetchAll(
            'SELECT code, name, supports_tutorial_video, supports_intro_video,
                    tutorial_video_path, tutorial_video_version, tutorial_subtitles
             FROM game_types ORDER BY code'
        );
        $gameTypeRows = array_values(array_filter($gameTypeRows, function ($r) use ($disabledTypeCodes) {
            return !in_array($r['code'] ?? '', $disabledTypeCodes, true);
        }));
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
        $overrideRows = array_values(array_filter($overrideRows, function ($r) use ($disabledTypeCodes) {
            return !in_array($r['game_type_code'] ?? '', $disabledTypeCodes, true);
        }));
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
            'report_layouts_version' => $reportLayoutsVersion,
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
            'report_layouts_version' => $reportLayoutsVersion,
            'lan_networks_version' => $lanNetworksVersion,
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

        // File-style download - no auth_state wrapper (Content-Disposition: attachment).
        http_response_code(200);
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="on_demand_cards.json"');
        echo json_encode(['cards' => $cards, 'count' => count($cards)]);
        exit;

    case 'get_team_names':
        // Team-name pools for this client. The downloaded file carries the
        // EFFECTIVE draw set (`pools`, honoring the "use my own lists only"
        // preference) that the LAN mother + manual draw read, plus the always-full
        // `pools_global` / `pools_client` breakdowns the Settings "Team names" tab
        // displays. The playground draws from `pools` at team creation.
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        $payload = buildTeamNamesPayload($db, $userId);

        Logger::log('playground', $method, 'get_team_names', $userId, [], ['version' => $payload['version'], 'own_only' => $payload['own_only']], 200, 'playground');

        http_response_code(200);
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="team_names.json"');
        echo json_encode($payload);
        exit;

    case 'set_team_names_own_only':
        // Toggle the client-wide "use my own team-name lists only" preference
        // (authored from the playground Settings → Team names tab). Persisted in
        // clients.preferences so every draw path honors it: the cloud add_team
        // draw reads it directly, and the LAN mother + manual draw get the
        // re-filtered `pools` via a re-sync. We bump this client's pool version so
        // the manifest's team_names_version advances and devices re-pull the
        // freshly-filtered file. The response carries the fresh payload so the
        // calling device can write team_names.json immediately (no sync wait).
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $ownOnly = !empty($body['own_only']);

        // Merge the flag into the existing preferences JSON (preserve other keys).
        $clientRow = $db->fetch('SELECT preferences FROM clients WHERE id = ?', [$userId]);
        $prefs = ($clientRow && $clientRow['preferences'])
            ? json_decode($clientRow['preferences'], true)
            : [];
        if (!is_array($prefs)) $prefs = [];
        $prefs['team_name_pools_own_only'] = $ownOnly;
        $db->query('UPDATE clients SET preferences = ? WHERE id = ?', [json_encode($prefs), $userId]);

        // Bump this client's pool version (above the current max) so the manifest
        // advances and all the client's devices re-pull the re-filtered pools.
        try {
            $gv = $db->fetch("SELECT current_version FROM team_name_pools_meta WHERE scope_key = 'global'");
            $cv = $db->fetch('SELECT current_version FROM team_name_pools_meta WHERE scope_key = ?', ['client:' . $userId]);
            $next = round(max((float)($gv['current_version'] ?? 0), (float)($cv['current_version'] ?? 0)) + 0.10, 2);
            $db->query(
                'INSERT INTO team_name_pools_meta (scope_key, current_version) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE current_version = VALUES(current_version)',
                ['client:' . $userId, $next]
            );
        } catch (Exception $e) {
            // tables not migrated yet -> the preference still persists; the draw
            // paths that read live tables just stay at their fallbacks.
        }

        Logger::log('playground', $method, 'set_team_names_own_only', $userId, ['own_only' => $ownOnly], ['ok' => true], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, buildTeamNamesPayload($db, $userId));
        break;

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

    case 'get_report_layouts':
        // Per-game-type mission-report PDF layouts: the admin (global) defaults
        // with this client's own overrides layered on top, plus the admin-defined
        // default print format (paper + orientation - a device's local
        // Settings → Printing choice wins over it). Version is
        // admin_version + client_version, matching the manifest. Per-scenario
        // overrides ride in the scenario game_data, not here.
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $client = requirePlaygroundClient($db);
        $userId = $client['id'];

        $version = 0;
        $layouts = new stdClass();
        $printFormat = null;
        try {
            require_once __DIR__ . '/../utils/ReportLayouts.php';
            // Create any missing tables BEFORE reading versions: combinedVersion
            // queries client_report_layouts_meta directly, and if it throws here
            // the catch below serves {version: 0, layouts: {}} while the manifest
            // still advertises a real version - an endless re-download loop.
            ReportLayouts::ensureTables($db);
            $version = ReportLayouts::combinedVersion($db, (int)$userId);
            $merged = ReportLayouts::getAllForClient($db, (int)$userId);
            $layouts = $merged['layouts'] ?: new stdClass();
            // Client's own print format when set, else the admin default.
            $printFormat = ReportLayouts::effectivePrintFormat($db, (int)$userId);
        } catch (Exception $e) {
            // tables not migrated yet -> empty, version 0 (playground keeps code defaults)
            $version = 0;
            $layouts = new stdClass();
            $printFormat = null;
        }

        Logger::log('playground', $method, 'get_report_layouts', $userId, [], ['version' => $version], 200, 'playground');

        http_response_code(200);
        header('Content-Type: application/json');
        header('Content-Disposition: attachment; filename="report_layouts.json"');
        echo json_encode(['version' => $version, 'layouts' => $layouts, 'print_format' => $printFormat]);
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

        // Assignment values are si_balises ids (the station id). Resolve each to
        // its station_name (the human-facing station "number", e.g. "1") so the
        // playground can show both the id and the number in pattern details.
        $stations = new stdClass();
        if (is_array($patternData)) {
            $stationIds = [];
            foreach ($patternData as $row) {
                $assignments = is_object($row) ? ($row->assignments ?? null)
                    : (is_array($row) ? ($row['assignments'] ?? null) : null);
                foreach ((array)$assignments as $val) {
                    if ($val !== null && $val !== '' && is_numeric($val)) {
                        $stationIds[(int)$val] = true;
                    }
                }
            }
            if (!empty($stationIds)) {
                $idList = array_keys($stationIds);
                $placeholders = implode(',', array_fill(0, count($idList), '?'));
                $stationRows = $db->fetchAll(
                    "SELECT id, station_name FROM si_balises WHERE id IN ($placeholders)",
                    $idList
                );
                $map = [];
                foreach ($stationRows as $sr) {
                    $map[(string)$sr['id']] = $sr['station_name'];
                }
                if (!empty($map)) {
                    $stations = (object)$map;
                }
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
            'stations' => $stations,
        ]);
        break;

    case 'get_lan_networks':
        // Sibling-consumption side of Feature B: a never-paired device pulls the
        // client's announced default hotspot networks so its auto-join engine can
        // join one that's in range. Hotspot creds only (router creds are never
        // relayed). See plans/playground-first-launch-onboarding.md.
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        $rows = $db->fetchAll(
            'SELECT ssid, password, source, version FROM lan_networks
             WHERE client_id = ? AND is_default = 1 ORDER BY updated_at DESC',
            [$userId]
        );
        $networks = [];
        foreach ($rows as $r) {
            $networks[] = [
                'ssid' => $r['ssid'],
                'password' => $r['password'],
                'source' => $r['source'],
                'version' => (int)$r['version'],
            ];
        }
        Logger::log('playground', $method, 'get_lan_networks', $userId, [], ['count' => count($networks)], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, ['networks' => $networks]);
        break;

    case 'announce_lan_network':
    case 'withdraw_lan_network':
        // RETIRED: hotspot creds are now authored in studio and pushed DOWN on
        // sync (see plans/studio-authoritative-hotspot-creds.md). The old upload
        // path is gone. We keep these endpoints as harmless no-ops so older
        // playground clients in a half-migrated fleet don't error AND can't
        // overwrite the studio-authored row. Studio remains the sole author.
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        Logger::log('playground', $method, $action, $userId, [], ['retired' => true], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, ['success' => true, 'retired' => true]);
        break;

    case 'set_default_mother':
        // Inventory only (no secret leaves the device): record which machine is
        // the client's canonical mother for the admin dashboard. on_off=0 clears.
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $client = requirePlaygroundClient($db);
        $userId = $client['id'];
        $deviceId = $client['device_id'] ?? null;
        if (!$deviceId) {
            jsonResponse(['error' => 'No device bound to this token'], 400);
        }
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $on = array_key_exists('is_default_mother', $body) ? (int)!empty($body['is_default_mother']) : 1;
        $motherUuid = isset($body['mother_uuid']) ? substr((string)$body['mother_uuid'], 0, 64) : null;
        $db->query(
            'UPDATE devices SET is_default_mother = ?, mother_uuid = COALESCE(?, mother_uuid)
             WHERE id = ? AND client_id = ?',
            [$on, $motherUuid, $deviceId, $userId]
        );
        Logger::log('playground', $method, 'set_default_mother', $userId, ['device_id' => $deviceId], ['on' => $on], 200, 'playground');
        jsonResponseWithAuthState($db, $userId, ['success' => true]);
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

    // Cascade: a scenario whose game type is disabled for this client is never
    // accessible - even direct-by-uniqid fetches (the manifest already hides it).
    $disabledTypes = playgroundDisabledTypes($db, $client);
    if ($disabledTypes && in_array($scenario['game_type'] ?? '', $disabledTypes, true)) {
        return false;
    }

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
