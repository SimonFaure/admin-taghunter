<?php
// Launched-games / multiplayer state endpoints (slice 3).
// All actions require a valid playground bearer token. client_id is sourced
// from the token; cross-client access returns 404 to avoid leakage.
//
// Action set:
//   create               POST   create a new launched game (single transaction)
//   list                 GET    list this client's launched games
//   list_active          GET    convenience: list where ended=0
//   get_meta             GET    KV meta for a game
//   update_meta          POST   replace meta atomically
//   state                GET    1s poll: ended + teams + new raw_data since cursor
//   record_punch         POST   append a punch event
//   update_team_score    POST   update teams.score
//   end_team             POST   set teams.end_time
//   end_game             POST   set launched_games.ended = 1
//   delete_game          POST   DELETE launched_games (FK cascade handles children)
//   register_device      POST   add the calling device to launched_game_devices

require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/PlaygroundAuth.php';

SecurityHeaders::setHeaders();
setCorsHeaders();

header('Content-Type: application/json');

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

// Ensure a launched_games row exists and belongs to the authenticated client.
// Returns the row, or terminates with 404 (don't leak existence to other clients).
function requireLaunchedGameOwned($db, int $launchedGameId, int $clientId): array {
    $row = $db->fetch(
        'SELECT * FROM launched_games WHERE id = ? AND client_id = ?',
        [$launchedGameId, $clientId]
    );
    if (!$row) {
        jsonResponse(['error' => 'Launched game not found'], 404);
    }
    return $row;
}

// Ensure a teams row's parent launched_games is owned by the caller.
// Returns the team row, or 404.
function requireTeamOwned($db, int $teamId, int $clientId): array {
    $row = $db->fetch(
        'SELECT t.* FROM teams t
         INNER JOIN launched_games lg ON lg.id = t.launched_game_id
         WHERE t.id = ? AND lg.client_id = ?',
        [$teamId, $clientId]
    );
    if (!$row) {
        jsonResponse(['error' => 'Team not found'], 404);
    }
    return $row;
}

// Draw an unused team name from the configured pool, or null if no name should
// be drawn (pool disabled, missing audience/language, empty/exhausted pool, or
// tables not migrated). Candidate set = global catalog ∪ this client's pool for
// (audience, language); names already used by any team in this game are
// excluded so concurrent multi-station bips never collide. Uniqueness holds
// because both the read of used-names and the INSERT happen server-side.
function drawTeamNameFromPool($db, int $launchedGameId, int $clientId): ?string {
    try {
        $metaRows = $db->fetchAll(
            'SELECT meta_name, meta_value FROM launched_game_meta WHERE launched_game_id = ?',
            [$launchedGameId]
        );
        $meta = [];
        foreach ($metaRows as $r) { $meta[$r['meta_name']] = $r['meta_value']; }
        if (($meta['useNamePool'] ?? '') !== 'true') return null;
        // Normalize legacy game_public values onto the canonical trio
        // (mirror of src/types/audience.ts normalizeAudience).
        $audience = strtolower(trim($meta['namePoolAudience'] ?? ''));
        if (in_array($audience, ['adults', 'adult', 'adultes', 'teens', 'ado'], true)) {
            $audience = 'ado_adultes';
        }
        $language = strtolower($meta['language'] ?? '');
        if (!in_array($audience, ['mini_kids', 'kids', 'ado_adultes'], true) || $language === '') return null;

        $candidates = $db->fetchAll(
            'SELECT name FROM team_name_pools
             WHERE (client_id IS NULL OR client_id = ?) AND audience = ? AND language = ?',
            [$clientId, $audience, $language]
        );
        if (empty($candidates)) return null;

        $used = [];
        $usedRows = $db->fetchAll(
            'SELECT team_name FROM teams WHERE launched_game_id = ? AND team_name IS NOT NULL',
            [$launchedGameId]
        );
        foreach ($usedRows as $u) { $used[mb_strtolower(trim($u['team_name']))] = true; }

        $free = [];
        foreach ($candidates as $c) {
            if (!isset($used[mb_strtolower(trim($c['name']))])) $free[] = $c['name'];
        }
        if (empty($free)) return null;
        return $free[random_int(0, count($free) - 1)];
    } catch (Exception $e) {
        return null; // tables not migrated / any failure -> keep caller's fallback
    }
}

try {
    $db = Database::getInstance();
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    // Every action below requires authentication.
    $client = requirePlaygroundClient($db);
    $clientId = (int)$client['id'];
    $authDeviceId = isset($client['device_id']) ? (int)$client['device_id'] : null;

    switch ($action) {

    case 'create':
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $data = getRequestData();
        $gameUniqid = $data['game_uniqid'] ?? null;
        $name = $data['name'] ?? null;
        $numberOfTeams = isset($data['number_of_teams']) ? (int)$data['number_of_teams'] : 0;
        $gameType = $data['game_type'] ?? null;
        $duration = isset($data['duration']) ? (int)$data['duration'] : 0;
        $started = !empty($data['started']) ? 1 : 0;
        $startTime = $started ? date('Y-m-d H:i:s') : null;
        $meta = isset($data['meta']) && is_array($data['meta']) ? $data['meta'] : [];
        $teams = isset($data['teams']) && is_array($data['teams']) ? $data['teams'] : [];
        $idempotencyKey = isset($data['idempotency_key']) && $data['idempotency_key'] !== ''
            ? substr((string)$data['idempotency_key'], 0, 64)
            : null;

        if (!$gameUniqid || !$name || !$gameType || $numberOfTeams <= 0) {
            jsonResponse(['error' => 'game_uniqid, name, game_type, number_of_teams are required'], 400);
        }

        // Idempotency short-circuit: if the client retried with the same key,
        // return the row created on the first successful attempt instead of
        // INSERTing a duplicate. Re-register the device so the response shape
        // matches (the original device_row_id is no longer reachable, but the
        // registration is idempotent and the new row id is what the caller
        // actually needs).
        if ($idempotencyKey !== null) {
            $existing = $db->fetch(
                'SELECT id FROM launched_games WHERE client_id = ? AND idempotency_key = ?',
                [$clientId, $idempotencyKey]
            );
            if ($existing) {
                $existingId = (int)$existing['id'];
                $deviceRowId = null;
                if ($authDeviceId !== null) {
                    $db->execute(
                        'INSERT INTO launched_game_devices (launched_game_id, device_id, connected)
                         VALUES (?, ?, 1)
                         ON DUPLICATE KEY UPDATE connected = 1, last_connection_attempt = CURRENT_TIMESTAMP',
                        [$existingId, $authDeviceId]
                    );
                    $existingDevice = $db->fetch(
                        'SELECT id FROM launched_game_devices WHERE launched_game_id = ? AND device_id = ?',
                        [$existingId, $authDeviceId]
                    );
                    if ($existingDevice) $deviceRowId = (int)$existingDevice['id'];
                }
                jsonResponseWithAuthState($db, $clientId, [
                    'id' => $existingId,
                    'device_row_id' => $deviceRowId,
                    'idempotent_replay' => true,
                ]);
            }
        }

        $db->execute('START TRANSACTION');
        try {
            $db->execute(
                'INSERT INTO launched_games
                   (client_id, idempotency_key, game_uniqid, name, number_of_teams, game_type, duration, start_time, started, ended)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
                [$clientId, $idempotencyKey, $gameUniqid, $name, $numberOfTeams, $gameType, $duration, $startTime, $started]
            );
            $launchedGameId = (int)$db->lastInsertId();

            foreach ($meta as $k => $v) {
                if (!is_string($k)) continue;
                $db->execute(
                    'INSERT INTO launched_game_meta (launched_game_id, meta_name, meta_value) VALUES (?, ?, ?)',
                    [$launchedGameId, (string)$k, $v === null ? null : (string)$v]
                );
            }

            // Register the creating device.
            $deviceRowId = null;
            if ($authDeviceId !== null) {
                $db->execute(
                    'INSERT INTO launched_game_devices (launched_game_id, device_id, connected)
                     VALUES (?, ?, 1)',
                    [$launchedGameId, $authDeviceId]
                );
                $deviceRowId = (int)$db->lastInsertId();
            }

            foreach ($teams as $t) {
                $teamNumber = isset($t['team_number']) ? (int)$t['team_number'] : 0;
                $teamName = $t['team_name'] ?? null;
                $pattern = isset($t['pattern']) ? (int)$t['pattern'] : 0;
                $keyId = isset($t['key_id']) && $t['key_id'] !== '' ? (int)$t['key_id'] : null;
                $language = isset($t['language']) && $t['language'] !== '' ? (string)$t['language'] : null;
                if ($teamNumber <= 0) continue;
                $db->execute(
                    'INSERT INTO teams (launched_game_id, team_number, team_name, pattern, score, key_id, language)
                     VALUES (?, ?, ?, ?, 0, ?, ?)',
                    [$launchedGameId, $teamNumber, $teamName, $pattern, $keyId, $language]
                );
            }

            $db->execute('COMMIT');

            Logger::log('launched_games', $method, 'create', $clientId,
                ['game_uniqid' => $gameUniqid, 'teams' => count($teams)],
                ['id' => $launchedGameId], 200, 'playground');
            jsonResponseWithAuthState($db, $clientId, ['id' => $launchedGameId, 'device_row_id' => $deviceRowId]);
        } catch (PDOException $e) {
            try { $db->execute('ROLLBACK'); } catch (Exception $rb) { /* swallow */ }
            // Race: a concurrent retry won the unique(client_id, idempotency_key)
            // insert between our pre-check and this INSERT. MySQL error code 1062
            // (SQLSTATE 23000) signals the duplicate; load and return that row.
            if ($idempotencyKey !== null && ($e->errorInfo[1] ?? null) === 1062) {
                $existing = $db->fetch(
                    'SELECT id FROM launched_games WHERE client_id = ? AND idempotency_key = ?',
                    [$clientId, $idempotencyKey]
                );
                if ($existing) {
                    jsonResponseWithAuthState($db, $clientId, [
                        'id' => (int)$existing['id'],
                        'device_row_id' => null,
                        'idempotent_replay' => true,
                    ]);
                }
            }
            throw $e;
        } catch (Exception $e) {
            try { $db->execute('ROLLBACK'); } catch (Exception $rb) { /* swallow */ }
            throw $e;
        }
        break;

    case 'list':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $endedFilter = $_GET['ended'] ?? 'all';
        $where = 'WHERE client_id = ?';
        $args = [$clientId];
        if ($endedFilter === '0') { $where .= ' AND ended = 0'; }
        elseif ($endedFilter === '1') { $where .= ' AND ended = 1'; }
        $games = $db->fetchAll(
            "SELECT id, game_uniqid, name, number_of_teams, game_type, duration, start_time, started, ended, created_at, updated_at
             FROM launched_games $where
             ORDER BY created_at DESC",
            $args
        );
        jsonResponseWithAuthState($db, $clientId, ['games' => $games]);
        break;

    case 'list_active':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $games = $db->fetchAll(
            'SELECT id, game_uniqid, name, game_type, duration
             FROM launched_games
             WHERE client_id = ? AND ended = 0
             ORDER BY created_at DESC',
            [$clientId]
        );
        jsonResponseWithAuthState($db, $clientId, ['games' => $games]);
        break;

    case 'get_meta':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        requireLaunchedGameOwned($db, $id, $clientId);
        $rows = $db->fetchAll(
            'SELECT meta_name, meta_value FROM launched_game_meta WHERE launched_game_id = ?',
            [$id]
        );
        $meta = [];
        foreach ($rows as $r) { $meta[$r['meta_name']] = $r['meta_value']; }
        jsonResponseWithAuthState($db, $clientId, ['meta' => $meta]);
        break;

    case 'update_meta':
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $data = getRequestData();
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        $meta = isset($data['meta']) && is_array($data['meta']) ? $data['meta'] : [];
        requireLaunchedGameOwned($db, $id, $clientId);
        $db->execute('START TRANSACTION');
        try {
            $db->execute('DELETE FROM launched_game_meta WHERE launched_game_id = ?', [$id]);
            foreach ($meta as $k => $v) {
                if (!is_string($k)) continue;
                $db->execute(
                    'INSERT INTO launched_game_meta (launched_game_id, meta_name, meta_value) VALUES (?, ?, ?)',
                    [$id, (string)$k, $v === null ? null : (string)$v]
                );
            }
            $db->execute('COMMIT');
        } catch (Exception $e) {
            try { $db->execute('ROLLBACK'); } catch (Exception $rb) { /* swallow */ }
            throw $e;
        }
        jsonResponseWithAuthState($db, $clientId, ['success' => true]);
        break;

    case 'state':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        $sinceRawId = isset($_GET['since_raw_id']) ? (int)$_GET['since_raw_id'] : 0;
        $game = requireLaunchedGameOwned($db, $id, $clientId);

        $teams = $db->fetchAll(
            'SELECT id, team_number, team_name, pattern, score, key_id, start_time, end_time, language
             FROM teams WHERE launched_game_id = ? ORDER BY team_number ASC',
            [$id]
        );
        $newRaw = $db->fetchAll(
            'SELECT id, device_id, raw_data, created_at
             FROM launched_game_raw_data
             WHERE launched_game_id = ? AND id > ?
             ORDER BY id ASC',
            [$id, $sinceRawId]
        );
        // Decode raw_data JSON columns into arrays so the client doesn't double-parse.
        $lastRawId = $sinceRawId;
        foreach ($newRaw as &$r) {
            $r['raw_data'] = $r['raw_data'] !== null ? json_decode($r['raw_data'], true) : null;
            if ((int)$r['id'] > $lastRawId) { $lastRawId = (int)$r['id']; }
        }
        unset($r);

        jsonResponseWithAuthState($db, $clientId, [
            'id' => (int)$game['id'],
            'name' => $game['name'],
            'game_uniqid' => $game['game_uniqid'],
            'game_type' => $game['game_type'],
            'duration' => (int)$game['duration'],
            'start_time' => $game['start_time'],
            'ended' => (bool)$game['ended'],
            'started' => (bool)$game['started'],
            'teams' => $teams,
            'new_raw_data' => $newRaw,
            'last_raw_id' => $lastRawId,
        ]);
        break;

    case 'raw_data_for_chip':
        // Returns the most recent raw_data rows for a specific chip in a game.
        // Used by tagquest cheat detection (compare current vs previous punches).
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $launchedGameId = isset($_GET['launched_game_id']) ? (int)$_GET['launched_game_id'] : 0;
        $chipId = isset($_GET['chip_id']) ? (int)$_GET['chip_id'] : 0;
        $limit = isset($_GET['limit']) ? max(1, min(50, (int)$_GET['limit'])) : 2;
        requireLaunchedGameOwned($db, $launchedGameId, $clientId);
        // raw_data is JSON; the chip id is at $.id. JSON_EXTRACT returns the
        // value (numeric or string), JSON_UNQUOTE strips quotes if string.
        $rows = $db->fetchAll(
            "SELECT id, device_id, raw_data, created_at
             FROM launched_game_raw_data
             WHERE launched_game_id = ?
               AND CAST(JSON_UNQUOTE(JSON_EXTRACT(raw_data, '$.id')) AS UNSIGNED) = ?
             ORDER BY id DESC
             LIMIT $limit",
            [$launchedGameId, $chipId]
        );
        foreach ($rows as &$r) {
            $r['raw_data'] = $r['raw_data'] !== null ? json_decode($r['raw_data'], true) : null;
        }
        unset($r);
        jsonResponseWithAuthState($db, $clientId, ['rows' => $rows]);
        break;

    case 'record_punch':
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $data = getRequestData();
        $launchedGameId = isset($data['launched_game_id']) ? (int)$data['launched_game_id'] : 0;
        $rawData = $data['raw_data'] ?? null;
        if ($rawData === null) {
            jsonResponse(['error' => 'raw_data is required'], 400);
        }
        if ($authDeviceId === null) {
            jsonResponse(['error' => 'Token has no device_id; cannot record punch'], 400);
        }
        requireLaunchedGameOwned($db, $launchedGameId, $clientId);
        $db->execute(
            'INSERT INTO launched_game_raw_data (launched_game_id, device_id, raw_data) VALUES (?, ?, ?)',
            [$launchedGameId, $authDeviceId, json_encode($rawData)]
        );
        $rawId = (int)$db->lastInsertId();
        jsonResponseWithAuthState($db, $clientId, ['id' => $rawId]);
        break;

    case 'update_team':
        // Partial-field update of a team row. Accepts any subset of:
        //   score (int), team_name (string), start_time (bigint), end_time (bigint),
        //   language (2-letter ISO string|null). Only fields present in the body are updated.
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $data = getRequestData();
        $teamId = isset($data['team_id']) ? (int)$data['team_id'] : 0;
        requireTeamOwned($db, $teamId, $clientId);
        $sets = [];
        $args = [];
        if (array_key_exists('score', $data)) {
            $sets[] = 'score = ?';
            $args[] = (int)$data['score'];
        }
        if (array_key_exists('team_name', $data)) {
            $sets[] = 'team_name = ?';
            $args[] = $data['team_name'] === null ? null : (string)$data['team_name'];
        }
        if (array_key_exists('start_time', $data)) {
            $sets[] = 'start_time = ?';
            $args[] = $data['start_time'] === null ? null : (int)$data['start_time'];
        }
        if (array_key_exists('end_time', $data)) {
            $sets[] = 'end_time = ?';
            $args[] = $data['end_time'] === null ? null : (int)$data['end_time'];
        }
        if (array_key_exists('language', $data)) {
            $sets[] = 'language = ?';
            $args[] = $data['language'] === null ? null : (string)$data['language'];
        }
        if (count($sets) === 0) {
            jsonResponseWithAuthState($db, $clientId, ['success' => true, 'noop' => true]);
        }
        $args[] = $teamId;
        $db->execute('UPDATE teams SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
        jsonResponseWithAuthState($db, $clientId, ['success' => true]);
        break;

    case 'add_team':
        // Add a team to an existing launched game (mid-game roster edits).
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $data = getRequestData();
        $launchedGameId = isset($data['launched_game_id']) ? (int)$data['launched_game_id'] : 0;
        $teamNumber = isset($data['team_number']) ? (int)$data['team_number'] : 0;
        $teamName = isset($data['team_name']) ? (string)$data['team_name'] : null;
        $pattern = isset($data['pattern']) ? (int)$data['pattern'] : 0;
        $keyId = isset($data['key_id']) && $data['key_id'] !== null ? (int)$data['key_id'] : null;
        $language = isset($data['language']) && $data['language'] !== '' ? (string)$data['language'] : null;
        $drawFromPool = !empty($data['draw_from_pool']);
        if ($teamNumber <= 0) jsonResponse(['error' => 'team_number is required'], 400);
        requireLaunchedGameOwned($db, $launchedGameId, $clientId);
        // Name pool: when the launch enabled it, replace the key_name fallback
        // with a drawn pooled name (server-side for cross-station uniqueness).
        if ($drawFromPool) {
            $drawn = drawTeamNameFromPool($db, $launchedGameId, $clientId);
            if ($drawn !== null) { $teamName = $drawn; }
        }
        // Multi-station safety: at most one active (end_time IS NULL) team per
        // (launched_game, key_id). A concurrent add_team for a card that already
        // has an active run returns that team instead of inserting a duplicate.
        // (key_id null skips the guard — never deduped.)
        if ($keyId !== null) {
            $existing = $db->fetch(
                'SELECT id FROM teams WHERE launched_game_id = ? AND key_id = ? AND end_time IS NULL LIMIT 1',
                [$launchedGameId, $keyId]
            );
            if ($existing) {
                jsonResponseWithAuthState($db, $clientId, ['id' => (int)$existing['id'], 'deduped' => true]);
                break;
            }
        }
        $db->execute(
            'INSERT INTO teams (launched_game_id, team_number, team_name, pattern, score, key_id, language)
             VALUES (?, ?, ?, ?, 0, ?, ?)',
            [$launchedGameId, $teamNumber, $teamName, $pattern, $keyId, $language]
        );
        $newId = (int)$db->lastInsertId();
        jsonResponseWithAuthState($db, $clientId, ['id' => $newId]);
        break;

    case 'end_team':
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $data = getRequestData();
        $teamId = isset($data['team_id']) ? (int)$data['team_id'] : 0;
        $endTime = isset($data['end_time']) ? (int)$data['end_time'] : null;
        requireTeamOwned($db, $teamId, $clientId);
        $db->execute('UPDATE teams SET end_time = ? WHERE id = ?', [$endTime, $teamId]);
        jsonResponseWithAuthState($db, $clientId, ['success' => true]);
        break;

    case 'end_game':
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $data = getRequestData();
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        requireLaunchedGameOwned($db, $id, $clientId);
        $db->execute('UPDATE launched_games SET ended = 1 WHERE id = ?', [$id]);
        jsonResponseWithAuthState($db, $clientId, ['success' => true]);
        break;

    case 'delete_game':
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $data = getRequestData();
        $id = isset($data['id']) ? (int)$data['id'] : 0;
        requireLaunchedGameOwned($db, $id, $clientId);
        // FK ON DELETE CASCADE removes meta, devices, raw_data, teams.
        $db->execute('DELETE FROM launched_games WHERE id = ? AND client_id = ?', [$id, $clientId]);
        jsonResponseWithAuthState($db, $clientId, ['success' => true]);
        break;

    case 'register_device':
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $data = getRequestData();
        $launchedGameId = isset($data['launched_game_id']) ? (int)$data['launched_game_id'] : 0;
        if ($authDeviceId === null) {
            jsonResponse(['error' => 'Token has no device_id'], 400);
        }
        requireLaunchedGameOwned($db, $launchedGameId, $clientId);
        // Idempotent: ON DUPLICATE KEY just refreshes connected + last_connection_attempt.
        $db->execute(
            'INSERT INTO launched_game_devices (launched_game_id, device_id, connected)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE connected = 1, last_connection_attempt = CURRENT_TIMESTAMP',
            [$launchedGameId, $authDeviceId]
        );
        jsonResponseWithAuthState($db, $clientId, ['success' => true]);
        break;

    case 'get_devices':
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        requireLaunchedGameOwned($db, $id, $clientId);
        $devices = $db->fetchAll(
            'SELECT lgd.id, lgd.device_id, lgd.connected, lgd.last_connection_attempt,
                    d.device_label, d.os, d.os_version
             FROM launched_game_devices lgd
             INNER JOIN devices d ON d.id = lgd.device_id
             WHERE lgd.launched_game_id = ?',
            [$id]
        );
        jsonResponseWithAuthState($db, $clientId, ['devices' => $devices]);
        break;

    case 'list_completed_quests':
        // Returns all team_completed_quests rows for a team (or for the whole
        // game if team_id omitted). Used by tagquest scoring to compute current
        // scores from scratch on each punch.
        if ($method !== 'GET') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $launchedGameId = isset($_GET['launched_game_id']) ? (int)$_GET['launched_game_id'] : 0;
        $teamId = isset($_GET['team_id']) ? (int)$_GET['team_id'] : 0;
        requireLaunchedGameOwned($db, $launchedGameId, $clientId);
        if ($teamId > 0) {
            // Verify the team belongs to this game (and so to this client).
            $check = $db->fetch(
                'SELECT id FROM teams WHERE id = ? AND launched_game_id = ?',
                [$teamId, $launchedGameId]
            );
            if (!$check) jsonResponse(['error' => 'Team not found'], 404);
            $rows = $db->fetchAll(
                'SELECT id, team_id, quest_number, points_awarded, teammate_chip_id, created_at
                 FROM team_completed_quests WHERE team_id = ? ORDER BY id ASC',
                [$teamId]
            );
        } else {
            $rows = $db->fetchAll(
                'SELECT id, team_id, quest_number, points_awarded, teammate_chip_id, created_at
                 FROM team_completed_quests WHERE launched_game_id = ? ORDER BY id ASC',
                [$launchedGameId]
            );
        }
        jsonResponseWithAuthState($db, $clientId, ['rows' => $rows]);
        break;

    case 'record_completed_quest':
        // Insert (speed mode) or upsert (score mode handles re-completion via
        // an explicit allow_duplicates flag) a quest-completion row.
        if ($method !== 'POST') {
            jsonResponse(['error' => 'Method not allowed'], 405);
        }
        $data = getRequestData();
        $launchedGameId = isset($data['launched_game_id']) ? (int)$data['launched_game_id'] : 0;
        $teamId = isset($data['team_id']) ? (int)$data['team_id'] : 0;
        $questNumber = isset($data['quest_number']) ? (string)$data['quest_number'] : '';
        $pointsAwarded = isset($data['points_awarded']) ? (int)$data['points_awarded'] : 0;
        $teammateChipId = isset($data['teammate_chip_id']) && $data['teammate_chip_id'] !== null ? (int)$data['teammate_chip_id'] : null;
        $allowDuplicates = !empty($data['allow_duplicates']);

        requireLaunchedGameOwned($db, $launchedGameId, $clientId);
        $team = $db->fetch(
            'SELECT id FROM teams WHERE id = ? AND launched_game_id = ?',
            [$teamId, $launchedGameId]
        );
        if (!$team) jsonResponse(['error' => 'Team not found'], 404);

        if (!$allowDuplicates) {
            // Speed-mode: only insert if not already present.
            $existing = $db->fetch(
                'SELECT id FROM team_completed_quests WHERE team_id = ? AND quest_number = ?',
                [$teamId, $questNumber]
            );
            if ($existing) {
                jsonResponseWithAuthState($db, $clientId, ['inserted' => false, 'id' => (int)$existing['id']]);
            }
        }
        $db->execute(
            'INSERT INTO team_completed_quests (launched_game_id, team_id, teammate_chip_id, quest_number, points_awarded)
             VALUES (?, ?, ?, ?, ?)',
            [$launchedGameId, $teamId, $teammateChipId, $questNumber, $pointsAwarded]
        );
        $newId = (int)$db->lastInsertId();
        jsonResponseWithAuthState($db, $clientId, ['inserted' => true, 'id' => $newId]);
        break;

    default:
        Logger::log('launched_games', $method, $action ?: 'none', null, [], ['error' => 'Invalid action'], 400, 'playground');
        jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    $errorDetails = [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
    ];
    try {
        Logger::log('launched_games', $_SERVER['REQUEST_METHOD'], $_GET['action'] ?? 'unknown', null, $_GET, $errorDetails, 500, 'playground');
    } catch (Exception $logError) { /* swallow */ }

    jsonResponse([
        'error' => 'Internal server error',
        'message' => $e->getMessage(),
    ], 500);
}
