<?php
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ScenarioHashes.php';
require_once __DIR__ . '/../utils/LocalizedCompat.php';
require_once __DIR__ . '/../utils/ScenarioLanguages.php';

setCorsHeaders();
session_start();
// This endpoint only READS the session. Release its lock straight away so the
// browser's parallel requests do not queue behind one another (a slow save or
// hash recompute used to hold every other call - retours sept. 2026 #42).
session_write_close();

/** The 12 player-facing language codes a file may be tagged with. */
const SCENARIO_FILE_LANGS = ['en','fr','es','de','it','pt','nl','pl','ru','ja','zh','ar'];

$action = $_GET['action'] ?? '';

error_log("scenario_files.php - Action: $action");

function resolveEmailFromRequest() {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (!empty($token)) {
        $db = Database::getInstance();
        $tokenData = TokenManager::validateToken($db, $token);
        if ($tokenData) {
            return $tokenData['email'];
        }
    }
    return null;
}

/**
 * The language to serve a viewer in: their `clients.language` when they are a
 * client, else the scenario's own default. Admins browsing the client view get
 * the scenario default, which is what the document was authored in.
 */
function clientLanguageFor($pdo, $email, $scenarioDefaultLang, $scenarioRow = null) {
    if (!$email) return $scenarioDefaultLang;
    $stmt = $pdo->prepare("SELECT id, language FROM clients WHERE email = ?");
    $stmt->execute([$email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $lang = $row['language'] ?? '';
    if (!in_array($lang, SCENARIO_FILE_LANGS, true)) return $scenarioDefaultLang;
    // A language an admin has not validated yet is not served: the client gets
    // the primary documents, as if that edition did not exist.
    if ($row && is_array($scenarioRow)
        && !in_array($lang, ScenarioLanguages::visibleLanguages($pdo, $scenarioRow, (int)$row['id']), true)) {
        return $scenarioDefaultLang;
    }
    return $lang;
}

/**
 * The languages of this scenario the caller may see: everything for an admin
 * (any email that is not a client's), the validated set for a client.
 * `$scenarioRow` needs data, client_id and validated_languages.
 */
function visibleLanguagesFor($pdo, $email, array $scenarioRow) {
    $stmt = $pdo->prepare("SELECT id FROM clients WHERE email = ?");
    $stmt->execute([$email]);
    $clientId = $stmt->fetchColumn();
    if ($clientId === false) return ScenarioLanguages::fromData($scenarioRow['data'] ?? null);
    return ScenarioLanguages::visibleLanguages($pdo, $scenarioRow, (int)$clientId);
}

/**
 * Collapse language variants to ONE row per document, resolved for `$lang`.
 *
 * Files are grouped by `COALESCE(parent_file_id, id)`. Within a group the row
 * whose `language` matches wins; otherwise the primary is served, so a document
 * that only exists in French is still downloadable (and is honestly labelled
 * with its own `language`, which the client UI shows as a chip). The display
 * name is resolved from `name_i18n`, falling back to the stored `name`.
 */
function resolveFilesForLanguage(array $files, $lang, $defaultLang) {
    $groups = [];
    foreach ($files as $f) {
        $key = $f['parent_file_id'] !== null ? (int)$f['parent_file_id'] : (int)$f['id'];
        $groups[$key][] = $f;
    }

    $out = [];
    foreach ($groups as $key => $members) {
        $primary = null;
        $match = null;
        foreach ($members as $m) {
            if ($m['parent_file_id'] === null) $primary = $m;
            if ($match === null && $m['language'] === $lang) $match = $m;
        }
        // A group whose primary was deleted still has variants; fall back to
        // the first member rather than dropping the document entirely.
        $chosen = $match ?? $primary ?? $members[0];

        $nameI18n = !empty($chosen['name_i18n']) ? json_decode($chosen['name_i18n'], true) : null;
        if (!is_array($nameI18n) || !$nameI18n) {
            // Variants inherit the primary's localized title.
            $parentI18n = $primary && !empty($primary['name_i18n'])
                ? json_decode($primary['name_i18n'], true)
                : null;
            $nameI18n = is_array($parentI18n) ? $parentI18n : null;
        }
        if ($nameI18n) {
            $localized = LocalizedCompat::getLocalized($nameI18n, $lang, $defaultLang);
            if ($localized !== '') $chosen['name'] = $localized;
        }

        $out[] = $chosen;
    }
    return $out;
}

/**
 * May this caller read a scenario's attached files?
 *
 * The three historical checks were: owns it, is an admin, or holds an explicit
 * `client_scenarios` grant. That misses PREMIUM clients entirely - they hold the
 * whole product catalogue with NO grant rows (see client_scenarios.php?action=list,
 * which serves them `scenario_type = "product"` directly and even counts the
 * attached files for the card badge). So a premium client saw the scenario, saw
 * that it had downloadable files, opened the tab and got a silent 403: "aucun
 * fichier disponible pour le moment" (retour Ludiom #59). This adds that fourth
 * case, matching what the catalogue already shows them.
 *
 * @param int|string $scenarioId
 */
function clientMayReadScenarioFiles($pdo, $scenarioId, $email) {
    $stmt = $pdo->prepare("
        SELECT s.scenario_type, s.data, s.client_id, s.validated_languages, c.email AS client_email, a.email AS admin_email
        FROM scenarios s
        LEFT JOIN clients c ON s.client_id = c.id
        LEFT JOIN admin_users a ON s.created_by = a.id
        WHERE s.id = ?
    ");
    $stmt->execute([$scenarioId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return false;

    // Owner (client or authoring admin).
    if ($row['client_email'] === $email || $row['admin_email'] === $email) return true;

    // Any admin.
    $stmt = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch(PDO::FETCH_ASSOC)) return true;

    // Explicit grant, in any mode.
    $stmt = $pdo->prepare("
        SELECT cs.id FROM client_scenarios cs
        JOIN clients c ON cs.client_id = c.id
        WHERE cs.scenario_id = ? AND c.email = ?
    ");
    $stmt->execute([$scenarioId, $email]);
    if ($stmt->fetch(PDO::FETCH_ASSOC)) return true;

    // Premium client + product released in the client's language = implicit access.
    if ($row['scenario_type'] === 'product') {
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE email = ? AND license_type = 'premium'");
        $stmt->execute([$email]);
        $premium = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($premium) {
            if (ScenarioLanguages::hasVisibleLanguage($pdo, $row, (int)$premium['id'], ScenarioLanguages::clientLanguage($pdo, $premium['id']))) {
                return true;
            }
        }
    }

    return false;
}

try {
    $dbInstance = Database::getInstance();
    $pdo = $dbInstance->getConnection();
    error_log("scenario_files.php - Database connection established");

    switch ($action) {
        case 'upload':
            handleUpload($pdo);
            break;

        case 'list':
            handleList($pdo);
            break;

        case 'delete':
            handleDelete($pdo);
            break;

        case 'download_zip':
            handleDownloadZip($pdo);
            break;

        case 'download_file':
            handleDownloadFile($pdo);
            break;

        case 'get_scenario':
            handleGetScenario($pdo);
            break;

        case 'recap':
            handleRecap($pdo);
            break;

        case 'upload_video':
            handleUploadVideo($pdo);
            break;

        default:
            error_log("scenario_files.php - Invalid action: $action");
            http_response_code(400);
            echo json_encode(['error' => 'Invalid action']);
    }
} catch (Exception $e) {
    error_log("scenario_files.php - Exception: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}

function handleGetScenario($pdo) {
    $uniqid = $_GET['uniqid'] ?? null;
    if (!$uniqid) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing uniqid']);
        return;
    }

    $email = resolveEmailFromRequest();
    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT s.id, s.title, s.description, s.uniqid, s.medias, s.data,
               s.game_type, s.scenario_type, IFNULL(s.version, '1.0') as version, s.client_id,
               s.validated_languages, c.email as client_email
        FROM scenarios s
        LEFT JOIN clients c ON s.client_id = c.id
        WHERE s.uniqid = ?
    ");
    $stmt->execute([$uniqid]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    // Read access: owner / admin / explicit grant / premium+product (#59).
    if (!clientMayReadScenarioFiles($pdo, $scenario['id'], $email)) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $mediasJson = $scenario['medias'];
    $medias = $mediasJson ? json_decode($mediasJson, true) : [];

    // Return relative paths; the frontend prefixes with VITE_MEDIA_BASE_URL.
    $baseUrl = '/media/' . $uniqid . '/';
    $images = [];

    $mediaDir = __DIR__ . '/../../media/' . $uniqid . '/';
    if (is_dir($mediaDir)) {
        $allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        foreach (scandir($mediaDir) as $file) {
            if ($file === '.' || $file === '..' || is_dir($mediaDir . $file)) continue;
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if (in_array($ext, $allowedExts)) {
                $images[] = $baseUrl . $file;
            }
        }
    }

    $gameVisual = null;
    if (!empty($medias['images']['game_visual'])) {
        $gv = $medias['images']['game_visual'];
        // Pass through absolute URLs unchanged; otherwise return as-is (relative).
        $gameVisual = $gv;
    }

    $videoUrl = null;
    if (!empty($medias['video'])) {
        $videoUrl = $medias['video'];
    }

    // Difficulty / audience live in the scenario's game_meta. Tolerate both the
    // flat (`game_meta.…`) and wrapped (`data.game_meta.…`) shapes, mirroring
    // the admin ScenariosView readers.
    $dataArr = $scenario['data']
        ? ScenarioLanguages::strip(json_decode($scenario['data'], true), visibleLanguagesFor($pdo, $email, $scenario))
        : [];
    $gameMeta = $dataArr['game_meta'] ?? ($dataArr['data']['game_meta'] ?? []);
    $difficulty = is_array($gameMeta) ? ($gameMeta['difficulty'] ?? null) : null;
    $audience = is_array($gameMeta) ? ($gameMeta['game_public'] ?? null) : null;
    $scenarioDefaultLang = $dataArr['default_language'] ?? 'fr';

    // One row per DOCUMENT, resolved to the caller's own language: a client
    // whose account language is `en` gets the EN edition (and its EN title)
    // where the admin uploaded one, and the primary otherwise.
    $viewerLang = clientLanguageFor($pdo, $email, $scenarioDefaultLang, $scenario);
    $stmt4 = $pdo->prepare("
        SELECT id, name, name_i18n, language, parent_file_id, file_path, file_size, mime_type, created_at
        FROM scenario_files WHERE scenario_id = ? ORDER BY created_at DESC
    ");
    $stmt4->execute([$scenario['id']]);
    $files = resolveFilesForLanguage($stmt4->fetchAll(PDO::FETCH_ASSOC), $viewerLang, $scenarioDefaultLang);

    // « Informations » (game_meta.story): licensee-facing notes typed in the
    // editor, never shown to players. Localized ({lang: text}) or a legacy
    // plain string; resolved to the viewer's language, then the scenario's
    // default, then the first non-empty edition.
    $storyRaw = is_array($gameMeta) ? ($gameMeta['story'] ?? null) : null;
    $information = null;
    if (is_string($storyRaw)) {
        $information = trim($storyRaw) !== '' ? $storyRaw : null;
    } elseif (is_array($storyRaw)) {
        foreach ([$viewerLang, $scenarioDefaultLang] as $lang) {
            if (isset($storyRaw[$lang]) && is_string($storyRaw[$lang]) && trim($storyRaw[$lang]) !== '') {
                $information = $storyRaw[$lang];
                break;
            }
        }
        if ($information === null) {
            foreach ($storyRaw as $text) {
                if (is_string($text) && trim($text) !== '') { $information = $text; break; }
            }
        }
    }

    $hasZipFiles = !empty($files);

    // Per-file list so the client can download files one by one. file_path is
    // intentionally omitted; downloads go through the access-checked
    // `download_file` action keyed on the file id.
    // `name` is already the language-resolved label and `id` the resolved
    // file's id, so the unchanged download_file($id) fetches the right edition.
    // name_i18n / parent_file_id / texts_count are admin-only and never leave.
    $fileList = array_map(function ($f) {
        return [
            'id' => (int)$f['id'],
            'name' => $f['name'],
            'file_size' => (int)$f['file_size'],
            'mime_type' => $f['mime_type'],
            'filename' => basename($f['file_path']),
            'language' => $f['language'],
            'created_at' => $f['created_at'],
        ];
    }, $files);

    echo json_encode([
        'success' => true,
        'data' => [
            'id' => $scenario['id'],
            'title' => $scenario['title'],
            'description' => $scenario['description'],
            'uniqid' => $scenario['uniqid'],
            'game_type' => $scenario['game_type'],
            'scenario_type' => $scenario['scenario_type'],
            'version' => $scenario['version'],
            'difficulty' => $difficulty,
            'audience' => $audience,
            'information' => $information,
            'game_visual' => $gameVisual,
            'images' => $images,
            'video_url' => $videoUrl,
            'has_zip_files' => $hasZipFiles,
            'files_count' => count($files),
            'files' => $fileList,
        ]
    ]);
}

/* ───────────────────────────── Scenario recap ───────────────────────────────
 * The "little book" page of the old Laravel app (/jeux/scenario/...), which
 * licensees used to read which balise produced which image. It disappeared in
 * the Studio rewrite and was missed (retour Ludiom #40).
 *
 * This action returns the ONE thing that page was really for: the scenario's
 * items (enigmas / quests / checkpoints) with their images, points and - via
 * `pattern_slot` on each image - which pattern row slot the image is assigned
 * to. The frontend joins that against `patterns.php?action=list` +
 * `?action=stations` to print the station number and name, so a licensee can
 * pick a pattern and see the full correspondence.
 *
 * Localized fields are flattened to the scenario's default language (the recap
 * is a paper document; there is no language switcher on it).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Flatten a Localized<string> map (or a legacy plain string) to one language. */
function recapText($value, $lang) {
    if (is_string($value)) return $value;
    if (!is_array($value)) return '';
    if (isset($value[$lang]) && is_string($value[$lang]) && $value[$lang] !== '') {
        return $value[$lang];
    }
    foreach ($value as $v) {
        if (is_string($v) && $v !== '') return $v;
    }
    return '';
}

/** Resolve a bare media filename to the path the frontend prefixes with VITE_MEDIA_BASE_URL. */
// Mystery wrong-answer points are authored SIGNED (negative = penalty), like the
// maluses. Legacy scenarios stored the bare magnitude, so show it as the
// negative it actually scores rather than an ambiguous "5 pts".
function recapWrongPoints($raw) {
    $s = trim((string)($raw ?? ''));
    if ($s === '' || !is_numeric($s)) return $s;
    $n = (float)$s;
    if ($n == 0) return '0';
    return $n > 0 ? '-' . ltrim($s, '+') : $s;
}

function recapMediaUrl($filename, $uniqid) {
    $filename = trim((string)$filename);
    if ($filename === '') return null;
    if (strpos($filename, 'http') === 0 || strpos($filename, '/') === 0) return $filename;
    return '/media/' . $uniqid . '/' . basename($filename);
}

/**
 * One recap image entry. `pattern_slot` is the `pattern_items.assignment_type`
 * this image is read from at runtime - null for images a pattern never maps
 * (a quest's assembled picture, say).
 */
function recapImage($label, $slot, $filename, $uniqid) {
    $url = recapMediaUrl($filename, $uniqid);
    if ($url === null) return null;
    return ['label' => $label, 'pattern_slot' => $slot, 'url' => $url];
}

function handleRecap($pdo) {
    $uniqid = $_GET['uniqid'] ?? null;
    if (!$uniqid) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing uniqid']);
        return;
    }

    $email = resolveEmailFromRequest();
    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT id, title, description, uniqid, game_type, scenario_type,
               IFNULL(version, '1.0') AS version, data, medias
        FROM scenarios WHERE uniqid = ?
    ");
    $stmt->execute([$uniqid]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    // Same read gate as the files tab - including the premium/product case.
    if (!clientMayReadScenarioFiles($pdo, $scenario['id'], $email)) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $dataArr = $scenario['data'] ? json_decode($scenario['data'], true) : [];
    if (!is_array($dataArr)) $dataArr = [];
    // Tolerate the wrapped (`data.data.game_meta`) shape older rows carry.
    $root = isset($dataArr['game_meta']) ? $dataArr : ($dataArr['data'] ?? $dataArr);
    $gameMeta = is_array($root['game_meta'] ?? null) ? $root['game_meta'] : [];
    $lang = is_string($root['default_language'] ?? null) ? $root['default_language'] : 'fr';

    $medias = $scenario['medias'] ? json_decode($scenario['medias'], true) : [];
    if (!is_array($medias)) $medias = [];

    $gameType = $scenario['game_type'];
    $items = [];

    if ($gameType === 'mystery') {
        // Per-enigma images live in `medias.enigmas[]` keyed by enigma_number
        // (cleanGameMetaForData strips them out of game_meta on save).
        $byNumber = [];
        foreach ((is_array($medias['enigmas'] ?? null) ? $medias['enigmas'] : []) as $m) {
            if (is_array($m) && isset($m['enigma_number'])) {
                $byNumber[(string)$m['enigma_number']] = $m;
            }
        }
        foreach ((is_array($gameMeta['enigmas'] ?? null) ? $gameMeta['enigmas'] : []) as $i => $e) {
            if (!is_array($e)) continue;
            $number = (string)($e['number'] ?? ($i + 1));
            $m = $byNumber[$number] ?? [];
            $images = array_values(array_filter([
                recapImage('good_answer', 'good_answer_station', $m['good_answer_image'] ?? ($e['good_answer_image'] ?? ''), $uniqid),
                recapImage('wrong_answer', 'wrong_answer_station', $m['wrong_answer_image'] ?? ($e['wrong_answer_image'] ?? ''), $uniqid),
            ]));
            $items[] = [
                // `pattern_index` is what a pattern row is matched on. Mystery
                // matches by enigma NUMBER (that is what item_index carries),
                // not by position - see useMysteryPatternStations.
                'pattern_index' => is_numeric($number) ? (int)$number : ($i + 1),
                'number' => $number,
                'title' => recapText($e['text'] ?? '', $lang),
                'description' => '',
                'points' => [
                    'good' => (string)($e['good_answer_points'] ?? ''),
                    'wrong' => recapWrongPoints($e['wrong_answer_points'] ?? ''),
                ],
                'images' => $images,
            ];
        }
    } elseif ($gameType === 'tagquest') {
        $byIndex = [];
        foreach ((is_array($medias['quests'] ?? null) ? $medias['quests'] : []) as $m) {
            if (is_array($m) && isset($m['quest_index'])) {
                $byIndex[(int)$m['quest_index']] = $m;
            }
        }
        foreach ((is_array($gameMeta['quests'] ?? null) ? $gameMeta['quests'] : []) as $i => $q) {
            if (!is_array($q)) continue;
            $m = $byIndex[$i] ?? [];
            $images = [];
            // The assembled picture the four pieces build up to - the very thing
            // the old recap page existed to show next to its balises.
            $main = recapImage('main_image', null, $m['main_image'] ?? ($q['main_image'] ?? ''), $uniqid);
            if ($main) $images[] = $main;
            foreach ([1, 2, 3, 4] as $n) {
                $piece = recapImage('image_' . $n, 'image_' . $n, $m['image_' . $n] ?? ($q['image_' . $n] ?? ''), $uniqid);
                if ($piece) $images[] = $piece;
            }
            $items[] = [
                // Tagquest patterns are matched POSITIONALLY onto quests
                // (see useTagquestPatternStations), so row 1 = quest 1.
                'pattern_index' => $i + 1,
                'number' => (string)($i + 1),
                'title' => recapText($q['name'] ?? '', $lang),
                'description' => '',
                'points' => ['points' => (string)($q['points'] ?? '')],
                'images' => $images,
            ];
        }
    } elseif ($gameType === 'tracks') {
        $byNumber = [];
        foreach ((is_array($medias['checkpoints'] ?? null) ? $medias['checkpoints'] : []) as $m) {
            if (is_array($m) && isset($m['checkpoint_number'])) {
                $byNumber[(int)$m['checkpoint_number']] = $m;
            }
        }
        foreach ((is_array($gameMeta['checkpoints'] ?? null) ? $gameMeta['checkpoints'] : []) as $i => $c) {
            if (!is_array($c)) continue;
            $m = $byNumber[$i + 1] ?? [];
            $images = array_values(array_filter([
                recapImage('checkpoint', 'station', $m['image'] ?? ($c['image'] ?? ''), $uniqid),
            ]));
            $items[] = [
                'pattern_index' => $i + 1,
                'number' => (string)($i + 1),
                'title' => recapText($c['title'] ?? '', $lang),
                'description' => recapText($c['description'] ?? '', $lang),
                'points' => ['points' => (string)($c['points'] ?? '')],
                'images' => $images,
            ];
        }
    }

    echo json_encode([
        'success' => true,
        'data' => [
            'uniqid' => $scenario['uniqid'],
            'title' => $scenario['title'],
            'description' => $scenario['description'],
            'game_type' => $gameType,
            'scenario_type' => $scenario['scenario_type'],
            'version' => $scenario['version'],
            'language' => $lang,
            'background_image' => recapMediaUrl($medias['images']['background_image'] ?? '', $uniqid),
            // The pattern the author picked as this scenario's default, so the
            // recap can preselect it instead of making the licensee guess.
            'default_pattern_uniqid' => is_string($gameMeta['scenario_default_pattern'] ?? null)
                ? $gameMeta['scenario_default_pattern']
                : null,
            'items' => $items,
        ],
    ]);
}

function handleUploadVideo($pdo) {
    $email = resolveEmailFromRequest();
    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    if (!isset($_FILES['video']) || !isset($_POST['uniqid'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: video, uniqid']);
        return;
    }

    $uniqid = $_POST['uniqid'];
    $file = $_FILES['video'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'File upload error: ' . $file['error']]);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT s.id, s.medias, s.client_id, c.email as client_email
        FROM scenarios s
        LEFT JOIN clients c ON s.client_id = c.id
        WHERE s.uniqid = ?
    ");
    $stmt->execute([$uniqid]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    $hasAccess = ($scenario['client_email'] === $email);
    if (!$hasAccess) {
        $stmt2 = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt2->execute([$email]);
        $hasAccess = ($stmt2->fetch(PDO::FETCH_ASSOC) !== false);
    }
    if (!$hasAccess) {
        $stmt3 = $pdo->prepare("
            SELECT cs.id FROM client_scenarios cs
            JOIN clients c ON cs.client_id = c.id
            WHERE cs.scenario_id = ? AND c.email = ?
        ");
        $stmt3->execute([$scenario['id'], $email]);
        $hasAccess = ($stmt3->fetch(PDO::FETCH_ASSOC) !== false);
    }

    if (!$hasAccess) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);

    $allowedMimes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    if (!in_array($mimeType, $allowedMimes)) {
        http_response_code(400);
        echo json_encode(['error' => 'Only video files are allowed (mp4, webm, ogg, mov)']);
        return;
    }

    if ($file['size'] > 700 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['error' => 'Video file must be less than 700MB']);
        return;
    }

    $uploadDir = __DIR__ . '/../../media/' . $uniqid . '/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $videoFilename = 'scenario_video_' . time() . '.' . $ext;
    $fullPath = $uploadDir . $videoFilename;

    if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save video file']);
        return;
    }

    $videoPath = '/media/' . $uniqid . '/' . $videoFilename;
    $medias = $scenario['medias'] ? json_decode($scenario['medias'], true) : [];
    $medias['video'] = $videoPath;

    $stmt4 = $pdo->prepare("UPDATE scenarios SET medias = ? WHERE id = ?");
    $stmt4->execute([json_encode($medias), $scenario['id']]);

    try {
        ScenarioHashes::recompute($pdo, $uniqid);
    } catch (Exception $e) {
        error_log('scenario_files.php - recompute hashes failed: ' . $e->getMessage());
    }

    echo json_encode([
        'success' => true,
        'video_url' => $videoPath
    ]);
}

function handleUpload($pdo) {
    error_log("handleUpload - Starting file upload");

    $email = resolveEmailFromRequest();
    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    if (!isset($_FILES['file']) || !isset($_POST['scenario_id']) || !isset($_POST['name'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required fields: file, scenario_id, name']);
        return;
    }

    $scenarioId = $_POST['scenario_id'];
    $name = $_POST['name'];
    $file = $_FILES['file'];

    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'File upload error: ' . $file['error']]);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT s.id, s.uniqid, s.client_id, s.created_by,
               c.email as client_email,
               a.email as admin_email
        FROM scenarios s
        LEFT JOIN clients c ON s.client_id = c.id
        LEFT JOIN admin_users a ON s.created_by = a.id
        WHERE s.id = ?
    ");
    $stmt->execute([$scenarioId]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    $isOwner = ($scenario['client_email'] === $email) || ($scenario['admin_email'] === $email);
    $isAdmin = false;
    if (!$isOwner) {
        $stmt2 = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt2->execute([$email]);
        $isAdmin = ($stmt2->fetch(PDO::FETCH_ASSOC) !== false);
    }

    if (!$isOwner && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized - scenario does not belong to this user']);
        return;
    }

    $uniqid = $scenario['uniqid'];
    $uploadDir = __DIR__ . '/../../media/' . $uniqid . '/files/';

    if (!file_exists($uploadDir)) {
        if (!mkdir($uploadDir, 0755, true)) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create upload directory']);
            return;
        }
    }

    $originalFilename = basename($file['name']);
    $fileExtension = pathinfo($originalFilename, PATHINFO_EXTENSION);
    $safeFilename = preg_replace('/[^a-zA-Z0-9_-]/', '_', pathinfo($originalFilename, PATHINFO_FILENAME));
    $uniqueFilename = $safeFilename . '_' . time() . '.' . $fileExtension;
    $filePath = $uniqid . '/files/' . $uniqueFilename;
    $fullPath = $uploadDir . $uniqueFilename;

    if (!move_uploaded_file($file['tmp_name'], $fullPath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save file']);
        return;
    }

    $fileSize = filesize($fullPath);
    $mimeType = mime_content_type($fullPath);

    // Optional: which language edition this file is, and - for "add a language
    // version" - which primary document it is a variant of.
    $language = isset($_POST['language']) && $_POST['language'] !== ''
        ? $_POST['language']
        : null;
    if ($language !== null && !in_array($language, SCENARIO_FILE_LANGS, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Unsupported language']);
        return;
    }

    $parentFileId = isset($_POST['parent_file_id']) && $_POST['parent_file_id'] !== ''
        ? (int)$_POST['parent_file_id']
        : null;
    if ($parentFileId !== null) {
        // The parent must belong to the SAME scenario and be a primary itself:
        // exactly one level of nesting, no variant-of-a-variant.
        $pstmt = $pdo->prepare(
            "SELECT id FROM scenario_files
              WHERE id = ? AND scenario_id = ? AND parent_file_id IS NULL"
        );
        $pstmt->execute([$parentFileId, $scenarioId]);
        if (!$pstmt->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid parent_file_id for this scenario']);
            return;
        }
    }

    $stmt3 = $pdo->prepare("
        INSERT INTO scenario_files (scenario_id, name, file_path, file_size, mime_type, language, parent_file_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt3->execute([$scenarioId, $name, $filePath, $fileSize, $mimeType, $language, $parentFileId]);
    $fileId = $pdo->lastInsertId();

    echo json_encode([
        'success' => true,
        'data' => [
            'id' => $fileId,
            'scenario_id' => $scenarioId,
            'name' => $name,
            'file_path' => $filePath,
            'file_size' => $fileSize,
            'mime_type' => $mimeType,
            'language' => $language,
            'parent_file_id' => $parentFileId,
            'created_at' => date('Y-m-d H:i:s')
        ],
        'message' => 'File uploaded successfully'
    ]);
}

function handleList($pdo) {
    if (!isset($_GET['scenario_id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing scenario_id']);
        return;
    }

    $scenarioId = $_GET['scenario_id'];

    // SECURITY: this action used to run with NO authorization at all - any
    // caller could enumerate any scenario's files by id. It now carries
    // translation state (name_i18n, texts_count) that is ADMIN ONLY, so it is
    // gated like every other read here, and the admin-only columns are stripped
    // for everyone else.
    $email = resolveEmailFromRequest();
    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }
    if (!clientMayReadScenarioFiles($pdo, $scenarioId, $email)) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        return;
    }

    $adminStmt = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
    $adminStmt->execute([$email]);
    $isAdmin = ($adminStmt->fetch(PDO::FETCH_ASSOC) !== false);

    $stmt = $pdo->prepare("
        SELECT sf.id, sf.scenario_id, sf.name, sf.name_i18n, sf.language,
               sf.parent_file_id, sf.file_path, sf.file_size, sf.mime_type, sf.created_at,
               (SELECT COUNT(*) FROM scenario_file_texts t WHERE t.file_id = sf.id) AS texts_count
        FROM scenario_files sf
        WHERE sf.scenario_id = ?
        ORDER BY COALESCE(sf.parent_file_id, sf.id) ASC, sf.parent_file_id IS NOT NULL, sf.created_at DESC
    ");
    $stmt->execute([$scenarioId]);
    $files = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // A client never sees a variant in a language not validated yet.
    if (!$isAdmin) {
        $sStmt = $pdo->prepare("SELECT data, client_id, validated_languages FROM scenarios WHERE id = ?");
        $sStmt->execute([$scenarioId]);
        $sRow = $sStmt->fetch(PDO::FETCH_ASSOC);
        $visible = $sRow ? visibleLanguagesFor($pdo, $email, $sRow) : [];
        $files = array_values(array_filter($files, function ($f) use ($visible) {
            return $f['parent_file_id'] === null || in_array($f['language'], $visible, true);
        }));
    }

    $out = array_map(function ($f) use ($isAdmin) {
        $row = [
            'id'             => (int)$f['id'],
            'scenario_id'    => (int)$f['scenario_id'],
            'name'           => $f['name'],
            'file_path'      => $f['file_path'],
            'file_size'      => (int)$f['file_size'],
            'mime_type'      => $f['mime_type'],
            'language'       => $f['language'],
            'parent_file_id' => $f['parent_file_id'] !== null ? (int)$f['parent_file_id'] : null,
            'created_at'     => $f['created_at'],
        ];
        if ($isAdmin) {
            $decoded = $f['name_i18n'] ? json_decode($f['name_i18n'], true) : null;
            $row['name_i18n']   = is_array($decoded) ? $decoded : [];
            $row['texts_count'] = (int)$f['texts_count'];
        }
        return $row;
    }, $files);

    echo json_encode(['success' => true, 'data' => $out]);
}

function handleDelete($pdo) {
    $email = resolveEmailFromRequest();
    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing required field: id']);
        return;
    }

    $fileId = $data['id'];

    $stmt = $pdo->prepare("
        SELECT sf.file_path, s.id as scenario_id, s.client_id, s.created_by,
               c.email as client_email,
               a.email as admin_email
        FROM scenario_files sf
        JOIN scenarios s ON sf.scenario_id = s.id
        LEFT JOIN clients c ON s.client_id = c.id
        LEFT JOIN admin_users a ON s.created_by = a.id
        WHERE sf.id = ?
    ");
    $stmt->execute([$fileId]);
    $file = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$file) {
        http_response_code(404);
        echo json_encode(['error' => 'File not found']);
        return;
    }

    $isOwner = ($file['client_email'] === $email) || ($file['admin_email'] === $email);
    $isAdmin = false;
    if (!$isOwner) {
        $stmt2 = $pdo->prepare("SELECT id FROM admin_users WHERE email = ?");
        $stmt2->execute([$email]);
        $isAdmin = ($stmt2->fetch(PDO::FETCH_ASSOC) !== false);
    }

    if (!$isOwner && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized - file does not belong to this user']);
        return;
    }

    $fullPath = __DIR__ . '/../../media/' . $file['file_path'];
    if (file_exists($fullPath)) {
        unlink($fullPath);
    }

    $stmt3 = $pdo->prepare("DELETE FROM scenario_files WHERE id = ?");
    $stmt3->execute([$fileId]);

    echo json_encode(['success' => true, 'message' => 'File deleted successfully']);
}

function handleDownloadZip($pdo) {
    $uniqid = $_GET['uniqid'] ?? null;
    if (!$uniqid) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing uniqid']);
        return;
    }

    $email = resolveEmailFromRequest();
    if (!$email) {
        // SECURITY: unauthenticated identity fallback - passing ?email=<an
        // admin> satisfies the whole ACL below. It exists because emailed
        // download links carry no token. Tightening it is a separate, visible
        // change (it breaks those links), so it is left as-is deliberately.
        $email = $_GET['email'] ?? null;
    }

    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT s.id, s.title, s.uniqid, s.client_id, s.created_by, s.data, s.validated_languages,
               c.email as client_email,
               a.email as admin_email
        FROM scenarios s
        LEFT JOIN clients c ON s.client_id = c.id
        LEFT JOIN admin_users a ON s.created_by = a.id
        WHERE s.uniqid = ?
    ");
    $stmt->execute([$uniqid]);
    $scenario = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$scenario) {
        http_response_code(404);
        echo json_encode(['error' => 'Scenario not found']);
        return;
    }

    // Same read rule as the per-file download (#59).
    $isOwner = clientMayReadScenarioFiles($pdo, $scenario['id'], $email);
    $isAdmin = false;

    if (!$isOwner && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    // The ZIP must contain exactly what the file list offered, so it runs the
    // same language resolution: one entry per document, in the caller's
    // language where that edition exists, named with the localized title.
    $zipData = $scenario['data'] ?? null;
    $zipDataArr = $zipData ? json_decode($zipData, true) : [];
    $zipDefaultLang = is_array($zipDataArr) ? ($zipDataArr['default_language'] ?? 'fr') : 'fr';
    $zipLang = clientLanguageFor($pdo, $email, $zipDefaultLang, $scenario);

    $stmt4 = $pdo->prepare("
        SELECT id, name, name_i18n, language, parent_file_id, file_path
        FROM scenario_files WHERE scenario_id = ?
    ");
    $stmt4->execute([$scenario['id']]);
    $files = resolveFilesForLanguage($stmt4->fetchAll(PDO::FETCH_ASSOC), $zipLang, $zipDefaultLang);

    if (empty($files)) {
        http_response_code(404);
        echo json_encode(['error' => 'No files found for this scenario']);
        return;
    }

    $zipFilename = 'scenario_' . $uniqid . '_files_' . time() . '.zip';
    $zipPath = sys_get_temp_dir() . '/' . $zipFilename;

    $zip = new ZipArchive();
    if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create zip file']);
        return;
    }

    foreach ($files as $file) {
        $fullPath = __DIR__ . '/../../media/' . $file['file_path'];
        if (file_exists($fullPath)) {
            // `name` is free text and now also translator-supplied, so strip
            // path separators before it becomes a ZIP entry name - otherwise a
            // title containing "/" writes into a subdirectory on extract.
            $entryName = str_replace(['/', '\\'], '-', (string)$file['name']);
            $zip->addFile($fullPath, $entryName . '_' . basename($file['file_path']));
        }
    }

    $zip->close();

    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $zipFilename . '"');
    header('Content-Length: ' . filesize($zipPath));
    header('Cache-Control: no-cache, must-revalidate');

    readfile($zipPath);
    unlink($zipPath);
    exit;
}

function handleDownloadFile($pdo) {
    $fileId = $_GET['id'] ?? null;
    if (!$fileId) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing file id']);
        return;
    }

    $email = resolveEmailFromRequest();
    if (!$email) {
        // SECURITY: unauthenticated identity fallback - passing ?email=<an
        // admin> satisfies the whole ACL below. It exists because emailed
        // download links carry no token. Tightening it is a separate, visible
        // change (it breaks those links), so it is left as-is deliberately.
        $email = $_GET['email'] ?? null;
    }
    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT sf.name, sf.name_i18n, sf.language, sf.parent_file_id, sf.file_path, sf.mime_type,
               s.id as scenario_id, s.client_id, s.created_by, s.data, s.validated_languages,
               c.email as client_email,
               a.email as admin_email
        FROM scenario_files sf
        JOIN scenarios s ON sf.scenario_id = s.id
        LEFT JOIN clients c ON s.client_id = c.id
        LEFT JOIN admin_users a ON s.created_by = a.id
        WHERE sf.id = ?
    ");
    $stmt->execute([$fileId]);
    $file = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$file) {
        http_response_code(404);
        echo json_encode(['error' => 'File not found']);
        return;
    }

    // Same read rule as the listing that offered this file (#59) - otherwise a
    // premium client can see the file but not download it.
    if (!clientMayReadScenarioFiles($pdo, $file['scenario_id'], $email)) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    // A variant in a language not validated yet is not released to clients.
    if ($file['parent_file_id'] !== null
        && !in_array($file['language'], visibleLanguagesFor($pdo, $email, $file), true)) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $fullPath = __DIR__ . '/../../media/' . $file['file_path'];
    if (!file_exists($fullPath)) {
        http_response_code(404);
        echo json_encode(['error' => 'File missing on disk']);
        return;
    }

    // Build a friendly download name: the stored label keeps the original
    // extension. The label is localized for the caller so the saved filename
    // matches the title they clicked in the list. A variant with no title of
    // its own inherits its primary's.
    $dlDataArr = $file['data'] ? json_decode($file['data'], true) : [];
    $dlDefaultLang = is_array($dlDataArr) ? ($dlDataArr['default_language'] ?? 'fr') : 'fr';
    $dlLang = clientLanguageFor($pdo, $email, $dlDefaultLang, $file);

    $dlI18n = !empty($file['name_i18n']) ? json_decode($file['name_i18n'], true) : null;
    if ((!is_array($dlI18n) || !$dlI18n) && $file['parent_file_id'] !== null) {
        $pstmt = $pdo->prepare("SELECT name_i18n FROM scenario_files WHERE id = ?");
        $pstmt->execute([(int)$file['parent_file_id']]);
        $parentI18n = $pstmt->fetchColumn();
        $decoded = $parentI18n ? json_decode($parentI18n, true) : null;
        $dlI18n = is_array($decoded) ? $decoded : null;
    }

    $localizedName = is_array($dlI18n) && $dlI18n
        ? LocalizedCompat::getLocalized($dlI18n, $dlLang, $dlDefaultLang)
        : '';

    $ext = pathinfo($file['file_path'], PATHINFO_EXTENSION);
    $base = $localizedName !== ''
        ? $localizedName
        : ($file['name'] !== '' ? $file['name'] : pathinfo($file['file_path'], PATHINFO_FILENAME));
    $downloadName = preg_replace('/[\r\n"]/', '', $base);
    if ($ext && strtolower(pathinfo($downloadName, PATHINFO_EXTENSION)) !== strtolower($ext)) {
        $downloadName .= '.' . $ext;
    }

    header('Content-Type: ' . ($file['mime_type'] ?: 'application/octet-stream'));
    header('Content-Disposition: attachment; filename="' . $downloadName . '"');
    header('Content-Length: ' . filesize($fullPath));
    header('Cache-Control: no-cache, must-revalidate');

    readfile($fullPath);
    exit;
}
