<?php
// Scenario intro-video subtitles - the admin Translations page's
// "Video subtitles" tab.
//
// A track is the same thing the scenario editor writes (ScenarioVideoSubtitles):
// a `.vtt` file in /media/<uniqid>/ whose bare filename sits in
// `scenarios.medias.sounds.scenario_video_subtitle_<lang>`. The editor hydrates
// that slot back onto its working copy, the playground sync mirrors the file
// (flat media dir) and the content hash changes, so devices pick it up on
// their next sync. This endpoint is a second WRITER of that slot, nothing new
// is stored.
//
// Every action is ADMIN ONLY.
//
// Actions:
//   GET  ?action=list                       every scenario + its video + tracks
//   POST ?action=upload   (multipart)       uniqid, lang, file(.vtt)
//   POST ?action=remove                     { uniqid, lang }
//   GET  ?action=export_zip[&uniqids=a,b]   every track, one ZIP
//
// CONCURRENCY: like save_fields, a scenario editor left open on the same
// scenario saves `medias` wholesale from its working copy and would drop a
// track written here in the meantime. Reload the editor after using this tab.

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

session_start();
session_write_close();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ScenarioHashes.php';
require_once __DIR__ . '/../utils/ScenarioLanguages.php';

const SUBTITLE_LANGS = ['en','fr','es','de','it','pt','nl','pl','ru','ja','zh','ar'];
const SUBTITLE_SLOT_PREFIX = 'scenario_video_subtitle_';
const SUBTITLE_MAX_BYTES = 2 * 1024 * 1024;

function respond($payload, int $status = 200): void {
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Same precedence as scenario_translations.php. */
function requireAdmin(): array {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $tokenData = null;
    if ($header !== '') {
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
    }
    if (!$tokenData && isset($_SESSION['user_id']) && isset($_SESSION['user_type'])) {
        $tokenData = ['user_id' => $_SESSION['user_id'], 'user_type' => $_SESSION['user_type']];
    }
    if (!$tokenData) respond(['error' => 'Authentication required'], 401);
    if (($tokenData['user_type'] ?? '') !== 'admin') respond(['error' => 'Admin access required'], 403);
    return $tokenData;
}

function jsonColumn($raw): array {
    if (!is_string($raw) || $raw === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function mediaDir(string $uniqid): string {
    return ScenarioHashes::mediaBase() . $uniqid;
}

/** uniqids are generated, never typed - refuse anything that could walk the tree. */
function validUniqid($u): bool {
    return is_string($u) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $u) === 1;
}

/** The bare filename a slot holds, or '' (tolerates a "/media/<u>/x.vtt" path). */
function slotFile($value): string {
    if (!is_string($value) || trim($value) === '') return '';
    return basename(str_replace('\\', '/', $value));
}

function bumpVersion($current): string {
    $n = is_numeric($current) ? (float)$current : 1.0;
    return (string)round($n + 0.1, 1);
}

/** Slug used in exported file names - for humans only, never matched on alone. */
function slugify(string $s): string {
    $s = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s) ?: $s;
    $s = strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', $s));
    return trim($s, '-') ?: 'scenario';
}

requireAdmin();

$pdo = Database::getInstance()->getConnection();
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'list':       handleList($pdo); break;
        case 'upload':     handleUpload($pdo); break;
        case 'remove':     handleRemove($pdo); break;
        case 'export_zip': handleExportZip($pdo); break;
        default:
            respond(['error' => 'Unknown action'], 400);
    }
} catch (Throwable $e) {
    error_log('[scenario_subtitles] ' . $e->getMessage());
    respond(['error' => 'Server error: ' . $e->getMessage()], 500);
}

function handleList(PDO $pdo): void {
    $rows = $pdo->query(
        'SELECT id, uniqid, title, game_type, status, version, data, medias, client_id,
                validated_languages, target_languages
           FROM scenarios ORDER BY title ASC'
    )->fetchAll(PDO::FETCH_ASSOC);

    $out = [];
    foreach ($rows as $r) {
        $data = jsonColumn($r['data']);
        $medias = jsonColumn($r['medias']);
        $sounds = isset($medias['sounds']) && is_array($medias['sounds']) ? $medias['sounds'] : [];
        $dir = mediaDir($r['uniqid']);

        $tracks = [];
        foreach (SUBTITLE_LANGS as $lang) {
            $file = slotFile($sounds[SUBTITLE_SLOT_PREFIX . $lang] ?? null);
            if ($file === '') continue;
            $path = $dir . '/' . $file;
            $tracks[$lang] = [
                'file'    => $file,
                'exists'  => is_file($path),
                'size'    => is_file($path) ? filesize($path) : 0,
                'updated' => is_file($path) ? date('c', filemtime($path)) : null,
            ];
        }

        $video = slotFile($medias['video'] ?? null);
        $out[] = [
            'id'                  => (int)$r['id'],
            'uniqid'              => $r['uniqid'],
            'title'               => $r['title'],
            'game_type'           => $r['game_type'],
            'status'              => $r['status'],
            'version'             => $r['version'],
            'client_id'           => $r['client_id'] !== null ? (int)$r['client_id'] : null,
            'default_language'    => ScenarioLanguages::fromData($data)[0],
            'available_languages' => ScenarioLanguages::fromData($data),
            'target_languages'    => ScenarioLanguages::targetLanguages($r),
            'video'               => $video !== '' ? $video : null,
            'video_exists'        => $video !== '' && is_file($dir . '/' . $video),
            'tracks'              => (object)$tracks,
        ];
    }
    respond(['success' => true, 'scenarios' => $out]);
}

/**
 * Point the slot at $newFile (or clear it when null) under a row lock, bump
 * the version, and return the file the slot held before.
 */
function writeSlot(PDO $pdo, string $uniqid, string $lang, ?string $newFile): array {
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('SELECT id, medias, version FROM scenarios WHERE uniqid = ? FOR UPDATE');
        $stmt->execute([$uniqid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $pdo->rollBack();
            return ['error' => 'Scenario not found'];
        }
        $medias = jsonColumn($row['medias']);
        if (!isset($medias['sounds']) || !is_array($medias['sounds'])) $medias['sounds'] = [];
        $key = SUBTITLE_SLOT_PREFIX . $lang;
        $previous = slotFile($medias['sounds'][$key] ?? null);

        if ($newFile === null) {
            unset($medias['sounds'][$key]);
        } else {
            $medias['sounds'][$key] = $newFile;
        }
        $version = bumpVersion($row['version']);
        $pdo->prepare('UPDATE scenarios SET medias = ?, version = ?, updated_at = NOW() WHERE id = ?')
            ->execute([
                json_encode($medias, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $version,
                (int)$row['id'],
            ]);
        $pdo->commit();
        return ['previous' => $previous, 'version' => $version];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

function afterWrite(PDO $pdo, string $uniqid, string $previous, ?string $keep): void {
    // The replaced file is unreferenced now; leaving it would ship a dead
    // track to every playground on the next sync.
    if ($previous !== '' && $previous !== $keep) {
        $old = mediaDir($uniqid) . '/' . $previous;
        if (is_file($old)) @unlink($old);
    }
    try {
        ScenarioHashes::recompute($pdo, $uniqid);
    } catch (Throwable $e) {
        error_log('[scenario_subtitles] hash recompute failed: ' . $e->getMessage());
    }
}

function handleUpload(PDO $pdo): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(['error' => 'POST required'], 405);
    $uniqid = $_POST['uniqid'] ?? '';
    $lang = $_POST['lang'] ?? '';
    if (!validUniqid($uniqid)) respond(['error' => 'uniqid required'], 400);
    if (!in_array($lang, SUBTITLE_LANGS, true)) respond(['error' => 'Unsupported language'], 400);
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        respond(['error' => 'No file uploaded'], 400);
    }
    if ($_FILES['file']['size'] > SUBTITLE_MAX_BYTES) respond(['error' => 'Subtitle file must be under 2 MB'], 400);

    $content = file_get_contents($_FILES['file']['tmp_name']);
    $body = strncmp($content, "\xEF\xBB\xBF", 3) === 0 ? substr($content, 3) : $content;
    if (strncmp($body, 'WEBVTT', 6) !== 0) {
        respond(['error' => 'Not a WebVTT file (it must start with "WEBVTT")'], 400);
    }

    $exists = $pdo->prepare('SELECT 1 FROM scenarios WHERE uniqid = ?');
    $exists->execute([$uniqid]);
    if (!$exists->fetchColumn()) respond(['error' => 'Scenario not found'], 404);

    $dir = mediaDir($uniqid);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        respond(['error' => 'Failed to create the media directory'], 500);
    }
    // Same naming as the editor's uploadAsset: <slot>_<ms>.vtt
    $file = SUBTITLE_SLOT_PREFIX . $lang . '_' . (int)round(microtime(true) * 1000) . '.vtt';
    if (file_put_contents($dir . '/' . $file, $content) === false) {
        respond(['error' => 'Failed to save the file'], 500);
    }

    $res = writeSlot($pdo, $uniqid, $lang, $file);
    if (isset($res['error'])) {
        @unlink($dir . '/' . $file);
        respond(['error' => $res['error']], 404);
    }
    afterWrite($pdo, $uniqid, $res['previous'], $file);

    respond([
        'success'  => true,
        'file'     => $file,
        'replaced' => $res['previous'] !== '',
        'version'  => $res['version'],
    ]);
}

function handleRemove(PDO $pdo): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(['error' => 'POST required'], 405);
    $body = json_decode(file_get_contents('php://input'), true) ?: [];
    $uniqid = $body['uniqid'] ?? '';
    $lang = $body['lang'] ?? '';
    if (!validUniqid($uniqid)) respond(['error' => 'uniqid required'], 400);
    if (!in_array($lang, SUBTITLE_LANGS, true)) respond(['error' => 'Unsupported language'], 400);

    $res = writeSlot($pdo, $uniqid, $lang, null);
    if (isset($res['error'])) respond(['error' => $res['error']], 404);
    afterWrite($pdo, $uniqid, $res['previous'], null);
    respond(['success' => true, 'version' => $res['version']]);
}

/**
 * Every track as `<title-slug>__<uniqid>.<lang>.vtt`, flat. The uniqid makes a
 * re-import exact; the slug is there for the translator.
 */
function handleExportZip(PDO $pdo): void {
    $only = array_values(array_filter(array_map('trim', explode(',', $_GET['uniqids'] ?? ''))));
    $rows = $pdo->query('SELECT uniqid, title, medias FROM scenarios ORDER BY title ASC')->fetchAll(PDO::FETCH_ASSOC);

    $tmp = tempnam(sys_get_temp_dir(), 'subs');
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        respond(['error' => 'Could not create the ZIP'], 500);
    }

    $count = 0;
    foreach ($rows as $r) {
        if ($only && !in_array($r['uniqid'], $only, true)) continue;
        $medias = jsonColumn($r['medias']);
        $sounds = isset($medias['sounds']) && is_array($medias['sounds']) ? $medias['sounds'] : [];
        $slug = slugify((string)$r['title']);
        foreach (SUBTITLE_LANGS as $lang) {
            $file = slotFile($sounds[SUBTITLE_SLOT_PREFIX . $lang] ?? null);
            if ($file === '') continue;
            $path = mediaDir($r['uniqid']) . '/' . $file;
            if (!is_file($path)) continue;
            $zip->addFile($path, $slug . '__' . $r['uniqid'] . '.' . $lang . '.vtt');
            $count++;
        }
    }

    if ($count === 0) {
        $zip->close();
        @unlink($tmp);
        respond(['error' => 'No subtitle files to export'], 404);
    }
    $zip->close();

    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="scenario-subtitles-' . date('Y-m-d') . '.zip"');
    header('Content-Length: ' . filesize($tmp));
    header('X-Subtitle-Count: ' . $count);
    readfile($tmp);
    @unlink($tmp);
    exit;
}
