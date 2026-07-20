<?php

// Tag Hunter GO cloud endpoints. Serves the player PWA (go.taghunter.fr):
//   - load        (GET, public)  gate + scenario bundle, cached offline by the PWA
//   - score       (POST, public) idempotent leaderboard upsert from a team phone
//   - leaderboard (GET, client)  ranked scores for the animateur (Studio space)
// Design: memory project_taghunter_go / plans/tag-hunter-go.md (Phase 3).
//
// `load`/`score` are intentionally unauthenticated - players have no account.
// Access is gated at `load` (the online briefing moment); cached games then run
// fully offline. See the gate below.

// CORS: the cross-origin PWA needs exactly ONE Access-Control-Allow-Origin
// header. backend/.htaccess already sets a global `Header always set
// Access-Control-Allow-Origin "*"` (correct for the PWA's non-credentialed
// fetches), so this endpoint must NOT call setCorsHeaders() too - doing both
// emits a duplicate ACAO and browsers reject the response. We only answer the
// preflight here; the .htaccess supplies the actual CORS headers.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

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

// This endpoint serves two apps from one codebase (project_taghunter_drop): GO
// and Drop. Normalize the `app` selector; anything but 'drop' is GO (the default
// keeps every existing GO caller unchanged).
function requestApp($raw) {
    return ($raw === 'drop') ? 'drop' : 'go';
}

// Absolute base for media URLs. The PWA is cross-origin (go.taghunter.fr) and
// caches these once online, so they must be absolute. Derived from the host
// serving this endpoint (same origin as /media); override with GO_MEDIA_BASE.
function mediaBaseUrl() {
    if (defined('GO_MEDIA_BASE') && GO_MEDIA_BASE) return rtrim(GO_MEDIA_BASE, '/');
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') == 443)
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return "$scheme://$host";
}

function mediaUrl($uniqid, $filename) {
    if (!$filename) return null;
    // Route media through go.php?action=media (NOT the raw /media path) so the
    // cross-origin PWA gets CORS headers and can fetch()+cache it offline.
    // SCRIPT_NAME is this endpoint's own path (e.g. /backend/api/go.php).
    $name = basename($filename); // tolerate legacy "/media/<uniqid>/x" values
    $self = $_SERVER['SCRIPT_NAME'] ?? '/backend/api/go.php';
    return mediaBaseUrl() . $self . '?action=media&u=' . rawurlencode($uniqid) . '&f=' . rawurlencode($name);
}

// Content types for the media proxy.
function goMediaContentType($path) {
    static $types = [
        'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif', 'webp' => 'image/webp', 'svg' => 'image/svg+xml',
        'mp3' => 'audio/mpeg', 'ogg' => 'audio/ogg', 'wav' => 'audio/wav', 'm4a' => 'audio/mp4',
        'woff' => 'font/woff', 'woff2' => 'font/woff2', 'ttf' => 'font/ttf', 'otf' => 'font/otf',
    ];
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    return $types[$ext] ?? 'application/octet-stream';
}

// Build enigma-number -> correct letter from a GO pattern's pattern_data
// ([{index, assignments:{A:'good'|'wrong'|...}}]). The correct letter is the one
// mapped to the 'good' slot. Returns [] when no usable pattern.
function correctLettersFromPattern($patternDataJson) {
    $out = [];
    if (!$patternDataJson) return $out;
    $rows = json_decode($patternDataJson, true);
    if (!is_array($rows)) return $out;
    foreach ($rows as $row) {
        if (!is_array($row) || !isset($row['index']) || !is_array($row['assignments'] ?? null)) continue;
        foreach ($row['assignments'] as $letter => $slot) {
            if ($slot === 'good') {
                $out[(string)$row['index']] = $letter;
                break;
            }
        }
    }
    return $out;
}

try {
    $db = Database::getInstance();

    // Pin this endpoint's connection to UTC so leaderboard time ranges are
    // unambiguous across deployments. go_scores.updated_at is a TIMESTAMP (stored
    // as an absolute UTC instant internally), so this needs no data migration -
    // it just normalizes how `CURRENT_TIMESTAMP` writes and how rows read back.
    // The operator's browser computes each range's bounds in its OWN timezone and
    // sends them as UTC datetimes (see the leaderboard action), so "Today" always
    // means the viewing operator's local day, anywhere in the world.
    $db->execute("SET time_zone = '+00:00'");

    $action = $_GET['action'] ?? '';

    switch ($action) {

    // ---- media: CORS-friendly proxy for scenario media (bg/sounds/fonts) -----
    // The PWA is cross-origin; serving media through this endpoint (vs the raw
    // /media path) gives it the CORS headers from setCorsHeaders() so fetch()
    // works and the asset can be cached offline. Public scenario media only -
    // same exposure as the existing static /media serving.
    case 'media': {
        $u = preg_replace('/[^A-Za-z0-9_-]/', '', (string)($_GET['u'] ?? ''));
        $f = basename((string)($_GET['f'] ?? ''));
        if ($u === '' || $f === '') {
            http_response_code(400);
            exit;
        }
        $base = realpath(__DIR__ . '/../../media/' . $u);
        $path = realpath(__DIR__ . '/../../media/' . $u . '/' . $f);
        // Guard against path traversal: the resolved file must live under the
        // scenario's own media dir.
        if (!$base || !$path || strncmp($path, $base . DIRECTORY_SEPARATOR, strlen($base) + 1) !== 0 || !is_file($path)) {
            http_response_code(404);
            exit;
        }
        header('Content-Type: ' . goMediaContentType($path)); // overrides the JSON header
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: public, max-age=86400');
        readfile($path);
        exit;
    }

    // ---- load: gate + bundle -------------------------------------------------
    case 'load': {
        $clientId = $_GET['c'] ?? $_GET['client'] ?? null;
        $scenarioId = $_GET['s'] ?? $_GET['scenario'] ?? null;

        if (!$clientId || !$scenarioId) {
            jsonResponse(['error' => 'missing_params', 'reason' => 'client and scenario are required'], 400);
        }

        // This endpoint serves two apps (project_taghunter_drop): GO (letter
        // answers, physical panneau) and Drop (on-screen answer-image tiles,
        // linear randomized sequence). `app` selects which gate/grant/bundle to
        // use; default 'go' keeps the existing GO contract unchanged.
        $app = requestApp($_GET['app'] ?? null);

        // (1) Client + per-app capability + billing gate (project_client_app_section).
        // {app}_enabled is the master on/off. Billing is the same overdue_since +
        // grace clock for every app: when billing-ok flips off, clients.php stamps
        // {app}_billing_overdue_since; the app keeps working until
        // now > overdue_since + {app}_billing_grace_days, then locks. (No reprieve
        // - that's a Playground-device concept.)
        if ($app === 'drop') {
            $client = $db->fetch(
                'SELECT id, drop_enabled,
                        drop_billing_overdue_since, drop_billing_grace_days
                 FROM clients WHERE id = ?',
                [$clientId]
            );
            if (!$client) {
                jsonResponse(['error' => 'refused', 'reason' => 'unknown_client'], 403);
            }
            if (empty($client['drop_enabled'])) {
                jsonResponse(['error' => 'refused', 'reason' => 'drop_disabled'], 403);
            }
            $overdueSince = $client['drop_billing_overdue_since'] ?? null;
            $graceDays = (int)($client['drop_billing_grace_days'] ?? 30);
        } else {
            $client = $db->fetch(
                'SELECT id, go_enabled, go_subscription_active,
                        go_billing_overdue_since, go_billing_grace_days
                 FROM clients WHERE id = ?',
                [$clientId]
            );
            if (!$client) {
                jsonResponse(['error' => 'refused', 'reason' => 'unknown_client'], 403);
            }
            if (empty($client['go_enabled'])) {
                jsonResponse(['error' => 'refused', 'reason' => 'go_disabled'], 403);
            }
            $overdueSince = $client['go_billing_overdue_since'] ?? null;
            $graceDays = (int)($client['go_billing_grace_days'] ?? 30);
        }
        if (!empty($overdueSince)) {
            $overdueTs = strtotime($overdueSince);
            if ($overdueTs !== false && time() > $overdueTs + $graceDays * 86400) {
                jsonResponse(['error' => 'refused', 'reason' => 'subscription_inactive'], 403);
            }
        }

        // (2) Grant for this (client, scenario) in the requested app's mode +
        // (GO only) bound pattern. Drop uses a distinct mode='drop' grant.
        $grant = $db->fetch(
            'SELECT pattern_id FROM client_scenarios WHERE client_id = ? AND scenario_id = ? AND mode = ?',
            [$clientId, $scenarioId, $app]
        );
        if (!$grant) {
            jsonResponse(['error' => 'refused', 'reason' => 'not_granted'], 403);
        }

        // (3) Scenario + adaptable_go.
        $scenario = $db->fetch(
            'SELECT id, uniqid, title, data, medias, IFNULL(version, "1.0") AS version FROM scenarios WHERE id = ?',
            [$scenarioId]
        );
        if (!$scenario) {
            jsonResponse(['error' => 'refused', 'reason' => 'unknown_scenario'], 403);
        }
        $data = !empty($scenario['data']) ? json_decode($scenario['data'], true) : null;
        $gm = is_array($data) ? ($data['game_meta'] ?? ($data['data']['game_meta'] ?? [])) : [];
        if (empty($gm['adaptable_go'])) {
            jsonResponse(['error' => 'refused', 'reason' => 'not_go'], 403);
        }

        $uniqid = $scenario['uniqid'];
        $medias = !empty($scenario['medias']) ? json_decode($scenario['medias'], true) : [];
        $mImages = is_array($medias['images'] ?? null) ? $medias['images'] : [];
        $mSounds = is_array($medias['sounds'] ?? null) ? $medias['sounds'] : [];

        $warning = null;
        $answerCount = ($gm['go_answer_count'] ?? null) == 4 ? 4 : 2;
        $enigmas = [];

        if ($app === 'drop') {
            // (4/5) Drop: on-screen answer-image tiles. No pattern, no codes - the
            // PWA shuffles enigma order + per-enigma tile order client-side, so the
            // server just ships every answer image with a `correct` flag (the good
            // one). Correctness = "is this the good_answer_image?". The fixed slot
            // list per answer_count: A=good, B=wrong, C=wrong2, D=wrong3.
            $slotFields = $answerCount === 4
                ? ['good_answer_image' => true, 'wrong_answer_image' => false,
                   'wrong_answer_image_2' => false, 'wrong_answer_image_3' => false]
                : ['good_answer_image' => true, 'wrong_answer_image' => false];
            foreach (($gm['enigmas'] ?? []) as $idx => $e) {
                if (!is_array($e)) continue;
                $answers = [];
                foreach ($slotFields as $field => $isCorrect) {
                    $filename = $e[$field] ?? null;
                    $answers[] = [
                        'image_url' => $filename ? mediaUrl($uniqid, $filename) : null,
                        'correct' => $isCorrect,
                    ];
                }
                $enigmas[] = [
                    'number' => $e['number'] ?? (string)($idx + 1),
                    // The enigma name/title (Localized map) - shown above the tiles.
                    'text' => $e['text'] ?? null,
                    'good_points' => $e['good_answer_points'] ?? null,
                    'wrong_points' => $e['wrong_answer_points'] ?? null,
                    'answers' => $answers,
                ];
            }
        } else {
            // (4) GO: resolve the answer key (letters) from the scenario's default
            // GO pattern (one per scenario, set in the editor). Legacy fallback: a
            // pattern_id bound on the grant. If neither, identity (A = good) + warn.
            $correctLetters = [];
            $defaultGoUniqid = $gm['scenario_default_go_pattern'] ?? null;
            if ($defaultGoUniqid) {
                $pattern = $db->fetch('SELECT pattern_data FROM patterns WHERE pattern_uniqid = ? AND mode = "go"', [$defaultGoUniqid]);
                $correctLetters = correctLettersFromPattern($pattern['pattern_data'] ?? null);
            }
            if (!$correctLetters && !empty($grant['pattern_id'])) {
                $pattern = $db->fetch('SELECT pattern_data FROM patterns WHERE id = ? AND mode = "go"', [$grant['pattern_id']]);
                $correctLetters = correctLettersFromPattern($pattern['pattern_data'] ?? null);
            }
            if (!$correctLetters) {
                $warning = 'no_pattern_bound';
            }

            // (5) Letters-only enigmas. NO images leave the server - the visuals
            // live on the physical panneau + carnet. Just code + correct letter.
            foreach (($gm['enigmas'] ?? []) as $e) {
                if (!is_array($e)) continue;
                $num = (string)($e['number'] ?? '');
                $enigmas[] = [
                    'number' => $e['number'] ?? null,
                    'short_code' => isset($e['short_code']) ? strtoupper(trim($e['short_code'])) : null,
                    'correct_letter' => $correctLetters[$num] ?? 'A',
                    'good_points' => $e['good_answer_points'] ?? null,
                    'wrong_points' => $e['wrong_answer_points'] ?? null,
                    // The enigma name/title (Localized map) - shown in the GO header
                    // so the player confirms which panneau they're answering.
                    'text' => $e['text'] ?? null,
                ];
            }
        }

        // (6) Curated scenario meta - the GO payload contract (no dropped-section
        // media). Localized<string> maps pass through so the PWA can do per-team
        // language. The only images downloaded are the background + sounds.
        $textStrings = [];
        foreach ($gm as $k => $v) {
            if (strpos($k, 'text_') === 0) $textStrings[$k] = $v;
        }
        $bgFile = $gm['background_image'] ?? ($mImages['background_image'] ?? null);

        $bundle = [
            'version' => $scenario['version'],
            'app' => $app,
            'scenario_id' => (int)$scenario['id'],
            'go_answer_count' => $answerCount,
            'default_language' => $data['default_language'] ?? 'fr',
            'available_languages' => $data['available_languages'] ?? ['fr'],
            'title' => $gm['title'] ?? $scenario['title'] ?? '',
            'media' => [
                'background_url' => mediaUrl($uniqid, $bgFile),
                'sound_good_url' => mediaUrl($uniqid, $mSounds['enigma_success'] ?? null),
                'sound_wrong_url' => mediaUrl($uniqid, $mSounds['enigma_error'] ?? null),
                // Custom font faces resolved to URLs so the PWA can @font-face them
                // and render with the scenario's font. (Catalog fonts have no faces
                // → the PWA just sets the family name with a fallback.)
                'fonts' => (function () use ($gm, $uniqid) {
                    $out = [];
                    foreach (($gm['custom_fonts'] ?? []) as $cf) {
                        if (!is_array($cf)) continue;
                        $family = $cf['family'] ?? null;
                        foreach (($cf['faces'] ?? []) as $face) {
                            if (!is_array($face) || empty($face['filename'])) continue;
                            $out[] = [
                                'family' => $family,
                                'weight' => $face['weight'] ?? 400,
                                'style' => $face['style'] ?? 'normal',
                                'url' => mediaUrl($uniqid, $face['filename']),
                            ];
                        }
                    }
                    return $out;
                })(),
            ],
            'levels' => $gm['levels'] ?? null,
            'scoring' => [
                'number_of_enigmas' => $gm['number_of_enigmas'] ?? null,
                'points_units' => $gm['points_units'] ?? null,
            ],
            'timer' => [
                'default_time' => $gm['default_time'] ?? null,
                'default_time_malus' => $gm['default_time_malus'] ?? null,
                'late_malus' => $gm['late_malus'] ?? null,
            ],
            'typography' => [
                'font' => $gm['font'] ?? null,
                'font_color' => $gm['font_color'] ?? null,
                'custom_fonts' => $gm['custom_fonts'] ?? null,
            ],
            'ui_strings' => $textStrings,
            'enigmas' => $enigmas,
        ];
        if ($warning) $bundle['warning'] = $warning;

        // (7) Usage tracking - the gated, reliably-online moment. `app` separates
        // GO vs Drop loads in the shared table.
        $db->execute(
            'INSERT INTO go_loads (client_id, scenario_id, app) VALUES (?, ?, ?)',
            [$clientId, $scenarioId, $app]
        );

        Logger::log('go', 'GET', 'load', null, ['c' => $clientId, 's' => $scenarioId, 'app' => $app], ['ok' => true, 'enigmas' => count($enigmas), 'warning' => $warning], 200, 'go');
        jsonResponse($bundle);
        break;
    }

    // ---- score: idempotent leaderboard upsert -------------------------------
    case 'score': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        $d = getRequestData();
        $teamUuid = trim((string)($d['team_uuid'] ?? ''));
        $clientId = $d['client'] ?? $d['client_id'] ?? null;
        $scenarioId = $d['scenario'] ?? $d['scenario_id'] ?? null;

        // team_uuid identifies the single device that owns this team's row (no
        // cross-device merge). One game = one row, time-stamped for the operator's
        // time-range leaderboard.
        if ($teamUuid === '' || !$clientId || !$scenarioId) {
            jsonResponse(['error' => 'missing_params', 'reason' => 'team_uuid, client, scenario required'], 400);
        }

        $teamName = isset($d['team_name']) ? mb_substr((string)$d['team_name'], 0, 64) : null;
        $score = (int)($d['score'] ?? 0);
        $level = (int)($d['level'] ?? 0);
        $finished = !empty($d['finished']) ? 1 : 0;
        $elapsed = (int)($d['elapsed_seconds'] ?? 0);
        $app = requestApp($d['app'] ?? null);

        // Last-write-wins upsert keyed by (client, scenario, team_uuid, app) - the
        // `app` discriminator lets the same scenario run in GO and Drop without the
        // two boards colliding on one team_uuid.
        $db->execute(
            'INSERT INTO go_scores
                (client_id, scenario_id, team_uuid, team_name, score, level, finished, elapsed_seconds, app)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                team_name = VALUES(team_name), score = VALUES(score), level = VALUES(level),
                finished = VALUES(finished), elapsed_seconds = VALUES(elapsed_seconds)',
            [$clientId, $scenarioId, $teamUuid, $teamName, $score, $level, $finished, $elapsed, $app]
        );

        jsonResponse(['ok' => true]);
        break;
    }

    // ---- preview: answer-key sheet for a GO scenario (client/admin auth) -----
    // Unlike `load` (letters only - no images ever reach a player), the preview
    // returns the answer IMAGES behind each letter so the operator can lay out
    // the plaques. Gated on the client having GO enabled + a GO grant for the
    // scenario. Powers the editor GO preview and the client scenario-details one.
    case 'preview': {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
        $auth = $token ? TokenManager::validateToken($db, $token) : null;
        if (!$auth) {
            jsonResponse(['error' => 'unauthorized'], 401);
        }
        // Client acts on its own id; an admin may name the client.
        $clientId = ($auth['user_type'] ?? '') === 'client'
            ? $auth['user_id']
            : ($_GET['client_id'] ?? null);
        if (!$clientId) {
            jsonResponse(['error' => 'missing_params', 'reason' => 'client_id required'], 400);
        }
        // GO must be enabled for this client.
        $client = $db->fetch('SELECT id, go_enabled FROM clients WHERE id = ?', [$clientId]);
        if (!$client || empty($client['go_enabled'])) {
            jsonResponse(['error' => 'refused', 'reason' => 'go_disabled'], 403);
        }
        // Scenario by uniqid or id.
        $uniqidParam = $_GET['uniqid'] ?? null;
        $scenarioIdParam = $_GET['s'] ?? $_GET['scenario'] ?? $_GET['scenario_id'] ?? null;
        if ($uniqidParam) {
            $scenario = $db->fetch('SELECT id, uniqid, title, data FROM scenarios WHERE uniqid = ?', [$uniqidParam]);
        } elseif ($scenarioIdParam) {
            $scenario = $db->fetch('SELECT id, uniqid, title, data FROM scenarios WHERE id = ?', [$scenarioIdParam]);
        } else {
            jsonResponse(['error' => 'missing_params', 'reason' => 'uniqid or scenario_id required'], 400);
        }
        if (!$scenario) {
            jsonResponse(['error' => 'refused', 'reason' => 'unknown_scenario'], 403);
        }
        // The client must hold this scenario as a GO grant.
        $grant = $db->fetch(
            'SELECT id FROM client_scenarios WHERE client_id = ? AND scenario_id = ? AND mode = "go"',
            [$clientId, $scenario['id']]
        );
        if (!$grant) {
            jsonResponse(['error' => 'refused', 'reason' => 'not_granted'], 403);
        }
        $data = !empty($scenario['data']) ? json_decode($scenario['data'], true) : null;
        $gm = is_array($data) ? ($data['game_meta'] ?? ($data['data']['game_meta'] ?? [])) : [];
        if (empty($gm['adaptable_go'])) {
            jsonResponse(['error' => 'refused', 'reason' => 'not_go'], 403);
        }

        $uniqid = $scenario['uniqid'];
        $answerCount = ($gm['go_answer_count'] ?? null) == 4 ? 4 : 2;
        $letters = $answerCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B'];

        // Build letter→slot per enigma index from the default GO pattern.
        $rowsByIndex = [];
        $warning = null;
        $defaultGoUniqid = $gm['scenario_default_go_pattern'] ?? null;
        if ($defaultGoUniqid) {
            $pattern = $db->fetch('SELECT pattern_data FROM patterns WHERE pattern_uniqid = ? AND mode = "go"', [$defaultGoUniqid]);
            $parsed = !empty($pattern['pattern_data']) ? json_decode($pattern['pattern_data'], true) : null;
            if (is_array($parsed)) {
                foreach ($parsed as $r) {
                    if (is_array($r) && isset($r['index']) && is_array($r['assignments'] ?? null)) {
                        $rowsByIndex[(string)$r['index']] = $r['assignments'];
                    }
                }
            }
        }
        if (!$rowsByIndex) $warning = 'no_pattern_bound';

        $slotField = [
            'good' => 'good_answer_image', 'wrong' => 'wrong_answer_image',
            'wrong2' => 'wrong_answer_image_2', 'wrong3' => 'wrong_answer_image_3',
        ];

        $enigmas = [];
        foreach (($gm['enigmas'] ?? []) as $idx => $e) {
            if (!is_array($e)) continue;
            $num = (string)($e['number'] ?? ($idx + 1));
            $assign = $rowsByIndex[$num] ?? null;
            $answers = [];
            foreach ($letters as $l) {
                $slot = $assign[$l] ?? ($l === 'A' ? 'good' : 'wrong');
                $field = $slotField[$slot] ?? null;
                $filename = $field ? ($e[$field] ?? null) : null;
                $answers[] = [
                    'letter' => $l,
                    'correct' => $slot === 'good',
                    'image_url' => $filename ? mediaUrl($uniqid, $filename) : null,
                ];
            }
            $enigmas[] = [
                'number' => (string)($e['number'] ?? ($idx + 1)),
                'short_code' => isset($e['short_code']) ? strtoupper(trim($e['short_code'])) : '',
                'answers' => $answers,
            ];
        }

        jsonResponse(['data' => [
            'title' => $gm['title'] ?? $scenario['title'] ?? '',
            'answer_count' => $answerCount,
            'enigmas' => $enigmas,
            'warning' => $warning,
        ]]);
        break;
    }

    // ---- leaderboard: ranked scores for a scenario + time window (client-auth) -
    // Sessions are gone: the operator picks a scenario and a time window and sees
    // every team that played it in that window, ranked by score then time. The
    // window is passed as explicit UTC bounds (from/to, 'Y-m-d H:i:s') - the
    // operator's browser computes them in ITS timezone for "today / this week /
    // …" so the day boundaries follow the viewer, not the server. Both bounds are
    // optional: omit both for "all time"; `from` only for the current period.
    case 'leaderboard': {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        // Animateur views this from their Studio space - require a client/admin token.
        $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
        $auth = $token ? TokenManager::validateToken($db, $token) : null;
        if (!$auth) {
            jsonResponse(['error' => 'unauthorized'], 401);
        }
        $scenarioId = $_GET['scenario_id'] ?? $_GET['scenario'] ?? $_GET['s'] ?? null;
        if (!$scenarioId) {
            jsonResponse(['error' => 'missing_params', 'reason' => 'scenario_id required'], 400);
        }
        $from = trim((string)($_GET['from'] ?? ''));
        $to = trim((string)($_GET['to'] ?? ''));
        $app = requestApp($_GET['app'] ?? null);

        $where = 'scenario_id = ? AND app = ?';
        $params = [$scenarioId, $app];
        // A client may only see their own scores.
        if (($auth['user_type'] ?? '') === 'client') {
            $where .= ' AND client_id = ?';
            $params[] = $auth['user_id'];
        } elseif (!empty($_GET['client_id'])) {
            // An admin may scope to a specific client.
            $where .= ' AND client_id = ?';
            $params[] = $_GET['client_id'];
        }
        // updated_at is UTC (connection pinned above); bounds arrive as UTC too.
        if ($from !== '') { $where .= ' AND updated_at >= ?'; $params[] = $from; }
        if ($to !== '')   { $where .= ' AND updated_at <= ?'; $params[] = $to; }

        $rows = $db->fetchAll(
            "SELECT team_uuid, team_name, score, level, finished, elapsed_seconds, updated_at
             FROM go_scores WHERE $where
             ORDER BY score DESC, elapsed_seconds ASC",
            $params
        );
        jsonResponse(['data' => $rows]);
        break;
    }

    // ---- go_stats: admin usage stats (loads per client+scenario) ------------
    case 'go_stats': {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
        $auth = $token ? TokenManager::validateToken($db, $token) : null;
        if (!$auth || ($auth['user_type'] ?? '') !== 'admin') {
            jsonResponse(['error' => 'unauthorized'], 401);
        }
        $app = requestApp($_GET['app'] ?? null);
        // Loads (the "which client ran which scenario how many times" metric) +
        // teams that actually pushed a score. Scoped to the requested app.
        $byScenario = $db->fetchAll(
            'SELECT l.client_id, c.name AS client_name, l.scenario_id, s.title AS scenario_title,
                    COUNT(*) AS loads
             FROM go_loads l
             LEFT JOIN clients c ON l.client_id = c.id
             LEFT JOIN scenarios s ON l.scenario_id = s.id
             WHERE l.app = ?
             GROUP BY l.client_id, c.name, l.scenario_id, s.title
             ORDER BY loads DESC
             LIMIT 500',
            [$app]
        );
        $totals = $db->fetch(
            'SELECT COUNT(*) AS total_loads, COUNT(DISTINCT client_id) AS clients,
                    COUNT(DISTINCT scenario_id) AS scenarios FROM go_loads WHERE app = ?',
            [$app]
        );
        $teams = $db->fetch('SELECT COUNT(*) AS teams FROM go_scores WHERE app = ?', [$app]);
        jsonResponse(['data' => ['by_scenario' => $byScenario, 'totals' => $totals, 'teams' => $teams]]);
        break;
    }

    // ---- client_go_stats: per-client GO usage stats (client/admin auth) ------
    // The client-portal "GO & Drop Statistics" page. Scoped to the caller's own
    // client_id (an admin may pass ?client_id=). Pairs go_loads (how many times
    // each GO scenario was opened) with go_scores (teams that pushed a score:
    // counts, finish rate, avg/best score, last played). Read-only own data.
    // Design: project_client_app_section (GO/Drop statistics surface).
    case 'client_go_stats': {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
        $auth = $token ? TokenManager::validateToken($db, $token) : null;
        if (!$auth) {
            jsonResponse(['error' => 'unauthorized'], 401);
        }
        // A client only ever sees its own stats; an admin may scope to a client.
        $clientId = ($auth['user_type'] ?? '') === 'client'
            ? $auth['user_id']
            : ($_GET['client_id'] ?? null);
        if (!$clientId) {
            jsonResponse(['error' => 'missing_params', 'reason' => 'client_id required'], 400);
        }
        // Scope to the requested app so the GO and Drop stat sections stay separate.
        $app = requestApp($_GET['app'] ?? null);

        // Per-scenario score aggregates (one go_scores row = one team's game).
        $byScenario = $db->fetchAll(
            'SELECT sc.scenario_id, s.title AS scenario_title,
                    COUNT(*) AS teams,
                    COALESCE(SUM(sc.finished), 0) AS finished,
                    ROUND(AVG(sc.score)) AS avg_score,
                    MAX(sc.score) AS best_score,
                    MAX(sc.updated_at) AS last_played
             FROM go_scores sc
             LEFT JOIN scenarios s ON sc.scenario_id = s.id
             WHERE sc.client_id = ? AND sc.app = ?
             GROUP BY sc.scenario_id, s.title
             ORDER BY teams DESC, last_played DESC',
            [$clientId, $app]
        );

        // Loads per scenario, merged onto the score rows (a scenario can be
        // loaded without any team finishing/scoring, so keep load-only rows too).
        $loadsRows = $db->fetchAll(
            'SELECT l.scenario_id, s.title AS scenario_title, COUNT(*) AS loads
             FROM go_loads l
             LEFT JOIN scenarios s ON l.scenario_id = s.id
             WHERE l.client_id = ? AND l.app = ?
             GROUP BY l.scenario_id, s.title',
            [$clientId, $app]
        );
        $loadsById = [];
        foreach ($loadsRows as $r) { $loadsById[(string)$r['scenario_id']] = (int)$r['loads']; }

        // Index the score rows by scenario so we can fold in loads + surface
        // scenarios that were loaded but never scored.
        $rowsById = [];
        foreach ($byScenario as &$row) {
            $row['loads'] = $loadsById[(string)$row['scenario_id']] ?? 0;
            $rowsById[(string)$row['scenario_id']] = true;
        }
        unset($row);
        foreach ($loadsRows as $r) {
            $sid = (string)$r['scenario_id'];
            if (!isset($rowsById[$sid])) {
                $byScenario[] = [
                    'scenario_id' => $r['scenario_id'],
                    'scenario_title' => $r['scenario_title'],
                    'teams' => 0, 'finished' => 0, 'avg_score' => null,
                    'best_score' => null, 'last_played' => null,
                    'loads' => (int)$r['loads'],
                ];
            }
        }

        $totals = $db->fetch(
            'SELECT COUNT(*) AS teams, COALESCE(SUM(finished), 0) AS finished,
                    COUNT(DISTINCT scenario_id) AS scenarios,
                    ROUND(AVG(score)) AS avg_score, MAX(score) AS best_score,
                    SUM(CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS teams_30d
             FROM go_scores WHERE client_id = ? AND app = ?',
            [$clientId, $app]
        );
        $totalLoads = $db->fetch('SELECT COUNT(*) AS loads FROM go_loads WHERE client_id = ? AND app = ?', [$clientId, $app]);
        $totals['loads'] = (int)($totalLoads['loads'] ?? 0);

        jsonResponse(['data' => ['by_scenario' => $byScenario, 'totals' => $totals]]);
        break;
    }

    default:
        jsonResponse(['error' => 'invalid_action'], 400);
    }
} catch (Exception $e) {
    Logger::log('go', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500, 'go');
    jsonResponse(['error' => 'server_error', 'message' => $e->getMessage()], 500);
}
