<?php
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ScenarioHashes.php';

setCorsHeaders();
session_start();

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
        SELECT s.scenario_type, c.email AS client_email, a.email AS admin_email
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

    // Premium client + product scenario = implicit access.
    if ($row['scenario_type'] === 'product') {
        $stmt = $pdo->prepare("SELECT id FROM clients WHERE email = ? AND license_type = 'premium'");
        $stmt->execute([$email]);
        if ($stmt->fetch(PDO::FETCH_ASSOC)) return true;
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
               c.email as client_email
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

    $stmt4 = $pdo->prepare("
        SELECT id, name, file_path, file_size, mime_type, created_at
        FROM scenario_files WHERE scenario_id = ? ORDER BY created_at DESC
    ");
    $stmt4->execute([$scenario['id']]);
    $files = $stmt4->fetchAll(PDO::FETCH_ASSOC);

    $hasZipFiles = !empty($files);

    // Difficulty / audience live in the scenario's game_meta. Tolerate both the
    // flat (`game_meta.…`) and wrapped (`data.game_meta.…`) shapes, mirroring
    // the admin ScenariosView readers.
    $dataArr = $scenario['data'] ? json_decode($scenario['data'], true) : [];
    $gameMeta = $dataArr['game_meta'] ?? ($dataArr['data']['game_meta'] ?? []);
    $difficulty = is_array($gameMeta) ? ($gameMeta['difficulty'] ?? null) : null;
    $audience = is_array($gameMeta) ? ($gameMeta['game_public'] ?? null) : null;

    // Per-file list so the client can download files one by one. file_path is
    // intentionally omitted; downloads go through the access-checked
    // `download_file` action keyed on the file id.
    $fileList = array_map(function ($f) {
        return [
            'id' => (int)$f['id'],
            'name' => $f['name'],
            'file_size' => (int)$f['file_size'],
            'mime_type' => $f['mime_type'],
            'filename' => basename($f['file_path']),
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

    $stmt3 = $pdo->prepare("
        INSERT INTO scenario_files (scenario_id, name, file_path, file_size, mime_type)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt3->execute([$scenarioId, $name, $filePath, $fileSize, $mimeType]);
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

    $stmt = $pdo->prepare("
        SELECT id, scenario_id, name, file_path, file_size, mime_type, created_at
        FROM scenario_files
        WHERE scenario_id = ?
        ORDER BY created_at DESC
    ");
    $stmt->execute([$scenarioId]);
    $files = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['success' => true, 'data' => $files]);
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
        $email = $_GET['email'] ?? null;
    }

    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT s.id, s.title, s.uniqid, s.client_id, s.created_by,
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

    $stmt4 = $pdo->prepare("SELECT name, file_path FROM scenario_files WHERE scenario_id = ?");
    $stmt4->execute([$scenario['id']]);
    $files = $stmt4->fetchAll(PDO::FETCH_ASSOC);

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
            $zip->addFile($fullPath, $file['name'] . '_' . basename($file['file_path']));
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
        $email = $_GET['email'] ?? null;
    }
    if (!$email) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        return;
    }

    $stmt = $pdo->prepare("
        SELECT sf.name, sf.file_path, sf.mime_type,
               s.id as scenario_id, s.client_id, s.created_by,
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

    $fullPath = __DIR__ . '/../../media/' . $file['file_path'];
    if (!file_exists($fullPath)) {
        http_response_code(404);
        echo json_encode(['error' => 'File missing on disk']);
        return;
    }

    // Build a friendly download name: the stored label keeps the original extension.
    $ext = pathinfo($file['file_path'], PATHINFO_EXTENSION);
    $base = $file['name'] !== '' ? $file['name'] : pathinfo($file['file_path'], PATHINFO_FILENAME);
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
