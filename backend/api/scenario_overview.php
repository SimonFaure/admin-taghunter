<?php
// Scenario overview - the production checklist behind Admin > Scenarios >
// "Scenario overview": for every scenario, what exists (cover visual, intro
// video, subtitles, attached files, translations) and what is left to do, plus
// the "fully finished" tick.
//
// This endpoint only reports the raw material. Translation completeness is
// computed by the page from `game_meta` + `files`, with the same row model as
// the Translations page (src/i18n/scenarioTranslationRows.ts): the registry of
// what is translatable lives in TypeScript only, so counting here would need a
// second copy of it.
//
// Every action is ADMIN ONLY.
//
// Actions:
//   GET  ?action=list           one entry per scenario
//   POST ?action=set_finished   { uniqid, finished, user_email }
//   GET  ?action=meta&uniqid=<u>        checklist settings, for the scenario editor
//   POST ?action=set_cover_has_text     { uniqid, cover_has_text }
//
// Migrations: database/add_scenario_finished.sql (finished_at / finished_by),
// database/add_scenario_file_no_translation.sql (scenario_files.no_translation).

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();
// Only READS the session; release its lock so parallel requests do not queue.
session_write_close();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/LocalizedPath.php';
require_once __DIR__ . '/../utils/ScenarioLanguages.php';

const OVERVIEW_LANGS = ['en','fr','es','de','it','pt','nl','pl','ru','ja','zh','ar'];

/** File extensions a media reference can end in. */
const MEDIA_REF_RE = '/\.(png|jpe?g|gif|webp|svg|avif|mp3|wav|ogg|m4a|aac|mp4|webm|mov|vtt|ttf|otf|woff2?)$/i';

function respond($payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Same precedence as scenario_translations.php: a token wins over the session. */
function requireAdmin(): array {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $tokenData = null;
    if ($header !== '') {
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
    }
    if (!$tokenData && isset($_SESSION['user_id']) && isset($_SESSION['user_type'])) {
        $tokenData = ['user_id' => $_SESSION['user_id'], 'user_type' => $_SESSION['user_type']];
    }
    if (!$tokenData) {
        respond(['error' => 'Authentication required'], 401);
    }
    if (($tokenData['user_type'] ?? '') !== 'admin') {
        respond(['error' => 'Admin access required'], 403);
    }
    return $tokenData;
}

function jsonColumn($raw): array {
    if (!is_string($raw) || $raw === '') return [];
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

/** A media slot counts as filled when it names a file (or a legacy media id). */
function slotFilled($value): bool {
    return (is_string($value) && trim($value) !== '') || is_int($value);
}

requireAdmin();

$db = Database::getInstance();
$pdo = $db->getConnection();
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'list':         handleList($pdo); break;
        case 'set_finished': handleSetFinished($pdo); break;
        case 'meta':         handleMeta($pdo); break;
        case 'set_cover_has_text': handleSetCoverHasText($pdo); break;
        default:
            respond(['error' => 'Unknown action'], 400);
    }
} catch (Throwable $e) {
    error_log('[scenario_overview] ' . $e->getMessage());
    respond(['error' => 'Server error: ' . $e->getMessage()], 500);
}

/**
 * Media references of a scenario whose file is no longer on the server, as
 * bare file names. Walks every string leaf of the given structures (the medias
 * column and game_meta, where clash and tracks keep nested images): anything
 * that looks like a media file name is looked up in /media/<uniqid>/. A legacy
 * numeric media id is not a file name and is left alone.
 */
function missingMediaFiles(string $uniqid, array $sources): array {
    $dir = __DIR__ . '/../../media/' . $uniqid;
    $present = [];
    if (is_dir($dir)) {
        foreach (scandir($dir) as $entry) $present[$entry] = true;
    }

    $missing = [];
    $walk = function ($node) use (&$walk, &$missing, $present) {
        if (is_array($node)) {
            foreach ($node as $child) $walk($child);
            return;
        }
        if (!is_string($node) || $node === '' || strlen($node) > 300) return;
        if (!preg_match(MEDIA_REF_RE, $node)) return;
        $name = basename(str_replace('\\', '/', $node));
        if (!isset($present[$name])) $missing[$name] = true;
    };
    foreach ($sources as $source) $walk($source);
    return array_keys($missing);
}

/** Checklist settings of one scenario, for the scenario editor's admin controls. */
function handleMeta(PDO $pdo): void {
    $uniqid = $_GET['uniqid'] ?? '';
    if ($uniqid === '') respond(['error' => 'uniqid required'], 400);

    $stmt = $pdo->prepare(
        'SELECT data, client_id, validated_languages, target_languages, cover_has_text
           FROM scenarios WHERE uniqid = ?'
    );
    $stmt->execute([$uniqid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) respond(['error' => 'Scenario not found'], 404);

    respond([
        'success'             => true,
        'gated'               => ScenarioLanguages::isGated($row),
        'default_language'    => ScenarioLanguages::fromData($row['data'])[0],
        'target_languages'    => ScenarioLanguages::targetLanguages($row),
        'validated_languages' => ScenarioLanguages::validatedLanguages($row),
        'cover_has_text'      => (int)$row['cover_has_text'] === 1,
    ]);
}

/** "The cover contains text": a language version is expected per target language. */
function handleSetCoverHasText(PDO $pdo): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) respond(['error' => 'Invalid JSON body'], 400);

    $uniqid = $body['uniqid'] ?? '';
    if (!is_string($uniqid) || $uniqid === '') respond(['error' => 'uniqid required'], 400);
    $value = !empty($body['cover_has_text']) ? 1 : 0;

    // `updated_at` is pinned: this is not a content edit.
    $upd = $pdo->prepare('UPDATE scenarios SET cover_has_text = ?, updated_at = updated_at WHERE uniqid = ?');
    $upd->execute([$value, $uniqid]);

    respond(['success' => true, 'cover_has_text' => $value === 1]);
}

function handleList(PDO $pdo): void {
    $rows = $pdo->query(
        'SELECT s.id, s.uniqid, s.title, s.game_type, s.scenario_type, s.status, s.version,
                s.data, s.medias, s.translation_meta, s.client_id, s.validated_languages,
                s.finished_at, s.finished_by, s.updated_at,
                s.target_languages, s.cover_has_text,
                c.name AS client_name, c.company AS client_company
           FROM scenarios s
           LEFT JOIN clients c ON c.id = s.client_id
          ORDER BY s.title ASC'
    )->fetchAll(PDO::FETCH_ASSOC);

    $filesByScenario = [];
    $files = $pdo->query(
        'SELECT id, scenario_id, name, name_i18n, name_hashes, language, parent_file_id, mime_type,
                no_translation, doc_type
           FROM scenario_files
          ORDER BY scenario_id ASC, COALESCE(parent_file_id, id) ASC, parent_file_id IS NOT NULL, id ASC'
    )->fetchAll(PDO::FETCH_ASSOC);

    $textsByFile = [];
    foreach ($pdo->query(
        'SELECT id, file_id, position, source_text, values_i18n, hashes_i18n
           FROM scenario_file_texts
          ORDER BY file_id ASC, position ASC, id ASC'
    )->fetchAll(PDO::FETCH_ASSOC) as $t) {
        $textsByFile[(int)$t['file_id']][] = [
            'id'          => (int)$t['id'],
            'position'    => (int)$t['position'],
            'source_text' => $t['source_text'],
            'values'      => jsonColumn($t['values_i18n']),
            'hashes'      => jsonColumn($t['hashes_i18n']),
        ];
    }

    foreach ($files as $f) {
        $filesByScenario[(int)$f['scenario_id']][] = [
            'id'             => (int)$f['id'],
            'name'           => $f['name'],
            'name_i18n'      => jsonColumn($f['name_i18n']),
            'name_hashes'    => jsonColumn($f['name_hashes']),
            'language'       => $f['language'],
            'parent_file_id' => $f['parent_file_id'] !== null ? (int)$f['parent_file_id'] : null,
            'mime_type'      => $f['mime_type'],
            'no_translation' => (int)$f['no_translation'] === 1,
            'doc_type'       => $f['doc_type'],
            'texts'          => $textsByFile[(int)$f['id']] ?? [],
        ];
    }

    $out = [];
    foreach ($rows as $r) {
        $data = jsonColumn($r['data']);
        $gm = isset($data['game_meta']) && is_array($data['game_meta']) ? $data['game_meta'] : [];
        $defaultLang = ScenarioLanguages::fromData($data)[0];

        $medias = jsonColumn($r['medias']);
        $images = isset($medias['images']) && is_array($medias['images']) ? $medias['images'] : [];
        $sounds = isset($medias['sounds']) && is_array($medias['sounds']) ? $medias['sounds'] : [];

        // Languages that get their own cover (every non-French one once the
        // shared "other languages" version `game_visual_intl` is set) and the
        // intro video's subtitle tracks (`scenario_video_subtitle_<lang>`, which
        // travel in the sounds bucket - see commonMediaSlots.ts).
        $hasIntlCover = slotFilled($images['game_visual_intl'] ?? null);
        $coverLangs = [];
        $subtitleLangs = [];
        foreach (OVERVIEW_LANGS as $lang) {
            if ($hasIntlCover && $lang !== 'fr') $coverLangs[] = $lang;
            if (slotFilled($sounds['scenario_video_subtitle_' . $lang] ?? null)) $subtitleLangs[] = $lang;
        }

        $out[] = [
            'id'                  => (int)$r['id'],
            'uniqid'              => $r['uniqid'],
            'title'               => $r['title'],
            'game_type'           => $r['game_type'],
            'scenario_type'       => $r['scenario_type'],
            'status'              => $r['status'],
            'version'             => $r['version'],
            'updated_at'          => $r['updated_at'],
            'client_id'           => $r['client_id'] !== null ? (int)$r['client_id'] : null,
            'client_name'         => $r['client_company'] ?: $r['client_name'],
            'default_language'    => $defaultLang,
            // What the scenario ACTUALLY has values for, not what it claims.
            'translated_langs'    => LocalizedPath::unionLangs($gm, $defaultLang),
            'gated'               => ScenarioLanguages::isGated($r),
            'validated_languages' => ScenarioLanguages::validatedLanguages($r),
            'target_languages'    => ScenarioLanguages::targetLanguages($r),
            'cover_has_text'      => (int)$r['cover_has_text'] === 1,
            // The whole medias column: the page rebuilds the editor's flat
            // working copy from it to run the publish validators.
            'medias'              => (object)$medias,
            'missing_files'       => missingMediaFiles($r['uniqid'], [$medias, $gm]),
            'cover'               => slotFilled($images['game_visual'] ?? null),
            'cover_langs'         => $coverLangs,
            'video'               => slotFilled($medias['video'] ?? null),
            'subtitle_langs'      => $subtitleLangs,
            'game_meta'           => (object)$gm,
            'translation_meta'    => (object)jsonColumn($r['translation_meta']),
            'files'               => $filesByScenario[(int)$r['id']] ?? [],
            'finished_at'         => $r['finished_at'],
            'finished_by'         => $r['finished_by'],
        ];
    }

    respond(['success' => true, 'scenarios' => $out]);
}

/**
 * Tick / untick "fully finished". Writes only the two bookkeeping columns -
 * never `data` - so no hash moves and no playground re-syncs; `updated_at` is
 * pinned for the same reason (this is not a content edit).
 */
function handleSetFinished(PDO $pdo): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) respond(['error' => 'Invalid JSON body'], 400);

    $uniqid = $body['uniqid'] ?? '';
    if (!is_string($uniqid) || $uniqid === '') respond(['error' => 'uniqid required'], 400);
    $finished = !empty($body['finished']);
    $by = is_string($body['user_email'] ?? null) ? substr($body['user_email'], 0, 255) : null;

    $exists = $pdo->prepare('SELECT id FROM scenarios WHERE uniqid = ?');
    $exists->execute([$uniqid]);
    $id = $exists->fetchColumn();
    if ($id === false) respond(['error' => 'Scenario not found'], 404);

    $upd = $pdo->prepare(
        'UPDATE scenarios
            SET finished_at = ' . ($finished ? 'NOW()' : 'NULL') . ',
                finished_by = ?,
                updated_at = updated_at
          WHERE id = ?'
    );
    $upd->execute([$finished ? $by : null, (int)$id]);

    $read = $pdo->prepare('SELECT finished_at, finished_by FROM scenarios WHERE id = ?');
    $read->execute([(int)$id]);
    $row = $read->fetch(PDO::FETCH_ASSOC);

    respond([
        'success'     => true,
        'finished_at' => $row['finished_at'],
        'finished_by' => $row['finished_by'],
    ]);
}
