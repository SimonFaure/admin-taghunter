<?php
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';

setCorsHeaders();
session_start();

const GT_SUPPORTED_LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'zh', 'ar'];
const GT_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const GT_VIDEO_MAX_BYTES = 700 * 1024 * 1024;
const GT_SUBTITLE_MAX_BYTES = 2 * 1024 * 1024;

function gtMediaRoot() {
    return realpath(__DIR__ . '/../../media') ?: (__DIR__ . '/../../media');
}

function gtAdminVersionDir($code, $version) {
    return gtMediaRoot() . "/game_types/$code/v$version";
}

function gtClientVersionDir($code, $clientId, $version) {
    return gtMediaRoot() . "/game_types/$code/clients/$clientId/v$version";
}

function gtAuth() {
    // Header is preferred; the query-param fallback lets <video>/<track> elements
    // (which can't set custom headers) authenticate media requests.
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? ($_GET['token'] ?? '');
    if (empty($token)) return null;
    $db = Database::getInstance();
    $tokenData = TokenManager::validateToken($db, $token);
    if (!$tokenData) return null;
    return [
        'user_id' => $tokenData['user_id'],
        'user_type' => $tokenData['user_type'],
        'email' => $tokenData['email'],
    ];
}

function gtRequireAdmin() {
    $auth = gtAuth();
    if (!$auth || $auth['user_type'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'Admin only']);
        exit;
    }
    return $auth;
}

function gtRequireClient() {
    $auth = gtAuth();
    if (!$auth || $auth['user_type'] !== 'client') {
        http_response_code(403);
        echo json_encode(['error' => 'Client only']);
        exit;
    }
    return $auth;
}

function gtRequireAuth() {
    $auth = gtAuth();
    if (!$auth) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
    return $auth;
}

function gtRmDir($dir) {
    if (!is_dir($dir)) return;
    $items = scandir($dir);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = "$dir/$item";
        if (is_dir($path)) gtRmDir($path);
        else @unlink($path);
    }
    @rmdir($dir);
}

function gtRenameVersionDir($oldDir, $newDir) {
    if (is_dir($oldDir)) {
        $parent = dirname($newDir);
        if (!is_dir($parent)) mkdir($parent, 0755, true);
        if (!@rename($oldDir, $newDir)) {
            // Fallback: copy + delete (rename can fail across volumes or on Windows in rare cases)
            mkdir($newDir, 0755, true);
            $items = scandir($oldDir);
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') continue;
                @rename("$oldDir/$item", "$newDir/$item");
            }
            @rmdir($oldDir);
        }
    } else {
        if (!is_dir($newDir)) mkdir($newDir, 0755, true);
    }
}

function gtLoadRow($pdo, $code) {
    $stmt = $pdo->prepare('SELECT * FROM game_types WHERE code = ?');
    $stmt->execute([$code]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function gtLoadOverride($pdo, $clientId, $code) {
    $stmt = $pdo->prepare('SELECT * FROM client_game_type_overrides WHERE client_id = ? AND game_type_code = ?');
    $stmt->execute([$clientId, $code]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function gtJsonRow($row) {
    if (!$row) return null;
    $row['supports_tutorial_video'] = (bool)$row['supports_tutorial_video'];
    $row['supports_intro_video'] = (bool)$row['supports_intro_video'];
    $row['tutorial_video_version'] = (int)$row['tutorial_video_version'];
    $row['tutorial_subtitles'] = $row['tutorial_subtitles'] ? json_decode($row['tutorial_subtitles'], true) : new stdClass();
    // Global availability flag (enable/disable game type). Defensive default for
    // installs where the migration hasn't run yet (column absent → treat as enabled).
    $row['enabled'] = array_key_exists('enabled', $row) ? (bool)$row['enabled'] : true;
    return $row;
}

function gtJsonOverride($row) {
    if (!$row) return null;
    $row['tutorial_video_version'] = (int)$row['tutorial_video_version'];
    $row['tutorial_subtitles'] = $row['tutorial_subtitles'] ? json_decode($row['tutorial_subtitles'], true) : new stdClass();
    // Per-client availability flag: NULL = inherit (allowed), 0 = disabled for this client.
    $row['enabled'] = array_key_exists('enabled', $row) && $row['enabled'] !== null ? (bool)$row['enabled'] : null;
    return $row;
}

function gtValidateUploadedFile($file, $allowedMimes, $maxBytes) {
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'No file uploaded']);
        exit;
    }
    if ($file['size'] > $maxBytes) {
        http_response_code(400);
        echo json_encode(['error' => 'File too large']);
        exit;
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    if (!in_array($mime, $allowedMimes, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid mime type: ' . $mime]);
        exit;
    }
    return $mime;
}

$action = $_GET['action'] ?? '';

try {
    $pdo = Database::getInstance()->getConnection();

    switch ($action) {
        case 'list':                       handleList($pdo); break;
        case 'admin_upload_video':         handleAdminUploadVideo($pdo); break;
        case 'admin_upload_subtitle':      handleAdminUploadSubtitle($pdo); break;
        case 'admin_remove_video':         handleAdminRemoveVideo($pdo); break;
        case 'admin_remove_subtitle':      handleAdminRemoveSubtitle($pdo); break;
        case 'admin_update_supports':      handleAdminUpdateSupports($pdo); break;
        case 'admin_set_global_enabled':   handleAdminSetGlobalEnabled($pdo); break;
        case 'admin_set_client_enabled':   handleAdminSetClientEnabled($pdo); break;
        case 'admin_set_device_enabled':   handleAdminSetDeviceEnabled($pdo); break;
        case 'admin_set_channel_enabled':  handleAdminSetChannelEnabled($pdo); break;
        case 'admin_list_testers':         handleAdminListTesters($pdo); break;
        case 'admin_disable_impact':       handleAdminDisableImpact($pdo); break;
        case 'client_upload_video':        handleClientUploadVideo($pdo); break;
        case 'client_upload_subtitle':     handleClientUploadSubtitle($pdo); break;
        case 'client_remove_video':        handleClientRemoveVideo($pdo); break;
        case 'client_remove_subtitle':     handleClientRemoveSubtitle($pdo); break;
        case 'get_media':                  handleGetMedia($pdo); break;
        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action']);
    }
} catch (Exception $e) {
    error_log('game_types.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function handleList($pdo) {
    $auth = gtRequireAuth();

    $rows = $pdo->query('SELECT * FROM game_types ORDER BY code')->fetchAll(PDO::FETCH_ASSOC);
    $types = array_map('gtJsonRow', $rows);

    $overrides = [];

    if ($auth['user_type'] === 'client') {
        // Clients only ever see types available to them (full cascade): hide globally
        // disabled types and types this client has been disabled for. The server is the
        // authoritative gate — scenarios/patterns/etc. are filtered the same way.
        require_once __DIR__ . '/../utils/GameTypes.php';
        $disabled = GameTypes::disabledForClient($pdo, $auth['user_id']);
        if ($disabled) {
            $types = array_values(array_filter($types, function ($t) use ($disabled) {
                return !in_array($t['code'], $disabled, true);
            }));
        }

        $stmt = $pdo->prepare('SELECT * FROM client_game_type_overrides WHERE client_id = ?');
        $stmt->execute([$auth['user_id']]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $overrides[$row['game_type_code']] = gtJsonOverride($row);
        }
    } elseif ($auth['user_type'] === 'admin') {
        // Admins see every type (incl. disabled) so they can manage availability and
        // pre-author content. When inspecting a specific client (per-client game-type
        // section on the client detail page), return that client's overrides too.
        $clientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : 0;
        if ($clientId > 0) {
            $stmt = $pdo->prepare('SELECT * FROM client_game_type_overrides WHERE client_id = ?');
            $stmt->execute([$clientId]);
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $overrides[$row['game_type_code']] = gtJsonOverride($row);
            }
        }
    }

    echo json_encode(['game_types' => $types, 'overrides' => $overrides]);
}

function handleAdminUpdateSupports($pdo) {
    gtRequireAdmin();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? null;
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $supportsTutorial = isset($body['supports_tutorial_video']) ? (int)(bool)$body['supports_tutorial_video'] : (int)$row['supports_tutorial_video'];
    $supportsIntro    = isset($body['supports_intro_video'])    ? (int)(bool)$body['supports_intro_video']    : (int)$row['supports_intro_video'];

    $stmt = $pdo->prepare('UPDATE game_types SET supports_tutorial_video = ?, supports_intro_video = ? WHERE code = ?');
    $stmt->execute([$supportsTutorial, $supportsIntro, $code]);
    echo json_encode(['success' => true]);
}

function handleAdminSetGlobalEnabled($pdo) {
    gtRequireAdmin();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? null;
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    if (!isset($body['enabled'])) { http_response_code(400); echo json_encode(['error' => 'Missing enabled']); return; }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $enabled = (int)(bool)$body['enabled'];
    $stmt = $pdo->prepare('UPDATE game_types SET enabled = ? WHERE code = ?');
    $stmt->execute([$enabled, $code]);
    echo json_encode(['success' => true, 'code' => $code, 'enabled' => (bool)$enabled]);
}

function handleAdminSetClientEnabled($pdo) {
    gtRequireAdmin();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? null;
    $clientId = isset($body['client_id']) ? (int)$body['client_id'] : 0;
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    if ($clientId <= 0) { http_response_code(400); echo json_encode(['error' => 'Missing client_id']); return; }
    if (!array_key_exists('enabled', $body)) { http_response_code(400); echo json_encode(['error' => 'Missing enabled']); return; }
    if (!gtLoadRow($pdo, $code)) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    // Tri-state per-client override (overrides the global default):
    //   true  -> 1    force-enabled for this client (even if globally disabled),
    //   false -> 0    force-disabled for this client (even if globally enabled),
    //   null  -> NULL inherit the global default (follows global changes).
    // The override row may also carry tutorial-video data, so we upsert only `enabled`.
    $raw = $body['enabled'];
    if ($raw === null) {
        $enabledVal = null;
    } elseif ($raw === true || $raw === 1 || $raw === '1') {
        $enabledVal = 1;
    } else {
        $enabledVal = 0;
    }

    $stmt = $pdo->prepare(
        'INSERT INTO client_game_type_overrides (client_id, game_type_code, enabled)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)'
    );
    $stmt->execute([$clientId, $code, $enabledVal]);
    echo json_encode([
        'success' => true,
        'client_id' => $clientId,
        'code' => $code,
        'enabled' => $enabledVal, // 1 | 0 | null (inherit)
    ]);
}

// Normalise a tri-state `enabled` request body value to 1 | 0 | null (inherit).
function gtTriState($raw) {
    if ($raw === null) return null;
    if ($raw === true || $raw === 1 || $raw === '1') return 1;
    return 0;
}

// Per-DEVICE game-type override (Testers page). Tri-state; beats the client and
// channel layers. NULL clears it (the device falls back to client/channel/global).
function handleAdminSetDeviceEnabled($pdo) {
    gtRequireAdmin();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? null;
    $deviceId = isset($body['device_id']) ? (int)$body['device_id'] : 0;
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    if ($deviceId <= 0) { http_response_code(400); echo json_encode(['error' => 'Missing device_id']); return; }
    if (!array_key_exists('enabled', $body)) { http_response_code(400); echo json_encode(['error' => 'Missing enabled']); return; }
    if (!gtLoadRow($pdo, $code)) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $enabledVal = gtTriState($body['enabled']);
    if ($enabledVal === null) {
        $stmt = $pdo->prepare('DELETE FROM device_game_type_overrides WHERE device_id = ? AND game_type_code = ?');
        $stmt->execute([$deviceId, $code]);
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO device_game_type_overrides (device_id, game_type_code, enabled)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)'
        );
        $stmt->execute([$deviceId, $code, $enabledVal]);
    }
    echo json_encode(['success' => true, 'device_id' => $deviceId, 'code' => $code, 'enabled' => $enabledVal]);
}

// Per-CHANNEL game-type override (Testers page "all testers" layer). channel='test'
// grants/forces a type for every device resolved to the test channel. Tri-state.
function handleAdminSetChannelEnabled($pdo) {
    gtRequireAdmin();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? null;
    $channel = $body['channel'] ?? '';
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    if (!in_array($channel, ['stable', 'test'], true)) { http_response_code(400); echo json_encode(['error' => 'Invalid channel']); return; }
    if (!array_key_exists('enabled', $body)) { http_response_code(400); echo json_encode(['error' => 'Missing enabled']); return; }
    if (!gtLoadRow($pdo, $code)) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $enabledVal = gtTriState($body['enabled']);
    if ($enabledVal === null) {
        $stmt = $pdo->prepare('DELETE FROM channel_game_type_overrides WHERE channel = ? AND game_type_code = ?');
        $stmt->execute([$channel, $code]);
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO channel_game_type_overrides (channel, game_type_code, enabled)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)'
        );
        $stmt->execute([$channel, $code, $enabledVal]);
    }
    echo json_encode(['success' => true, 'channel' => $channel, 'code' => $code, 'enabled' => $enabledVal]);
}

// Powers the admin Testers page. Returns the global game-type registry, the
// 'test' channel overrides ("all testers"), the per-client overrides for the
// clients owning tester devices, and one row per tester device (resolved update
// channel = 'test') with its own device-level overrides.
function handleAdminListTesters($pdo) {
    gtRequireAdmin();

    $types = array_map('gtJsonRow', $pdo->query('SELECT * FROM game_types ORDER BY code')->fetchAll(PDO::FETCH_ASSOC));

    // 'test' channel overrides -> { code: 0|1 }.
    $channelOverrides = [];
    $stmt = $pdo->query("SELECT game_type_code, enabled FROM channel_game_type_overrides WHERE channel = 'test' AND enabled IS NOT NULL");
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $channelOverrides[$r['game_type_code']] = (int)$r['enabled'];
    }

    // Tester devices: resolved update channel is 'test'.
    $devices = $pdo->query(
        "SELECT d.id, d.device_label, d.display_name, d.update_channel AS device_channel,
                d.last_seen_at,
                c.id AS client_id, c.name AS client_name, c.email AS client_email,
                c.update_channel AS client_channel
         FROM devices d
         JOIN clients c ON c.id = d.client_id
         WHERE d.update_channel = 'test'
            OR (d.update_channel IS NULL AND c.update_channel = 'test')
         ORDER BY c.name ASC, d.last_seen_at DESC"
    )->fetchAll(PDO::FETCH_ASSOC);

    // Per-device overrides -> { device_id: { code: 0|1 } }.
    $deviceOverrides = [];
    $stmt = $pdo->query('SELECT device_id, game_type_code, enabled FROM device_game_type_overrides WHERE enabled IS NOT NULL');
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $deviceOverrides[(int)$r['device_id']][$r['game_type_code']] = (int)$r['enabled'];
    }

    // Per-client overrides for the involved clients -> { client_id: { code: 0|1 } }.
    $clientOverrides = [];
    $clientIds = array_values(array_unique(array_map(fn($d) => (int)$d['client_id'], $devices)));
    if ($clientIds) {
        $ph = implode(',', array_fill(0, count($clientIds), '?'));
        $stmt = $pdo->prepare("SELECT client_id, game_type_code, enabled FROM client_game_type_overrides WHERE enabled IS NOT NULL AND client_id IN ($ph)");
        $stmt->execute($clientIds);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $clientOverrides[(int)$r['client_id']][$r['game_type_code']] = (int)$r['enabled'];
        }
    }

    $testers = array_map(function ($d) use ($deviceOverrides) {
        $id = (int)$d['id'];
        return [
            'device_id' => $id,
            'label' => $d['display_name'] ?: ($d['device_label'] ?: 'Device'),
            'client_id' => (int)$d['client_id'],
            'client_name' => $d['client_name'] ?: $d['client_email'],
            'client_channel' => $d['client_channel'],
            'device_channel' => $d['device_channel'],
            'last_seen_at' => $d['last_seen_at'],
            'overrides' => $deviceOverrides[$id] ?? new stdClass(),
        ];
    }, $devices);

    echo json_encode([
        'game_types' => $types,
        'channel_overrides' => (object)$channelOverrides,
        'client_overrides' => (object)$clientOverrides,
        'testers' => $testers,
    ]);
}

// Impact preview for a *global* disable: how many published scenarios and how many
// distinct clients are affected. Powers the confirmation dialog in the studio modal.
function handleAdminDisableImpact($pdo) {
    gtRequireAdmin();
    $code = $_GET['code'] ?? '';
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }

    $scenarioCount = (int)$pdo->query(
        'SELECT COUNT(*) FROM scenarios WHERE game_type = ' . $pdo->quote($code) . ' AND status = "published"'
    )->fetchColumn();

    // Distinct clients touched: owners of custom scenarios of this type, plus clients
    // granted a product scenario of this type. A rough but useful "who is affected".
    $clientCount = (int)$pdo->query(
        'SELECT COUNT(DISTINCT cid) FROM (
            SELECT client_id AS cid FROM scenarios
             WHERE game_type = ' . $pdo->quote($code) . ' AND status = "published" AND client_id IS NOT NULL
            UNION
            SELECT cs.client_id AS cid FROM client_scenarios cs
             JOIN scenarios s ON s.id = cs.scenario_id
             WHERE s.game_type = ' . $pdo->quote($code) . ' AND s.status = "published"
         ) t'
    )->fetchColumn();

    echo json_encode(['code' => $code, 'scenario_count' => $scenarioCount, 'client_count' => $clientCount]);
}

function handleAdminUploadVideo($pdo) {
    gtRequireAdmin();
    $code = $_POST['code'] ?? '';
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }
    if (!$row['supports_tutorial_video']) { http_response_code(400); echo json_encode(['error' => 'This game type does not support a tutorial video']); return; }

    $file = $_FILES['video'] ?? null;
    $mime = gtValidateUploadedFile($file, GT_VIDEO_MIMES, GT_VIDEO_MAX_BYTES);

    $oldVersion = (int)$row['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtAdminVersionDir($code, $oldVersion);
    $newDir = gtAdminVersionDir($code, $newVersion);

    gtRenameVersionDir($oldDir, $newDir);

    // Remove any previous tutorial file (we're replacing it)
    foreach (glob("$newDir/tutorial.*") ?: [] as $existing) @unlink($existing);

    $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'mp4';
    $ext = strtolower(preg_replace('/[^a-z0-9]/i', '', $ext));
    $target = "$newDir/tutorial.$ext";
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        http_response_code(500); echo json_encode(['error' => 'Failed to save file']); return;
    }

    $stmt = $pdo->prepare('UPDATE game_types SET tutorial_video_path = ?, tutorial_video_version = ? WHERE code = ?');
    $stmt->execute(["tutorial.$ext", $newVersion, $code]);

    echo json_encode(['success' => true, 'version' => $newVersion, 'filename' => "tutorial.$ext"]);
}

function handleAdminRemoveVideo($pdo) {
    gtRequireAdmin();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? '';
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $oldVersion = (int)$row['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtAdminVersionDir($code, $oldVersion);
    $newDir = gtAdminVersionDir($code, $newVersion);

    gtRenameVersionDir($oldDir, $newDir);
    foreach (glob("$newDir/tutorial.*") ?: [] as $existing) @unlink($existing);

    $stmt = $pdo->prepare('UPDATE game_types SET tutorial_video_path = NULL, tutorial_video_version = ? WHERE code = ?');
    $stmt->execute([$newVersion, $code]);

    echo json_encode(['success' => true, 'version' => $newVersion]);
}

function handleAdminUploadSubtitle($pdo) {
    gtRequireAdmin();
    $code = $_POST['code'] ?? '';
    $lang = $_POST['lang'] ?? '';
    if (!$code || !in_array($lang, GT_SUPPORTED_LANGS, true)) {
        http_response_code(400); echo json_encode(['error' => 'Missing code or invalid lang']); return;
    }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $file = $_FILES['subtitle'] ?? null;
    gtValidateUploadedFile($file, ['text/vtt', 'text/plain', 'application/octet-stream'], GT_SUBTITLE_MAX_BYTES);

    $oldVersion = (int)$row['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtAdminVersionDir($code, $oldVersion);
    $newDir = gtAdminVersionDir($code, $newVersion);

    gtRenameVersionDir($oldDir, $newDir);

    $subtitleDir = "$newDir/subtitles";
    if (!is_dir($subtitleDir)) mkdir($subtitleDir, 0755, true);
    $target = "$subtitleDir/$lang.vtt";
    @unlink($target);
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        http_response_code(500); echo json_encode(['error' => 'Failed to save file']); return;
    }

    $subtitles = $row['tutorial_subtitles'] ? json_decode($row['tutorial_subtitles'], true) : [];
    $subtitles[$lang] = "$lang.vtt";

    $stmt = $pdo->prepare('UPDATE game_types SET tutorial_subtitles = ?, tutorial_video_version = ? WHERE code = ?');
    $stmt->execute([json_encode($subtitles), $newVersion, $code]);

    echo json_encode(['success' => true, 'version' => $newVersion, 'lang' => $lang]);
}

function handleAdminRemoveSubtitle($pdo) {
    gtRequireAdmin();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? '';
    $lang = $body['lang'] ?? '';
    if (!$code || !in_array($lang, GT_SUPPORTED_LANGS, true)) {
        http_response_code(400); echo json_encode(['error' => 'Missing code or invalid lang']); return;
    }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $oldVersion = (int)$row['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtAdminVersionDir($code, $oldVersion);
    $newDir = gtAdminVersionDir($code, $newVersion);
    gtRenameVersionDir($oldDir, $newDir);

    @unlink("$newDir/subtitles/$lang.vtt");

    $subtitles = $row['tutorial_subtitles'] ? json_decode($row['tutorial_subtitles'], true) : [];
    unset($subtitles[$lang]);

    $stmt = $pdo->prepare('UPDATE game_types SET tutorial_subtitles = ?, tutorial_video_version = ? WHERE code = ?');
    $stmt->execute([json_encode((object)$subtitles), $newVersion, $code]);

    echo json_encode(['success' => true, 'version' => $newVersion]);
}

function handleClientUploadVideo($pdo) {
    $auth = gtRequireClient();
    $code = $_POST['code'] ?? '';
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }
    if (!$row['supports_tutorial_video']) { http_response_code(400); echo json_encode(['error' => 'This game type does not support a tutorial video']); return; }

    $file = $_FILES['video'] ?? null;
    gtValidateUploadedFile($file, GT_VIDEO_MIMES, GT_VIDEO_MAX_BYTES);

    $override = gtLoadOverride($pdo, $auth['user_id'], $code);
    $oldVersion = $override ? (int)$override['tutorial_video_version'] : 0;
    $newVersion = $oldVersion + 1;
    $oldDir = gtClientVersionDir($code, $auth['user_id'], $oldVersion);
    $newDir = gtClientVersionDir($code, $auth['user_id'], $newVersion);

    gtRenameVersionDir($oldDir, $newDir);
    foreach (glob("$newDir/tutorial.*") ?: [] as $existing) @unlink($existing);

    $ext = strtolower(preg_replace('/[^a-z0-9]/i', '', pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'mp4'));
    $target = "$newDir/tutorial.$ext";
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        http_response_code(500); echo json_encode(['error' => 'Failed to save file']); return;
    }

    $subtitles = $override && $override['tutorial_subtitles']
        ? json_decode($override['tutorial_subtitles'], true) : [];

    $stmt = $pdo->prepare('
        INSERT INTO client_game_type_overrides (client_id, game_type_code, tutorial_video_path, tutorial_video_version, tutorial_subtitles)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE tutorial_video_path = VALUES(tutorial_video_path),
                                tutorial_video_version = VALUES(tutorial_video_version)
    ');
    $stmt->execute([$auth['user_id'], $code, "tutorial.$ext", $newVersion, json_encode((object)$subtitles)]);

    echo json_encode(['success' => true, 'version' => $newVersion, 'filename' => "tutorial.$ext"]);
}

function handleClientRemoveVideo($pdo) {
    $auth = gtRequireClient();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? '';
    if (!$code) { http_response_code(400); echo json_encode(['error' => 'Missing code']); return; }
    $override = gtLoadOverride($pdo, $auth['user_id'], $code);
    if (!$override) { http_response_code(404); echo json_encode(['error' => 'No override exists']); return; }

    $oldVersion = (int)$override['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtClientVersionDir($code, $auth['user_id'], $oldVersion);
    $newDir = gtClientVersionDir($code, $auth['user_id'], $newVersion);
    gtRenameVersionDir($oldDir, $newDir);
    foreach (glob("$newDir/tutorial.*") ?: [] as $existing) @unlink($existing);

    $stmt = $pdo->prepare('
        UPDATE client_game_type_overrides
        SET tutorial_video_path = NULL, tutorial_video_version = ?
        WHERE client_id = ? AND game_type_code = ?
    ');
    $stmt->execute([$newVersion, $auth['user_id'], $code]);

    echo json_encode(['success' => true, 'version' => $newVersion]);
}

function handleClientUploadSubtitle($pdo) {
    $auth = gtRequireClient();
    $code = $_POST['code'] ?? '';
    $lang = $_POST['lang'] ?? '';
    if (!$code || !in_array($lang, GT_SUPPORTED_LANGS, true)) {
        http_response_code(400); echo json_encode(['error' => 'Missing code or invalid lang']); return;
    }
    $row = gtLoadRow($pdo, $code);
    if (!$row) { http_response_code(404); echo json_encode(['error' => 'Game type not found']); return; }

    $file = $_FILES['subtitle'] ?? null;
    gtValidateUploadedFile($file, ['text/vtt', 'text/plain', 'application/octet-stream'], GT_SUBTITLE_MAX_BYTES);

    $override = gtLoadOverride($pdo, $auth['user_id'], $code);
    $oldVersion = $override ? (int)$override['tutorial_video_version'] : 0;
    $newVersion = $oldVersion + 1;
    $oldDir = gtClientVersionDir($code, $auth['user_id'], $oldVersion);
    $newDir = gtClientVersionDir($code, $auth['user_id'], $newVersion);

    gtRenameVersionDir($oldDir, $newDir);

    $subtitleDir = "$newDir/subtitles";
    if (!is_dir($subtitleDir)) mkdir($subtitleDir, 0755, true);
    $target = "$subtitleDir/$lang.vtt";
    @unlink($target);
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        http_response_code(500); echo json_encode(['error' => 'Failed to save file']); return;
    }

    $subtitles = $override && $override['tutorial_subtitles']
        ? json_decode($override['tutorial_subtitles'], true) : [];
    $subtitles[$lang] = "$lang.vtt";

    $existingVideoPath = $override ? $override['tutorial_video_path'] : null;

    $stmt = $pdo->prepare('
        INSERT INTO client_game_type_overrides (client_id, game_type_code, tutorial_video_path, tutorial_video_version, tutorial_subtitles)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE tutorial_video_version = VALUES(tutorial_video_version),
                                tutorial_subtitles = VALUES(tutorial_subtitles)
    ');
    $stmt->execute([$auth['user_id'], $code, $existingVideoPath, $newVersion, json_encode($subtitles)]);

    echo json_encode(['success' => true, 'version' => $newVersion, 'lang' => $lang]);
}

function handleClientRemoveSubtitle($pdo) {
    $auth = gtRequireClient();
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $code = $body['code'] ?? '';
    $lang = $body['lang'] ?? '';
    if (!$code || !in_array($lang, GT_SUPPORTED_LANGS, true)) {
        http_response_code(400); echo json_encode(['error' => 'Missing code or invalid lang']); return;
    }
    $override = gtLoadOverride($pdo, $auth['user_id'], $code);
    if (!$override) { http_response_code(404); echo json_encode(['error' => 'No override exists']); return; }

    $oldVersion = (int)$override['tutorial_video_version'];
    $newVersion = $oldVersion + 1;
    $oldDir = gtClientVersionDir($code, $auth['user_id'], $oldVersion);
    $newDir = gtClientVersionDir($code, $auth['user_id'], $newVersion);
    gtRenameVersionDir($oldDir, $newDir);
    @unlink("$newDir/subtitles/$lang.vtt");

    $subtitles = $override['tutorial_subtitles'] ? json_decode($override['tutorial_subtitles'], true) : [];
    unset($subtitles[$lang]);

    $stmt = $pdo->prepare('
        UPDATE client_game_type_overrides
        SET tutorial_subtitles = ?, tutorial_video_version = ?
        WHERE client_id = ? AND game_type_code = ?
    ');
    $stmt->execute([json_encode((object)$subtitles), $newVersion, $auth['user_id'], $code]);

    echo json_encode(['success' => true, 'version' => $newVersion]);
}

function handleGetMedia($pdo) {
    $auth = gtRequireAuth();
    $code = $_GET['code'] ?? '';
    $variant = $_GET['variant'] ?? 'admin';
    $version = (int)($_GET['version'] ?? 0);
    $filename = $_GET['filename'] ?? '';
    $subtitleLang = $_GET['subtitle_lang'] ?? '';

    if (!$code || !$version || (!$filename && !$subtitleLang)) {
        http_response_code(400); echo json_encode(['error' => 'Missing params']); return;
    }

    if ($variant === 'admin') {
        $baseDir = gtAdminVersionDir($code, $version);
    } else if ($variant === 'client') {
        $baseDir = gtClientVersionDir($code, $auth['user_id'], $version);
    } else {
        http_response_code(400); echo json_encode(['error' => 'Invalid variant']); return;
    }

    if ($subtitleLang) {
        if (!in_array($subtitleLang, GT_SUPPORTED_LANGS, true)) {
            http_response_code(400); echo json_encode(['error' => 'Invalid lang']); return;
        }
        $path = "$baseDir/subtitles/$subtitleLang.vtt";
        $mime = 'text/vtt';
    } else {
        // Filter out path traversal
        if (strpos($filename, '..') !== false || strpos($filename, '/') !== false) {
            http_response_code(400); echo json_encode(['error' => 'Invalid filename']); return;
        }
        $path = "$baseDir/$filename";
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $mimeMap = ['mp4' => 'video/mp4', 'webm' => 'video/webm', 'ogg' => 'video/ogg', 'mov' => 'video/quicktime'];
        $mime = $mimeMap[$ext] ?? 'application/octet-stream';
    }

    if (!is_file($path)) {
        http_response_code(404); echo json_encode(['error' => 'File not found']); return;
    }

    // Drop any buffering so large videos stream instead of loading into memory.
    while (ob_get_level() > 0) { ob_end_clean(); }

    $size = filesize($path);
    $start = 0;
    $end = $size - 1;

    header('Content-Type: ' . $mime);
    header('Accept-Ranges: bytes');

    // Honour HTTP Range requests so the player can seek without re-downloading.
    if (isset($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $m)) {
        if ($m[1] !== '') $start = (int)$m[1];
        if ($m[2] !== '') $end = (int)$m[2];
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header("Content-Range: bytes */$size");
            return;
        }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }

    $length = $end - $start + 1;
    header('Content-Length: ' . $length);

    $fp = fopen($path, 'rb');
    if ($fp === false) {
        http_response_code(500); echo json_encode(['error' => 'Read failed']); return;
    }
    fseek($fp, $start);
    $chunk = 8192;
    $pos = $start;
    while (!feof($fp) && $pos <= $end) {
        $read = min($chunk, $end - $pos + 1);
        echo fread($fp, $read);
        $pos += $read;
        flush();
    }
    fclose($fp);
}
