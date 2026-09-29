<?php
// Scenario translations - the read model + patch-style writes behind the
// admin Translations page's "Scenarios" tab.
//
// Scenario FIELD values are not stored here: they live where they always have,
// as `Localized<string>` maps inline in `scenarios.data.game_meta`, which is
// what the editor, playground.php and go.php all read. This endpoint is a
// second WRITER of that same data, not a second source of truth.
//
// What IS new storage: per-file language + language variants + localized file
// titles on `scenario_files`, the strings printed inside a document
// (`scenario_file_texts`), and per-path translator staleness hashes
// (`scenarios.translation_meta`).
//
// Every action is ADMIN ONLY.
//
// Actions:
//   GET  ?action=list_scenarios          picker rows
//   GET  ?action=get&uniqid=<u>          full translation read model
//   POST ?action=save_fields             { uniqid, base_version, patches[], stamps[] }
//   POST ?action=save_file_texts         { file_id, rows[], delete_missing }
//   POST ?action=save_file_title         { file_id, name_i18n, hashes }
//   POST ?action=set_file_meta           { file_id, language }
//   POST ?action=set_language_validation { uniqid, lang, validated }
//
// LANGUAGE VALIDATION: on an admin-owned scenario a language is released to
// clients and playgrounds only once validated here (`scenarios.validated_languages`,
// enforced by ScenarioLanguages on every client read path). A language a save
// adds to `available_languages` is therefore a DRAFT until validated.
//
// Plan: C:\Users\faure\.claude\plans\here-is-a-translation-transient-boot.md

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();
// This endpoint only READS the session. Release its lock straight away so the
// browser's parallel requests do not queue behind one another (a slow save or
// hash recompute used to hold every other call - retours sept. 2026 #42).
session_write_close();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ScenarioHashes.php';
require_once __DIR__ . '/../utils/LocalizedCompat.php';
require_once __DIR__ . '/../utils/LocalizedPath.php';
require_once __DIR__ . '/../utils/ScenarioLanguages.php';

const TRANSLATION_LANGS = ['en','fr','es','de','it','pt','nl','pl','ru','ja','zh','ar'];

function respond($payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Same precedence as query.php: a Bearer/X-Auth-Token wins over a stale session
 * cookie, and the session fallback requires BOTH user_id and user_type (never
 * defaulting user_type to 'admin').
 */
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

function isLang($code): bool {
    return is_string($code) && in_array($code, TRANSLATION_LANGS, true);
}

/** Keep only `{lang: string}` pairs from a client-supplied map. */
function sanitizeLangMap($raw): array {
    if (!is_array($raw)) return [];
    $out = [];
    foreach ($raw as $lang => $value) {
        if (isLang($lang) && is_string($value)) $out[$lang] = $value;
    }
    return $out;
}

requireAdmin();

$db = Database::getInstance();
$pdo = $db->getConnection();
$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'list_scenarios':  handleListScenarios($pdo); break;
        case 'get':             handleGet($pdo); break;
        case 'save_fields':     handleSaveFields($pdo); break;
        case 'save_file_texts': handleSaveFileTexts($pdo); break;
        case 'save_file_title': handleSaveFileTitle($pdo); break;
        case 'set_file_meta':   handleSetFileMeta($pdo); break;
        case 'set_language_validation': handleSetLanguageValidation($pdo); break;
        default:
            respond(['error' => 'Unknown action'], 400);
    }
} catch (Throwable $e) {
    error_log('[scenario_translations] ' . $e->getMessage());
    respond(['error' => 'Server error: ' . $e->getMessage()], 500);
}

/* ─────────────────────────────── read model ─────────────────────────────── */

function handleListScenarios(PDO $pdo): void {
    $rows = $pdo->query(
        'SELECT id, uniqid, title, game_type, scenario_type, status, version, data,
                client_id, validated_languages
           FROM scenarios ORDER BY title ASC'
    )->fetchAll(PDO::FETCH_ASSOC);

    $counts = [];
    foreach ($pdo->query(
        'SELECT scenario_id, COUNT(*) AS n FROM scenario_files GROUP BY scenario_id'
    )->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $counts[(int)$c['scenario_id']] = (int)$c['n'];
    }

    $out = [];
    foreach ($rows as $r) {
        $data = jsonColumn($r['data']);
        $defaultLang = $data['default_language'] ?? 'fr';
        $gm = isset($data['game_meta']) && is_array($data['game_meta']) ? $data['game_meta'] : [];
        $out[] = [
            'id'               => (int)$r['id'],
            'uniqid'           => $r['uniqid'],
            'title'            => $r['title'],
            'game_type'        => $r['game_type'],
            'scenario_type'    => $r['scenario_type'],
            'status'           => $r['status'],
            'version'          => $r['version'],
            'default_language' => $defaultLang,
            // What the scenario ACTUALLY has values for, not what it claims.
            'translated_langs' => LocalizedPath::unionLangs($gm, $defaultLang),
            // Released to clients. Ungated (client-owned) rows release everything.
            'gated'            => ScenarioLanguages::isGated($r),
            'validated_langs'  => ScenarioLanguages::validatedLanguages($r),
            'files_count'      => $counts[(int)$r['id']] ?? 0,
        ];
    }
    respond(['success' => true, 'scenarios' => $out]);
}

function handleGet(PDO $pdo): void {
    $uniqid = $_GET['uniqid'] ?? '';
    if ($uniqid === '') respond(['error' => 'uniqid required'], 400);

    $stmt = $pdo->prepare(
        'SELECT id, uniqid, title, description, game_type, version, data, translation_meta,
                client_id, validated_languages
           FROM scenarios WHERE uniqid = ?'
    );
    $stmt->execute([$uniqid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) respond(['error' => 'Scenario not found'], 404);

    $data = jsonColumn($row['data']);
    $gm = isset($data['game_meta']) && is_array($data['game_meta']) ? $data['game_meta'] : [];
    $defaultLang = $data['default_language'] ?? 'fr';

    $fstmt = $pdo->prepare(
        'SELECT id, name, name_i18n, name_hashes, language, parent_file_id,
                file_size, mime_type, file_path, created_at
           FROM scenario_files WHERE scenario_id = ?
          ORDER BY COALESCE(parent_file_id, id) ASC, parent_file_id IS NOT NULL, id ASC'
    );
    $fstmt->execute([(int)$row['id']]);
    $files = $fstmt->fetchAll(PDO::FETCH_ASSOC);

    $textsByFile = [];
    if ($files) {
        $ids = array_map(fn($f) => (int)$f['id'], $files);
        $in = implode(',', array_fill(0, count($ids), '?'));
        $tstmt = $pdo->prepare(
            "SELECT id, file_id, position, source_text, values_i18n, hashes_i18n
               FROM scenario_file_texts WHERE file_id IN ($in)
              ORDER BY file_id ASC, position ASC, id ASC"
        );
        $tstmt->execute($ids);
        foreach ($tstmt->fetchAll(PDO::FETCH_ASSOC) as $t) {
            $textsByFile[(int)$t['file_id']][] = [
                'id'          => (int)$t['id'],
                'position'    => (int)$t['position'],
                'source_text' => $t['source_text'],
                'values'      => jsonColumn($t['values_i18n']),
                'hashes'      => jsonColumn($t['hashes_i18n']),
            ];
        }
    }

    $fileOut = [];
    foreach ($files as $f) {
        $fileOut[] = [
            'id'             => (int)$f['id'],
            'name'           => $f['name'],
            'name_i18n'      => jsonColumn($f['name_i18n']),
            'name_hashes'    => jsonColumn($f['name_hashes']),
            'language'       => $f['language'],
            'parent_file_id' => $f['parent_file_id'] !== null ? (int)$f['parent_file_id'] : null,
            'file_size'      => (int)$f['file_size'],
            'mime_type'      => $f['mime_type'],
            'filename'       => basename((string)$f['file_path']),
            'created_at'     => $f['created_at'],
            'texts'          => $textsByFile[(int)$f['id']] ?? [],
        ];
    }

    respond([
        'success' => true,
        'scenario' => [
            'id'                  => (int)$row['id'],
            'uniqid'              => $row['uniqid'],
            'title'               => $row['title'],
            'game_type'           => $row['game_type'],
            'version'             => $row['version'],
            'default_language'    => $defaultLang,
            'available_languages' => $data['available_languages'] ?? [$defaultLang],
            'gated'               => ScenarioLanguages::isGated($row),
            'validated_languages' => ScenarioLanguages::validatedLanguages($row),
        ],
        'game_meta'        => $gm,
        'translation_meta' => jsonColumn($row['translation_meta']),
        'files'            => $fileOut,
    ]);
}

/* ─────────────────────────── language validation ─────────────────────────── */

/**
 * Validate / un-validate one language of an admin-owned scenario.
 *
 * Writes only `validated_languages` - never `data` - so the stored hashes do
 * not move; the playground re-syncs because the SERVED hash is salted with the
 * visible languages (ScenarioLanguages::servedHash). The stored list keeps the
 * raw codes; ScenarioLanguages intersects it with the authored languages.
 */
function handleSetLanguageValidation(PDO $pdo): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) respond(['error' => 'Invalid JSON body'], 400);

    $uniqid = $body['uniqid'] ?? '';
    $lang = $body['lang'] ?? '';
    $validated = !empty($body['validated']);
    if ($uniqid === '') respond(['error' => 'uniqid required'], 400);
    if (!isLang($lang)) respond(['error' => 'Unknown language'], 400);

    $pdo->beginTransaction();
    $stmt = $pdo->prepare(
        'SELECT id, data, client_id, validated_languages FROM scenarios WHERE uniqid = ? FOR UPDATE'
    );
    $stmt->execute([$uniqid]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        $pdo->rollBack();
        respond(['error' => 'Scenario not found'], 404);
    }
    if (!ScenarioLanguages::isGated($row)) {
        $pdo->rollBack();
        respond(['error' => 'A client scenario releases all its languages; there is nothing to validate.'], 400);
    }
    $default = ScenarioLanguages::fromData($row['data'])[0];
    if ($lang === $default && !$validated) {
        $pdo->rollBack();
        respond(['error' => 'The default language is always validated.'], 400);
    }

    // Start from what is released today (NULL = default only).
    $list = ScenarioLanguages::validatedLanguages($row);
    if ($validated) {
        if (!in_array($lang, $list, true)) $list[] = $lang;
    } else {
        $list = array_values(array_filter($list, fn($l) => $l !== $lang));
    }

    $upd = $pdo->prepare('UPDATE scenarios SET validated_languages = ? WHERE id = ?');
    $upd->execute([json_encode(array_values($list)), (int)$row['id']]);
    $pdo->commit();

    $row['validated_languages'] = json_encode($list);
    respond([
        'success' => true,
        'validated_languages' => ScenarioLanguages::validatedLanguages($row),
    ]);
}

/* ────────────────────────────── field writes ────────────────────────────── */

/**
 * Apply a list of `{path, lang, value}` patches to `scenarios.data.game_meta`.
 *
 * The no-clobber contract: this never serializes a client-held copy of
 * game_meta. It re-reads the row under `FOR UPDATE`, mutates only the named
 * leaves, and writes back - so a concurrent editor save that touched other keys
 * survives. `base_version` additionally rejects a write whose grid was loaded
 * before someone else's save (409).
 *
 * KNOWN GAP: the editor saves through query.php, which does a plain UPDATE with
 * no row lock and no compare-and-swap, so an editor save that STARTED before
 * this transaction can still land after it and wipe these patches. Adding a
 * `WHERE version = ?` CAS to query.php is the real fix and is tracked as a
 * follow-up; it writes nine tables, so it is not done here.
 */
function handleSaveFields(PDO $pdo): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) respond(['error' => 'Invalid JSON body'], 400);

    $uniqid = $body['uniqid'] ?? '';
    if ($uniqid === '') respond(['error' => 'uniqid required'], 400);
    $patches = is_array($body['patches'] ?? null) ? $body['patches'] : [];
    $stamps  = is_array($body['stamps'] ?? null) ? $body['stamps'] : [];
    $baseVersion = $body['base_version'] ?? null;

    $skipped = [];
    $applied = 0;

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare(
            'SELECT id, data, version, translation_meta FROM scenarios WHERE uniqid = ? FOR UPDATE'
        );
        $stmt->execute([$uniqid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            $pdo->rollBack();
            respond(['error' => 'Scenario not found'], 404);
        }

        if ($baseVersion !== null && (string)$row['version'] !== (string)$baseVersion) {
            $pdo->rollBack();
            respond([
                'error'   => 'stale',
                'message' => 'This scenario was saved by someone else while the grid was open. Reload before saving.',
                'version' => $row['version'],
            ], 409);
        }

        $data = jsonColumn($row['data']);
        $gm = isset($data['game_meta']) && is_array($data['game_meta']) ? $data['game_meta'] : [];
        $defaultLang = $data['default_language'] ?? 'fr';

        foreach ($patches as $p) {
            $path = $p['path'] ?? '';
            $lang = $p['lang'] ?? '';
            $value = $p['value'] ?? '';
            if (!is_string($path) || $path === '' || !isLang($lang) || !is_string($value)) {
                $skipped[] = is_string($path) ? $path : '(malformed)';
                continue;
            }
            if (LocalizedPath::apply($gm, $path, $lang, $value, $defaultLang)) {
                $applied++;
            } else {
                $skipped[] = $path;
            }
        }

        $data['game_meta'] = $gm;
        $data['default_language'] = $defaultLang;
        $data['available_languages'] = LocalizedPath::unionLangs($gm, $defaultLang);

        // Row title/description are denormalized from the default language,
        // exactly as saveOrchestrator.performSave does on the editor path.
        $rowTitle = LocalizedCompat::getLocalized($gm['title'] ?? null, $defaultLang, $defaultLang);
        $rowDesc  = LocalizedCompat::getLocalized($gm['description'] ?? null, $defaultLang, $defaultLang);

        // Staleness hashes are editorial bookkeeping and live in their own
        // column: folding them into `data` would change content_hash on every
        // stamp and force every synced playground to re-download the scenario.
        $meta = jsonColumn($row['translation_meta']);
        foreach ($stamps as $s) {
            $path = $s['path'] ?? '';
            $lang = $s['lang'] ?? '';
            $hash = $s['hash'] ?? '';
            if (!is_string($path) || $path === '' || !isLang($lang) || !is_string($hash) || $hash === '') {
                continue;
            }
            if (!isset($meta[$path]) || !is_array($meta[$path])) $meta[$path] = [];
            $meta[$path][$lang] = $hash;
        }

        $newVersion = bumpVersion($row['version']);

        $upd = $pdo->prepare(
            'UPDATE scenarios
                SET data = ?, translation_meta = ?, version = ?,
                    title = COALESCE(NULLIF(?, ""), title),
                    description = COALESCE(NULLIF(?, ""), description),
                    updated_at = NOW()
              WHERE id = ?'
        );
        $upd->execute([
            json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $newVersion,
            $rowTitle,
            $rowDesc,
            (int)$row['id'],
        ]);

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    // After commit, best-effort: a hashing hiccup must never fail the save (the
    // manifest builder has a NULL-hash fallback).
    try {
        ScenarioHashes::recompute($pdo, (string)$uniqid);
    } catch (Throwable $e) {
        error_log('[scenario_translations] hash recompute failed: ' . $e->getMessage());
    }

    respond([
        'success' => true,
        'version' => $newVersion,
        'applied' => $applied,
        'skipped' => $skipped,
    ]);
}

/** `scenarios.version` is a decimal-ish string bumped by 0.1 on every save. */
function bumpVersion($current): string {
    $n = is_numeric($current) ? (float)$current : 1.0;
    return (string)round($n + 0.1, 1);
}

/* ─────────────────────────────── file writes ────────────────────────────── */

function fileScenarioUniqid(PDO $pdo, int $fileId): ?array {
    $stmt = $pdo->prepare(
        'SELECT sf.id, sf.scenario_id, s.uniqid
           FROM scenario_files sf JOIN scenarios s ON s.id = sf.scenario_id
          WHERE sf.id = ?'
    );
    $stmt->execute([$fileId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * Replace a file's inner-document strings.
 *
 * Rows carrying an `id` are updated in place (that id is what keeps a
 * translation attached when the translator edits the source text itself). Rows
 * without one are inserted. With `delete_missing`, rows the client did not send
 * back are deleted - that is how a removed line disappears.
 */
function handleSaveFileTexts(PDO $pdo): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) respond(['error' => 'Invalid JSON body'], 400);

    $fileId = (int)($body['file_id'] ?? 0);
    if ($fileId <= 0) respond(['error' => 'file_id required'], 400);
    if (!fileScenarioUniqid($pdo, $fileId)) respond(['error' => 'File not found'], 404);

    $rows = is_array($body['rows'] ?? null) ? $body['rows'] : [];
    $deleteMissing = !empty($body['delete_missing']);

    $idMap = [];
    $keptIds = [];

    $pdo->beginTransaction();
    try {
        $insert = $pdo->prepare(
            'INSERT INTO scenario_file_texts (file_id, position, source_text, values_i18n, hashes_i18n)
             VALUES (?, ?, ?, ?, ?)'
        );
        $update = $pdo->prepare(
            'UPDATE scenario_file_texts
                SET position = ?, source_text = ?, values_i18n = ?, hashes_i18n = ?
              WHERE id = ? AND file_id = ?'
        );

        foreach ($rows as $i => $r) {
            $source = is_string($r['source_text'] ?? null) ? $r['source_text'] : '';
            if (trim($source) === '') continue;
            $position = isset($r['position']) ? (int)$r['position'] : $i;
            $values = json_encode(sanitizeLangMap($r['values'] ?? []), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $hashes = json_encode(sanitizeLangMap($r['hashes'] ?? []), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

            $existingId = isset($r['id']) ? (int)$r['id'] : 0;
            if ($existingId > 0) {
                $update->execute([$position, $source, $values, $hashes, $existingId, $fileId]);
                $keptIds[] = $existingId;
                $idMap[] = ['client_index' => $i, 'id' => $existingId];
            } else {
                $insert->execute([$fileId, $position, $source, $values, $hashes]);
                $newId = (int)$pdo->lastInsertId();
                $keptIds[] = $newId;
                $idMap[] = ['client_index' => $i, 'id' => $newId];
            }
        }

        if ($deleteMissing) {
            if ($keptIds) {
                $in = implode(',', array_fill(0, count($keptIds), '?'));
                $del = $pdo->prepare("DELETE FROM scenario_file_texts WHERE file_id = ? AND id NOT IN ($in)");
                $del->execute(array_merge([$fileId], $keptIds));
            } else {
                $del = $pdo->prepare('DELETE FROM scenario_file_texts WHERE file_id = ?');
                $del->execute([$fileId]);
            }
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }

    respond(['success' => true, 'rows' => $idMap]);
}

/**
 * Set a file's localized display title. `name` stays the default-language
 * string so ZIP entry names, Content-Disposition and legacy readers are
 * unaffected; `name_i18n` is what the client portal resolves against.
 */
function handleSaveFileTitle(PDO $pdo): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) respond(['error' => 'Invalid JSON body'], 400);

    $fileId = (int)($body['file_id'] ?? 0);
    if ($fileId <= 0) respond(['error' => 'file_id required'], 400);
    $file = fileScenarioUniqid($pdo, $fileId);
    if (!$file) respond(['error' => 'File not found'], 404);

    $nameI18n = sanitizeLangMap($body['name_i18n'] ?? []);
    $hashes   = sanitizeLangMap($body['hashes'] ?? []);

    // Keep the denormalized `name` in step with the scenario's default language.
    $sstmt = $pdo->prepare('SELECT data FROM scenarios WHERE id = ?');
    $sstmt->execute([(int)$file['scenario_id']]);
    $data = jsonColumn($sstmt->fetchColumn() ?: '');
    $defaultLang = $data['default_language'] ?? 'fr';
    $defaultName = $nameI18n[$defaultLang] ?? '';

    $upd = $pdo->prepare(
        'UPDATE scenario_files
            SET name_i18n = ?, name_hashes = ?,
                name = COALESCE(NULLIF(?, ""), name)
          WHERE id = ?'
    );
    $upd->execute([
        json_encode($nameI18n, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        json_encode($hashes, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $defaultName,
        $fileId,
    ]);

    respond(['success' => true]);
}

/** Set a file's own language (which edition of the document this row is). */
function handleSetFileMeta(PDO $pdo): void {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) respond(['error' => 'Invalid JSON body'], 400);

    $fileId = (int)($body['file_id'] ?? 0);
    if ($fileId <= 0) respond(['error' => 'file_id required'], 400);
    if (!fileScenarioUniqid($pdo, $fileId)) respond(['error' => 'File not found'], 404);

    $language = $body['language'] ?? null;
    if ($language !== null && $language !== '' && !isLang($language)) {
        respond(['error' => 'Unsupported language'], 400);
    }

    $upd = $pdo->prepare('UPDATE scenario_files SET language = ? WHERE id = ?');
    $upd->execute([$language === '' ? null : $language, $fileId]);

    respond(['success' => true]);
}
