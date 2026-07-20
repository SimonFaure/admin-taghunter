<?php

/**
 * Admin-only legacy Taghunter ZIP scenario importer.
 *
 * Endpoint: POST /backend/api/scenario_import.php?action=import
 * Multipart fields:
 *   - zip_file   (required) the legacy export archive
 *   - ownership  (required) 'product' | 'client'
 *   - client_id  (required if ownership='client')
 *
 * Expected ZIP layout:
 *   main_export_file.csv                 (rows: type,slug - only type=game imported)
 *   games/{slug}/csv/game.csv            (title,uniqid,type=mystery|tagquest)
 *   games/{slug}/csv/game_meta.csv       (key/value or legacy 4-col)
 *   games/{slug}/csv/game_enigmas.csv    (mystery)
 *   games/{slug}/csv/game_images.csv     (tagquest, fallback game_media_images.csv)
 *   games/{slug}/csv/game_images_divisions.csv (tagquest)
 *   games/{slug}/csv/game_sounds.csv     (tagquest)
 *   games/{slug}/media/...               (mystery: flat; tagquest: id-folders)
 *
 * Required runtime config (NOT enforced by code - verify on the host):
 *   upload_max_filesize >= 200M, post_max_size >= 220M, memory_limit >= 512M,
 *   max_input_time >= 300, Apache `Timeout 600`. set_time_limit(0) is set below.
 */

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ScenarioHashes.php';

set_time_limit(0);

function ti_json($data, $status = 200) {
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function ti_require_admin() {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
        if ($tokenData) {
            $_SESSION['user_id'] = $tokenData['user_id'];
            $_SESSION['user_type'] = $tokenData['user_type'];
        }
    }
    if (!isset($_SESSION['user_id']) || ($_SESSION['user_type'] ?? '') !== 'admin') {
        ti_json(['error' => 'Forbidden - admin only'], 403);
    }
}

function ti_rrmdir($dir) {
    if (!is_dir($dir)) return;
    foreach (array_diff(scandir($dir), ['.', '..']) as $entry) {
        $full = $dir . DIRECTORY_SEPARATOR . $entry;
        is_dir($full) ? ti_rrmdir($full) : @unlink($full);
    }
    @rmdir($dir);
}

function ti_sanitize_filename($name) {
    if (class_exists('Normalizer')) {
        $nfd = Normalizer::normalize($name, Normalizer::FORM_D);
        $stripped = preg_replace('/\p{Mn}+/u', '', $nfd ?: $name);
    } else {
        $stripped = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
        if ($stripped === false) $stripped = $name;
    }
    $sanitized = preg_replace('/[^a-zA-Z0-9._-]/', '_', $stripped);
    return preg_replace('/_{2,}/', '_', $sanitized);
}

function ti_detect_delimiter($firstLine) {
    return strpos($firstLine, ';') !== false ? ';' : ',';
}

/** Wrap a plain string in a Localized<fr> map; returns [] for empty/non-string. */
function ti_loc_fr($s) {
    if (!is_string($s) || $s === '') return [];
    return ['fr' => $s];
}

/**
 * Mystery only: map known game_user_meta.csv keys to text_* fields. Returns
 * `[mapped, skipped]` where `mapped` is keyed by text_* field (Localized<fr>)
 * and `skipped` is a list of the original keys that have no unambiguous home.
 */
function ti_map_mystery_user_meta($tempDir, $slug) {
    $path = ti_find_game_file($tempDir, $slug, 'game_user_meta.csv');
    if (!$path) return [[], []];
    $rows = ti_parse_csv_file($path);
    $mapping = [
        'start_team' => 'text_player_starts',
        'late_malus' => 'text_late_malus',
        'game_ended' => 'text_team_ended',
        'all_teams_ended' => 'text_all_team_ended',
    ];
    $mapped = [];
    $skipped = [];
    foreach ($rows as $r) {
        $key = $r['meta'] ?? '';
        $val = $r['value'] ?? '';
        if ($key === '') continue;
        if (isset($mapping[$key])) {
            $mapped[$mapping[$key]] = ti_loc_fr($val);
        } else {
            $skipped[] = $key;
        }
    }
    return [$mapped, $skipped];
}

function ti_parse_csv_line($line, $delimiter) {
    $result = [];
    $current = '';
    $inQuotes = false;
    $len = strlen($line);
    for ($i = 0; $i < $len; $i++) {
        $ch = $line[$i];
        $next = $i + 1 < $len ? $line[$i + 1] : '';
        if ($ch === '"' && $inQuotes && $next === '"') {
            $current .= '"';
            $i++;
        } elseif ($ch === '"') {
            $inQuotes = !$inQuotes;
        } elseif ($ch === $delimiter && !$inQuotes) {
            $result[] = trim($current);
            $current = '';
        } else {
            $current .= $ch;
        }
    }
    $result[] = trim($current);
    return $result;
}

function ti_parse_csv_file($path) {
    if (!is_file($path)) return [];
    $text = file_get_contents($path);
    if ($text === false) return [];
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
    $lines = preg_split('/\r\n|\r|\n/', trim($text));
    if (!$lines || count($lines) === 0) return [];
    $delimiter = ti_detect_delimiter($lines[0]);
    $headers = ti_parse_csv_line($lines[0], $delimiter);
    $rows = [];
    for ($i = 1; $i < count($lines); $i++) {
        if (trim($lines[$i]) === '') continue;
        $values = ti_parse_csv_line($lines[$i], $delimiter);
        $row = [];
        foreach ($headers as $j => $h) {
            $row[$h] = $values[$j] ?? '';
        }
        $rows[] = $row;
    }
    return $rows;
}

function ti_csv_to_kv($path) {
    if (!is_file($path)) return [];
    $text = file_get_contents($path);
    if ($text === false) return [];
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
    $lines = preg_split('/\r\n|\r|\n/', trim($text));
    if (!$lines || count($lines) === 0) return [];
    $delimiter = ti_detect_delimiter($lines[0]);
    $headers = ti_parse_csv_line($lines[0], $delimiter);
    $isLegacy4Col = count($headers) === 4
        && ($headers[2] ?? '') === 'game_meta'
        && ($headers[3] ?? '') === 'game_meta_value';
    $kv = [];
    for ($i = 1; $i < count($lines); $i++) {
        if (trim($lines[$i]) === '') continue;
        $cols = ti_parse_csv_line($lines[$i], $delimiter);
        if ($isLegacy4Col && count($cols) >= 4) {
            $key = $cols[2];
            if ($key !== '') $kv[$key] = $cols[3] ?? '';
        } elseif (count($cols) >= 2) {
            $key = $cols[0];
            if ($key !== '') $kv[$key] = $cols[1] ?? '';
        }
    }
    return $kv;
}

/** Find a game file by trying common path layouts under the temp extraction dir. */
function ti_find_game_file($tempDir, $slug, $fileName) {
    $candidates = [
        "$tempDir/games/$slug/csv/$fileName",
        "$tempDir/$slug/csv/$fileName",
        "$tempDir/games/$slug/$fileName",
        "$tempDir/$slug/$fileName",
    ];
    foreach ($candidates as $c) {
        if (is_file($c)) return $c;
    }
    // Fuzzy fallback: any file under tempDir whose path contains slug and ends with fileName.
    $slugLower = strtolower($slug);
    $fileLower = strtolower($fileName);
    $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tempDir, RecursiveDirectoryIterator::SKIP_DOTS));
    foreach ($iter as $f) {
        if (!$f->isFile()) continue;
        $rel = strtolower(str_replace(DIRECTORY_SEPARATOR, '/', $f->getPathname()));
        if (strpos($rel, $slugLower) !== false && substr($rel, -strlen('/' . $fileLower)) === '/' . $fileLower) {
            return $f->getPathname();
        }
    }
    return null;
}

/** Locate the first regular file inside a per-id media folder (tagquest). */
function ti_find_media_in_id_folder($tempDir, $slug, $folderId) {
    $candidates = [
        "$tempDir/games/$slug/media/$folderId",
        "$tempDir/$slug/media/$folderId",
        "$tempDir/games/$slug/$folderId",
        "$tempDir/$slug/$folderId",
    ];
    foreach ($candidates as $dir) {
        if (is_dir($dir)) {
            foreach (scandir($dir) as $entry) {
                if ($entry === '.' || $entry === '..') continue;
                $full = $dir . DIRECTORY_SEPARATOR . $entry;
                if (is_file($full)) return $full;
            }
        }
    }
    return null;
}

/** List media files for a mystery game (recursive under games/{slug}/media/**). */
function ti_list_mystery_media($tempDir, $slug) {
    $bases = [
        "$tempDir/games/$slug/media",
        "$tempDir/$slug/media",
    ];
    $files = [];
    foreach ($bases as $base) {
        if (!is_dir($base)) continue;
        $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($iter as $f) {
            if ($f->isFile()) $files[] = $f->getPathname();
        }
    }
    return $files;
}

/**
 * Mystery: locate a media binary by its legacy id + intended file_name.
 *
 * The Spatie MediaLibrary export layout is `games/{slug}/media/{id}/{file}`,
 * but flatter layouts (`games/{slug}/media/{file}`) and accent-stripped
 * filenames also appear in the wild. Try in this order, returning the first
 * hit:
 *   1. exact `media/{id}/{file_name}`
 *   2. any file inside `media/{id}/` (Spatie's per-id folder, regardless of name)
 *   3. flat `media/{file_name}`
 *   4. recursive search for any file whose basename matches `file_name` (or its
 *      sanitized form).
 */
function ti_find_mystery_media_file($tempDir, $slug, $legacyId, $fileName) {
    $bases = [
        "$tempDir/games/$slug/media",
        "$tempDir/$slug/media",
    ];
    if ($legacyId !== '') {
        foreach ($bases as $base) {
            $idDir = $base . DIRECTORY_SEPARATOR . $legacyId;
            if ($fileName !== '') {
                $exact = $idDir . DIRECTORY_SEPARATOR . $fileName;
                if (is_file($exact)) return $exact;
            }
            if (is_dir($idDir)) {
                foreach (scandir($idDir) as $entry) {
                    if ($entry === '.' || $entry === '..') continue;
                    $full = $idDir . DIRECTORY_SEPARATOR . $entry;
                    if (is_file($full)) return $full;
                }
            }
        }
    }
    if ($fileName === '') return null;
    foreach ($bases as $base) {
        $flat = $base . DIRECTORY_SEPARATOR . $fileName;
        if (is_file($flat)) return $flat;
    }
    // Recursive fallback: any file with matching basename (raw or sanitized).
    $targets = [strtolower($fileName), strtolower(ti_sanitize_filename($fileName))];
    foreach ($bases as $base) {
        if (!is_dir($base)) continue;
        $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($iter as $f) {
            if (!$f->isFile()) continue;
            $bn = strtolower($f->getFilename());
            if (in_array($bn, $targets, true) || in_array(strtolower(ti_sanitize_filename($f->getFilename())), $targets, true)) {
                return $f->getPathname();
            }
        }
    }
    return null;
}

/** Copy a source file into media/{uniqid}/ with a sanitized name. Returns final filename or null. */
function ti_copy_media($sourcePath, $destDir, $copiedFiles) {
    if (!is_file($sourcePath)) return null;
    if (filesize($sourcePath) === 0) return null;
    if (!is_dir($destDir)) {
        if (!@mkdir($destDir, 0755, true) && !is_dir($destDir)) return null;
    }
    $base = basename($sourcePath);
    $sanitized = ti_sanitize_filename($base);
    if ($sanitized === '' || $sanitized === '.' || $sanitized === '..') {
        $sanitized = '_' . substr(md5($base), 0, 8);
    }
    $finalName = $sanitized;
    $dest = $destDir . DIRECTORY_SEPARATOR . $finalName;
    // Collision-safe: if exists with different content, append _2, _3, ...
    if (file_exists($dest)) {
        if (md5_file($dest) === md5_file($sourcePath)) {
            return $finalName;
        }
        $info = pathinfo($sanitized);
        $stem = $info['filename'];
        $ext = isset($info['extension']) ? '.' . $info['extension'] : '';
        $n = 2;
        while (true) {
            $candidate = $stem . '_' . $n . $ext;
            $candDest = $destDir . DIRECTORY_SEPARATOR . $candidate;
            if (!file_exists($candDest)) {
                $finalName = $candidate;
                $dest = $candDest;
                break;
            }
            if (md5_file($candDest) === md5_file($sourcePath)) {
                return $candidate;
            }
            $n++;
        }
    }
    if (!@copy($sourcePath, $dest)) return null;
    return $finalName;
}

function ti_import_game($pdo, $tempDir, $game, $ownership, $clientId, $createdBy) {
    $slug = $game['slug'];
    $type = $game['type']; // 'mystery' | 'tagquest'

    $gameCsvPath = ti_find_game_file($tempDir, $slug, 'game.csv');
    if (!$gameCsvPath) throw new Exception("game.csv not found for $slug");
    $gameRows = ti_parse_csv_file($gameCsvPath);
    if (empty($gameRows)) throw new Exception("game.csv for $slug has no data");
    $gameRow = $gameRows[0];

    $title = $gameRow['title'] ?? '';
    $uniqid = $gameRow['uniqid'] ?? '';
    if ($uniqid === '') throw new Exception("game.csv for $slug missing uniqid");

    $gameMetaPath = ti_find_game_file($tempDir, $slug, 'game_meta.csv');
    if (!$gameMetaPath) throw new Exception("game_meta.csv not found for $slug");
    $meta = ti_csv_to_kv($gameMetaPath);

    $description = $meta['scenario'] ?? $meta['story'] ?? 'Imported game';

    $enigmas = [];
    $overscores = [];
    $quests = [];
    $checkpoints = [];        // tracks: parsed game_checkpoints rows
    $mediaIds = [];           // tagquest id-folder lookups
    $soundFieldMappings = []; // tagquest meta-key sound mappings
    $userMetaMapped = [];     // mystery: game_user_meta.csv → text_* Localized
    $skippedUserMetaKeys = [];

    if ($type === 'mystery') {
        for ($idx = 1; isset($meta["overscore_step_$idx"]) && $meta["overscore_step_$idx"] !== ''; $idx++) {
            $overscores[] = [
                'overscore_step' => (string)$idx,
                'overscore_score' => $meta["overscore_step_$idx"],
                'name_overscore_step' => $meta["name_overscore_step_$idx"] ?? '',
                'image_overscore_step' => $meta["image_overscore_step_$idx"] ?? '',
            ];
        }
        $enigmasPath = ti_find_game_file($tempDir, $slug, 'game_enigmas.csv');
        if ($enigmasPath) {
            foreach (ti_parse_csv_file($enigmasPath) as $r) {
                $enigmas[] = [
                    'number' => $r['number'] ?? ($r['enigma_number'] ?? ''),
                    'text' => $r['text'] ?? ($r['enigma_text'] ?? ''),
                    'good_answer_points' => $r['good_answer_points'] ?? '10',
                    'wrong_answer_points' => $r['wrong_answer_points'] ?? '0',
                    'good_answer_image' => $r['good_answer_image'] ?? '',
                ];
            }
        }
        // Mystery sounds live in game_sounds.csv (rows where `image_number` is
        // the legacy slot name + `sound_id` is the legacy media id). Modern
        // gameMeta keys differ slightly (top_1 → top_1_sound, full_image →
        // final_image_sound); rename to the new schema as we ingest.
        $soundsPath = ti_find_game_file($tempDir, $slug, 'game_sounds.csv');
        if ($soundsPath) {
            $mysterySoundMap = [
                'enigma_success' => 'enigma_success',
                'enigma_error' => 'enigma_error',
                'enigma_no_answer' => 'enigma_no_answer',
                'full_image' => 'final_image_sound',
                'top_1' => 'top_1_sound',
                'top_3' => 'top_3_sound',
                'top_10' => 'top_10_sound',
            ];
            foreach (ti_parse_csv_file($soundsPath) as $s) {
                $slot = $s['image_number'] ?? '';
                $soundId = $s['sound_id'] ?? '';
                if ($soundId === '' || $slot === '') continue;
                if (isset($mysterySoundMap[$slot])) {
                    $soundFieldMappings[$mysterySoundMap[$slot]] = $soundId;
                }
            }
        }
        [$userMetaMapped, $skippedUserMetaKeys] = ti_map_mystery_user_meta($tempDir, $slug);
    } elseif ($type === 'tagquest') {
        $imagesPath = ti_find_game_file($tempDir, $slug, 'game_images.csv')
            ?: ti_find_game_file($tempDir, $slug, 'game_media_images.csv');
        if ($imagesPath) {
            foreach (ti_parse_csv_file($imagesPath) as $r) {
                $quests[] = [
                    'main_image' => $r['image_id'] ?? ($r['full_image_id'] ?? ($r['main_image'] ?? '')),
                    'points' => $r['image_points'] ?? ($r['points'] ?? ($r['point'] ?? '0')),
                    'name' => $r['image_name'] ?? ($r['name'] ?? ($r['title'] ?? '')),
                    'sound' => '',
                    'image_1' => '',
                    'image_2' => '',
                    'image_3' => '',
                    'image_4' => '',
                    'quest_index' => $r['image_number'] ?? ($r['number'] ?? ($r['quest_number'] ?? '')),
                ];
            }
        }
        $divPath = ti_find_game_file($tempDir, $slug, 'game_images_divisions.csv');
        if ($divPath) {
            foreach (ti_parse_csv_file($divPath) as $d) {
                $mainNum = $d['main_image_number'] ?? ($d['quest_number'] ?? '');
                $imgId = $d['image_id'] ?? '';
                if ($imgId === '') continue;
                foreach ($quests as &$q) {
                    if ($q['quest_index'] === $mainNum) {
                        if ($q['image_1'] === '') { $q['image_1'] = $imgId; }
                        elseif ($q['image_2'] === '') { $q['image_2'] = $imgId; }
                        elseif ($q['image_3'] === '') { $q['image_3'] = $imgId; }
                        elseif ($q['image_4'] === '') { $q['image_4'] = $imgId; }
                        break;
                    }
                }
                unset($q);
            }
        }
        $soundsPath = ti_find_game_file($tempDir, $slug, 'game_sounds.csv');
        if ($soundsPath) {
            $soundFieldMap = [
                'late_malus' => 'late_malus_sound',
                'malus' => 'malus_sound',
                'error' => 'cheating_sound',
                'success' => 'success_sound',
                'top_1' => 'top_1_sound',
                'top_3' => 'top_3_sound',
                'top_10' => 'top_10_sound',
            ];
            foreach (ti_parse_csv_file($soundsPath) as $s) {
                $imageNumber = $s['image_number'] ?? '';
                $soundId = $s['sound_id'] ?? '';
                if ($soundId === '') continue;
                if (preg_match('/^\d+$/', $imageNumber)) {
                    foreach ($quests as &$q) {
                        if ($q['quest_index'] === $imageNumber) {
                            $q['sound'] = $soundId;
                            break;
                        }
                    }
                    unset($q);
                } elseif (isset($soundFieldMap[$imageNumber])) {
                    $soundFieldMappings[$soundFieldMap[$imageNumber]] = $soundId;
                    $mediaIds[$soundId] = true;
                } else {
                    $mediaIds[$soundId] = true;
                }
            }
        }
        // Tagquest also references some images/sounds via meta keys (collect their ids).
        foreach ([
            'background_image', 'malus_container', 'malus_image', 'late_malus_image',
            'top_1_image', 'top_3_image', 'top_10_image',
            // Sound meta keys - without these, the corresponding files in
            // media/{id}/ folders never get copied and the references
            // are silently dropped from $medias['sounds'].
            'enigma_success', 'enigma_error', 'enigma_no_answer',
            'top_1_sound', 'top_3_sound', 'top_10_sound', 'final_image_sound',
        ] as $f) {
            if (!empty($meta[$f])) $mediaIds[$meta[$f]] = true;
        }
        foreach ($quests as $q) {
            foreach (['main_image', 'image_1', 'image_2', 'image_3', 'image_4', 'sound'] as $k) {
                if (!empty($q[$k])) $mediaIds[$q[$k]] = true;
            }
        }
    } elseif ($type === 'tracks') {
        // Tracks (legacy maximus) - parse game_checkpoints.csv + game_sounds.csv.
        // Media lookup uses Mystery's per-id-folder + flat-fallback path
        // (see ti_find_mystery_media_file usage below).
        $cpPath = ti_find_game_file($tempDir, $slug, 'game_checkpoints.csv');
        if ($cpPath) {
            foreach (ti_parse_csv_file($cpPath) as $r) {
                $posJson = $r['checkpoint_position'] ?? '';
                $pos = ['top' => 50.0, 'left' => 50.0];
                if ($posJson !== '') {
                    $decoded = json_decode($posJson, true);
                    if (is_array($decoded)) {
                        if (isset($decoded['top'])) $pos['top'] = (float)$decoded['top'];
                        if (isset($decoded['left'])) $pos['left'] = (float)$decoded['left'];
                    }
                }
                $checkpoints[] = [
                    'legacy_id' => $r['id'] ?? '',
                    'number' => $r['number'] ?? '',
                    'title' => $r['title'] ?? '',
                    'description' => $r['description'] ?? '',
                    'good_answer_image' => $r['good_answer_image'] ?? '',
                    'position' => $pos,
                    'points' => isset($r['points']) ? (int)$r['points'] : 1,
                ];
            }
        }
        // Tracks sounds: legacy file uses enigma_success/error/no_answer keys
        // (misleading names that we rename here to checkpoint_*). top_X sounds
        // use the shared `top_X_sound` fields. See plan §7 (sound-slot table).
        $soundsPath = ti_find_game_file($tempDir, $slug, 'game_sounds.csv');
        if ($soundsPath) {
            $tracksSoundMap = [
                'enigma_success' => 'checkpoint_success',
                'enigma_error' => 'checkpoint_error',
                'enigma_no_answer' => 'checkpoint_no_answer',
                'top_1' => 'top_1_sound',
                'top_3' => 'top_3_sound',
                'top_10' => 'top_10_sound',
            ];
            foreach (ti_parse_csv_file($soundsPath) as $s) {
                $slot = $s['image_number'] ?? '';
                $soundId = $s['sound_id'] ?? '';
                if ($soundId === '' || $slot === '') continue;
                if (isset($tracksSoundMap[$slot])) {
                    $soundFieldMappings[$tracksSoundMap[$slot]] = $soundId;
                }
            }
        }
    } else {
        throw new Exception("Unsupported game type: $type");
    }

    // Per-game DB transaction
    $pdo->beginTransaction();
    $mediaDirCreated = false;
    $mediaDir = null;
    try {
        $stmt = $pdo->prepare('SELECT id FROM scenarios WHERE uniqid = ? FOR UPDATE');
        $stmt->execute([$uniqid]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($existing) {
            $pdo->rollBack();
            return [
                'status' => 'skipped',
                'slug' => $slug,
                'uniqid' => $uniqid,
                'reason' => 'uniqid_exists',
                'existing_id' => (int)$existing['id'],
            ];
        }

        // Resolve the media base WITHOUT realpath(): realpath() returns false when
        // media/ doesn't exist yet, which would silently turn the target into an
        // absolute path at the filesystem root (/{uniqid}) and fail confusingly.
        $mediaBase = __DIR__ . '/../../media';
        if (!is_dir($mediaBase)) {
            if (!@mkdir($mediaBase, 0775, true) && !is_dir($mediaBase)) {
                throw new Exception("Media base directory is missing and could not be created: $mediaBase (check it exists at the web root and is writable by the web server user)");
            }
        }
        if (!is_writable($mediaBase)) {
            throw new Exception("Media base directory is not writable by the web server user: $mediaBase");
        }

        $mediaDir = $mediaBase . DIRECTORY_SEPARATOR . $uniqid;
        if (!is_dir($mediaDir)) {
            if (!@mkdir($mediaDir, 0755, true) && !is_dir($mediaDir)) {
                throw new Exception("Failed to create media dir for $uniqid at $mediaDir");
            }
            $mediaDirCreated = true;
        }

        // Resolve and copy media files; build $mediaMapping (legacy key → sanitized filename).
        $mediaMapping = [];
        $mediaCount = 0;

        if ($type === 'tagquest') {
            foreach (array_keys($mediaIds) as $mediaId) {
                $src = ti_find_media_in_id_folder($tempDir, $slug, $mediaId);
                if (!$src) continue;
                $finalName = ti_copy_media($src, $mediaDir, []);
                if ($finalName !== null) {
                    $mediaMapping[$mediaId] = $finalName;
                    $mediaCount++;
                }
            }
        } else {
            // Mystery / survival: every media reference in game_meta and
            // game_enigmas is a legacy id (e.g. background_image=3739). We
            // must end up with $mediaMapping[<legacy-id>] = <sanitized name>.
            // The source of truth for id → file_name is game_media_images.csv.
            $mediaCsvPath = ti_find_game_file($tempDir, $slug, 'game_media_images.csv')
                ?: ti_find_game_file($tempDir, $slug, 'game_images.csv');
            if ($mediaCsvPath) {
                foreach (ti_parse_csv_file($mediaCsvPath) as $row) {
                    $legacyId = isset($row['id']) ? trim((string)$row['id']) : '';
                    $fileName = isset($row['file_name']) ? trim((string)$row['file_name']) : '';
                    if ($legacyId === '' && $fileName === '') continue;
                    $src = ti_find_mystery_media_file($tempDir, $slug, $legacyId, $fileName);
                    if (!$src) continue;
                    $finalName = ti_copy_media($src, $mediaDir, []);
                    if ($finalName !== null) {
                        if ($legacyId !== '') $mediaMapping[$legacyId] = $finalName;
                        $mediaCount++;
                    }
                }
            }
            // Fallback: also copy anything else found under media/ that the
            // CSV didn't catalogue, so authors don't lose orphan assets.
            foreach (ti_list_mystery_media($tempDir, $slug) as $src) {
                $bn = basename($src);
                $sanitized = ti_sanitize_filename($bn);
                if (file_exists($mediaDir . DIRECTORY_SEPARATOR . $sanitized)) continue;
                $finalName = ti_copy_media($src, $mediaDir, []);
                if ($finalName !== null) {
                    $mediaCount++;
                }
            }
        }

        // Build the medias JSON (post-mapping) - mirrors ZipImport.tsx 891-981.
        $medias = [
            'images' => (object)[],
            'sounds' => (object)[],
            'videos' => (object)[],
            'enigmas' => [],
            'levels' => (object)[],
            'overscores' => [],
            'quests' => [],
        ];

        foreach ($overscores as $os) {
            if (!empty($os['image_overscore_step']) && isset($mediaMapping[$os['image_overscore_step']])) {
                $medias['overscores'][] = [
                    'overscore_step' => $os['overscore_step'],
                    'image_overscore_step' => $mediaMapping[$os['image_overscore_step']],
                ];
            }
        }
        foreach ($enigmas as $e) {
            if (!empty($e['good_answer_image']) && isset($mediaMapping[$e['good_answer_image']])) {
                $medias['enigmas'][] = [
                    'enigma_number' => $e['number'],
                    'good_answer_image' => $mediaMapping[$e['good_answer_image']],
                ];
            }
        }
        foreach ($quests as $q) {
            $entry = ['quest_index' => $q['quest_index']];
            foreach (['main_image', 'sound', 'image_1', 'image_2', 'image_3', 'image_4'] as $k) {
                if (!empty($q[$k]) && isset($mediaMapping[$q[$k]])) {
                    $entry[$k] = $mediaMapping[$q[$k]];
                }
            }
            if (count($entry) > 1) $medias['quests'][] = $entry;
        }
        // Tracks: per-checkpoint reveal/marker images. Indexed by checkpoint
        // number, with checkpoint_id (new uuid) generated below in the data
        // build; the medias entry uses the legacy id for now and is re-linked
        // there.
        if ($type === 'tracks') {
            $medias['checkpoints'] = [];
            foreach ($checkpoints as $idx => $c) {
                if (!empty($c['good_answer_image']) && isset($mediaMapping[$c['good_answer_image']])) {
                    $medias['checkpoints'][] = [
                        'checkpoint_number' => $c['number'] !== '' ? $c['number'] : (string)($idx + 1),
                        'legacy_id' => $c['legacy_id'],
                        'image' => $mediaMapping[$c['good_answer_image']],
                    ];
                }
            }
        }

        $imageFields = [
            'game_visual', 'background_image', 'game_instructions_image',
            'game_instructions_button_image', 'game_instructions_button_hover_image',
            'game_refresh_button_image', 'game_refresh_button_hover_image',
            'steps_container_image', 'enigmas_header_image',
            'time_background_image', 'score_background_image',
            'top_1_image', 'top_3_image', 'top_10_image',
            'team_name_background_image', 'timer_background_image',
            'levels_gauge_image',
            'levels_gauge_image_with_content', 'levels_gauge_player_icon_image',
            'levels_gauge_level_icon_image', 'malus_container', 'malus_image', 'late_malus_image',
            // Tracks-only: map background (legacy main_enigma_image), the
            // common-checkpoint icon when checkpoints_unique_image=1, and the
            // two feedback cue images (legacy names; `absent_image` is renamed
            // to `missing_checkpoint_image` further below).
            'main_enigma_image', 'checkpoints_unique_image_id',
            'wrong_order_image', 'absent_image',
        ];
        $imagesOut = [];
        foreach ($imageFields as $f) {
            if (!empty($meta[$f]) && isset($mediaMapping[$meta[$f]])) {
                $imagesOut[$f] = $mediaMapping[$meta[$f]];
            }
        }
        if ($imagesOut) $medias['images'] = $imagesOut;

        $soundFields = [
            'enigma_success', 'enigma_error', 'enigma_no_answer',
            'top_1_sound', 'top_3_sound', 'top_10_sound', 'final_image_sound',
        ];
        $soundsOut = [];
        foreach ($soundFields as $f) {
            if (!empty($meta[$f]) && isset($mediaMapping[$meta[$f]])) {
                $soundsOut[$f] = $mediaMapping[$meta[$f]];
            }
        }

        // Tagquest game_sounds.csv special rows (late_malus / malus / error /
        // success / top_1 / top_3 / top_10) carry legacy ids - remap to
        // sanitized filenames now that $mediaMapping is built. Also surface
        // them in $medias['sounds'] so the runtime can locate the file.
        $soundFieldMappingsMapped = [];
        foreach ($soundFieldMappings as $metaKey => $legacyId) {
            if (isset($mediaMapping[$legacyId])) {
                $soundFieldMappingsMapped[$metaKey] = $mediaMapping[$legacyId];
            }
        }
        foreach ($soundFieldMappingsMapped as $metaKey => $finalName) {
            if (!isset($soundsOut[$metaKey])) {
                $soundsOut[$metaKey] = $finalName;
            }
        }

        if ($soundsOut) $medias['sounds'] = $soundsOut;

        // Build the data JSON (game_meta + arrays) - mirrors ZipImport.tsx 635-666.
        $levels = (object)[];
        if (!empty($meta['levels'])) {
            $decoded = json_decode($meta['levels'], true);
            if (is_array($decoded)) $levels = $decoded;
        }

        // Mystery is on the new shape: title/story/enigma.text/level.name+description/
        // overscore.name_overscore_step are `Localized<string>` maps inline in
        // game_meta; data has a default_language + available_languages envelope.
        // Legacy product scenarios are always French (locale hardcoded).
        if ($type === 'mystery') {
            $remap = function ($legacyId) use ($mediaMapping) {
                if (!is_string($legacyId) || $legacyId === '') return '';
                return $mediaMapping[$legacyId] ?? '';
            };
            $enigmasOut = array_map(function ($e) use ($remap) {
                return [
                    'number' => $e['number'] ?? '',
                    'text' => ti_loc_fr($e['text'] ?? ''),
                    'good_answer_points' => $e['good_answer_points'] ?? '10',
                    'wrong_answer_points' => $e['wrong_answer_points'] ?? '0',
                    'good_answer_image' => $remap($e['good_answer_image'] ?? ''),
                ];
            }, $enigmas);
            $overscoresOut = array_map(function ($o) use ($remap) {
                return [
                    'overscore_step' => $o['overscore_step'] ?? '',
                    'overscore_score' => $o['overscore_score'] ?? '',
                    'name_overscore_step' => ti_loc_fr($o['name_overscore_step'] ?? ''),
                    'image_overscore_step' => $remap($o['image_overscore_step'] ?? ''),
                ];
            }, $overscores);
            $levelsOut = [];
            if (is_array($levels)) {
                foreach ($levels as $k => $lvl) {
                    $entry = is_array($lvl) ? $lvl : [];
                    if (isset($entry['name'])) {
                        $entry['name'] = ti_loc_fr(is_string($entry['name']) ? $entry['name'] : '');
                    }
                    if (isset($entry['description'])) {
                        $entry['description'] = ti_loc_fr(is_string($entry['description']) ? $entry['description'] : '');
                    }
                    $levelsOut[(string)$k] = $entry;
                }
            }
            // Modern mystery reads image+gauge fields from gameMeta directly
            // (then extractFileName at serialize time). Map legacy ids to
            // sanitized filenames so the editor + buildMediasColumn see a real
            // filename, not the legacy "3739".
            $mysteryImageMetaFields = [
                'background_image', 'game_visual',
                'game_instructions_image',
                'game_instructions_button_image', 'game_instructions_button_hover_image',
                'game_refresh_button_image', 'game_refresh_button_hover_image',
                'time_background_image', 'score_background_image', 'enigmas_header_image',
                'steps_container_image',
                'top_1_image', 'top_3_image', 'top_10_image',
                'team_name_background_image',
                'levels_gauge_image', 'levels_gauge_image_with_content',
                'levels_gauge_player_icon_image', 'levels_gauge_level_icon_image',
            ];
            $imageFieldsRemapped = [];
            foreach ($mysteryImageMetaFields as $f) {
                if (!empty($meta[$f]) && isset($mediaMapping[$meta[$f]])) {
                    $imageFieldsRemapped[$f] = $mediaMapping[$meta[$f]];
                }
            }
            $gameMeta = array_merge([
                'title' => ti_loc_fr($title),
                'story' => ti_loc_fr($description),
                'scenario_version' => $meta['scenario_version'] ?? ($meta['game_version'] ?? '1.0'),
                'game_public' => $meta['game_public'] ?? 'kids',
                'font' => $meta['font'] ?? 'Arial',
                'font_color' => $meta['font_color'] ?? '#000000',
                'level_font_color' => $meta['level_font_color'] ?? '#000000',
                'gauge_filling' => $meta['gauge_filling'] ?? '',
                'default_time' => $meta['default_time'] ?? '60',
                'default_time_malus' => $meta['default_time_malus'] ?? '0',
                'points_units' => $meta['points_units'] ?? 'points',
                'number_of_enigmas' => $meta['number_of_enigmas'] ?? (string)count($enigmas),
                'score_full_game' => $meta['score_full_game'] ?? '100',
                'overscore_steps' => $meta['overscore_steps'] ?? (string)count($overscores),
                'animation_image_duration' => $meta['animation_image_duration'] ?? '1',
                'animation_enigma_duration' => $meta['animation_enigma_duration'] ?? '1',
                'animation_message_duration' => $meta['animation_message_duration'] ?? '2',
                'custom_fonts' => [],
            ], $imageFieldsRemapped, $userMetaMapped, $soundFieldMappingsMapped, [
                'overscores' => $overscoresOut,
                'enigmas' => $enigmasOut,
                'levels' => (object)$levelsOut,
            ]);
            $data = [
                'game_meta' => $gameMeta,
                'default_language' => 'fr',
                'available_languages' => ['fr'],
            ];
        } elseif ($type === 'tracks') {
            // -------------------------------------------------------------
            // Tracks (legacy maximus) - checkpoint-based course gameplay.
            // Plan: C:\Users\faure\.claude\plans\tracks-game-type-design.md
            // -------------------------------------------------------------

            // Helper: legacy media id → sanitized filename (or '' on miss).
            $remap = function ($legacyId) use ($mediaMapping) {
                if (!is_string($legacyId) || $legacyId === '') return '';
                return $mediaMapping[$legacyId] ?? '';
            };

            // Decode the legacy nested-JSON meta keys.
            $legacyTracks = is_string($meta['tracks'] ?? null)
                ? (json_decode($meta['tracks'], true) ?: [])
                : [];
            $legacyDisplayMode = is_string($meta['display_mode'] ?? null)
                ? (json_decode($meta['display_mode'], true) ?: [])
                : [];
            // `modes` is the canonical key; `play_mode` is a legacy duplicate.
            $legacyModesRaw = is_string($meta['modes'] ?? null)
                ? $meta['modes']
                : (is_string($meta['play_mode'] ?? null) ? $meta['play_mode'] : null);
            $legacyModes = is_string($legacyModesRaw)
                ? (json_decode($legacyModesRaw, true) ?: [])
                : [];
            $legacyScore = is_string($meta['score'] ?? null)
                ? (json_decode($meta['score'], true) ?: [])
                : [];
            $legacyDisplayScore = is_string($meta['display_score'] ?? null)
                ? (json_decode($meta['display_score'], true) ?: [])
                : [];
            $legacyDisplayClues = is_string($meta['display_clues'] ?? null)
                ? (json_decode($meta['display_clues'], true) ?: [])
                : [];
            $legacyHideClues = is_string($meta['hide_clues_elements'] ?? null)
                ? (json_decode($meta['hide_clues_elements'], true) ?: [])
                : [];
            $legacyResetTimer = is_string($meta['display_reset_timer'] ?? null)
                ? (json_decode($meta['display_reset_timer'], true) ?: [])
                : [];

            // Map nested legacy route keys to clean new keys.
            $routeKeyMap = [
                'default' => 'default',
                'half_first' => 'first_half',
                'half_last' => 'last_half',
                'half_one_out_of_two' => 'odd',
                'half_one_out_of_two_plus' => 'even',
            ];
            $routesOut = [];
            foreach ($routeKeyMap as $legacyK => $newK) {
                $enabled = !empty($legacyTracks[$legacyK]['enabled']);
                $routesOut[$newK] = ['enabled' => $enabled];
            }

            // Display modes - flatten {full,map,simple}.{name,enabled} →
            // {full,map,simple}.{enabled}. The legacy "simple" sub-toggle
            // (mode_simple_full vs mode_simple) is dropped per Q4a.
            $displaysOut = [];
            foreach (['full', 'map', 'simple'] as $k) {
                $displaysOut[$k] = ['enabled' => !empty($legacyDisplayMode[$k]['enabled'])];
            }

            // Play modes - itinerary / free.
            $playModesOut = [];
            foreach (['itinerary', 'free'] as $k) {
                $playModesOut[$k] = ['enabled' => !empty($legacyModes[$k]['enabled'])];
            }

            // Score types - preserve `default` flag; rename legacy keys.
            $scoreTypesOut = [
                'percentage' => [
                    'enabled' => !empty($legacyScore['score_type_percentage']['enabled']),
                    'default' => !empty($legacyScore['score_type_percentage']['default']),
                ],
                'points' => [
                    'enabled' => !empty($legacyScore['score_type_points']['enabled']),
                    'default' => !empty($legacyScore['score_type_points']['default']),
                ],
            ];

            // Clues page - flatten one-key wrapper + invert hide_* → show_*.
            $cluesEnabled = !empty($legacyDisplayClues['display_clues']['enabled']);
            $cluesOut = [
                'enabled' => $cluesEnabled,
                'show_title' => empty($legacyHideClues['hide_clues_title']['enabled']),
                'show_text' => empty($legacyHideClues['hide_clues_text']['enabled']),
                'show_image' => empty($legacyHideClues['hide_clues_image']['enabled']),
            ];

            // display_score - flatten one-key wrapper.
            $displayScore = !empty($legacyDisplayScore['display_score']['enabled']);

            // auto_reset - flatten one-key wrapper (was display_reset_timer).
            $autoReset = !empty($legacyResetTimer['display_reset_timer']['enabled']);

            // Checkpoints - generate new uuids + Localized<fr> wraps.
            $checkpointsOut = [];
            $checkpointIdsByLegacy = [];
            $checkpointIdByNumber = [];
            foreach ($checkpoints as $idx => $c) {
                $newId = bin2hex(random_bytes(8));
                $checkpointIdsByLegacy[$c['legacy_id']] = $newId;
                $cpNumber = $c['number'] !== '' ? $c['number'] : (string)($idx + 1);
                $checkpointIdByNumber[$cpNumber] = $newId;
                $checkpointsOut[] = [
                    'id' => $newId,
                    'title' => ti_loc_fr($c['title']),
                    'description' => ti_loc_fr($c['description']),
                    'image' => $remap($c['good_answer_image']),
                    'position' => $c['position'],
                    'points' => $c['points'],
                ];
            }

            // Re-link medias.checkpoints[].legacy_id → checkpoint_id (new uuid).
            // The legacy_id was a temporary placeholder so we could attach the
            // image map; the editor reads checkpoint_id.
            if (isset($medias['checkpoints']) && is_array($medias['checkpoints'])) {
                $medias['checkpoints'] = array_values(array_map(function ($m) use ($checkpointIdsByLegacy, $checkpointIdByNumber) {
                    $cpId = $checkpointIdsByLegacy[$m['legacy_id'] ?? ''] ?? null;
                    if (!$cpId && isset($m['checkpoint_number'])) {
                        $cpId = $checkpointIdByNumber[$m['checkpoint_number']] ?? null;
                    }
                    return [
                        'checkpoint_id' => $cpId,
                        'checkpoint_number' => $m['checkpoint_number'] ?? '',
                        'image' => $m['image'] ?? '',
                    ];
                }, $medias['checkpoints']));
            }

            // Rename legacy `main_enigma_image` → `map_image` inside
            // medias.images so the new editor reads the field under its new
            // name. Same for the common-checkpoint icon field (no rename, but
            // we keep it explicit for clarity).
            if (isset($medias['images']) && is_array($medias['images']) && !empty($medias['images']['main_enigma_image'])) {
                $medias['images']['map_image'] = $medias['images']['main_enigma_image'];
                unset($medias['images']['main_enigma_image']);
            }
            // Rename legacy `absent_image` → `missing_checkpoint_image` inside
            // medias.images (wrong_order_image keeps its name).
            if (isset($medias['images']) && is_array($medias['images']) && !empty($medias['images']['absent_image'])) {
                $medias['images']['missing_checkpoint_image'] = $medias['images']['absent_image'];
                unset($medias['images']['absent_image']);
            }

            // Tracks-specific top-level image fields, remapped to filenames.
            $tracksImageMetaFields = [
                'background_image', 'game_visual',
                'team_name_background_image', 'timer_background_image',
                'score_background_image', 'time_background_image',
                'top_1_image', 'top_3_image', 'top_10_image',
                'checkpoints_unique_image_id',
                // Feedback cue image kept under its legacy name.
                'wrong_order_image',
            ];
            $imageFieldsRemapped = [];
            foreach ($tracksImageMetaFields as $f) {
                if (!empty($meta[$f]) && isset($mediaMapping[$meta[$f]])) {
                    $imageFieldsRemapped[$f] = $mediaMapping[$meta[$f]];
                }
            }
            // map_image is the rename target of legacy main_enigma_image.
            if (!empty($meta['main_enigma_image']) && isset($mediaMapping[$meta['main_enigma_image']])) {
                $imageFieldsRemapped['map_image'] = $mediaMapping[$meta['main_enigma_image']];
            }
            // missing_checkpoint_image is the rename target of legacy absent_image.
            if (!empty($meta['absent_image']) && isset($mediaMapping[$meta['absent_image']])) {
                $imageFieldsRemapped['missing_checkpoint_image'] = $mediaMapping[$meta['absent_image']];
            }

            $gameMeta = array_merge([
                'title' => ti_loc_fr($title),
                'description' => [],
                'story' => ti_loc_fr($description),
                'scenario_version' => $meta['scenario_version'] ?? ($meta['game_version'] ?? '1.0'),
                'game_public' => $meta['game_public'] ?? 'adults',
                'font' => $meta['font'] ?? 'Arial',
                'font_color' => $meta['font_color'] ?? '#000000',
                'default_time' => $meta['default_time'] ?? '60',
                'default_time_malus' => $meta['default_time_malus'] ?? '1',

                // Tracks-specific scalars
                'display_score' => $displayScore,
                'auto_reset' => $autoReset,
                'delay_auto_reset' => '5',
                'checkpoints_unique_image' => !empty($meta['checkpoints_unique_image']) && (int)$meta['checkpoints_unique_image'] === 1,
                'checkpoint_image_width_percentage' => $meta['checkpoint_image_width_percentage'] ?? '3',

                // Renamed: game_default_pattern → scenario_default_pattern
                'scenario_default_pattern' => $meta['game_default_pattern'] ?? null,

                // Nested toggle objects
                'routes' => $routesOut,
                'displays' => $displaysOut,
                'play_modes' => $playModesOut,
                'score_types' => $scoreTypesOut,
                'clues_page' => $cluesOut,

                // Checkpoints + custom fonts
                'checkpoints' => $checkpointsOut,
                'custom_fonts' => [],
            ], $imageFieldsRemapped, $soundFieldMappingsMapped);

            $data = [
                'game_meta' => $gameMeta,
                'default_language' => 'fr',
                'available_languages' => ['fr'],
            ];
        } else {
            $gameMeta = array_merge([
                'title' => $title,
                'scenario' => $description,
                'scenario_version' => $meta['scenario_version'] ?? ($meta['game_version'] ?? '1.0'),
                'game_public' => $meta['game_public'] ?? 'kids',
                'font' => $meta['font'] ?? 'Arial',
                'font_color' => $meta['font_color'] ?? '#000000',
                'level_font_color' => $meta['level_font_color'] ?? '#000000',
                'gauge_filling' => $meta['gauge_filling'] ?? '',
                'default_time' => $meta['default_time'] ?? '60',
                'default_time_malus' => $meta['default_time_malus'] ?? '0',
                'points_units' => $meta['points_units'] ?? 'points',
                'number_of_enigmas' => $meta['number_of_enigmas'] ?? (string)count($enigmas),
                'score_full_game' => $meta['score_full_game'] ?? '100',
                'overscore_steps' => $meta['overscore_steps'] ?? (string)count($overscores),
                'animation_image_duration' => $meta['animation_image_duration'] ?? '1',
                'animation_enigma_duration' => $meta['animation_enigma_duration'] ?? '1',
                'animation_message_duration' => $meta['animation_message_duration'] ?? '2',
                'combo_2_quests' => $meta['bonus_images_2'] ?? '',
                'combo_4_quests' => $meta['bonus_images_4'] ?? '',
                'combo_6_quests' => $meta['bonus_images_6'] ?? '',
                'malus_points' => $meta['malus_value'] ?? '',
                'late_malus_points' => $meta['malus_late_value'] ?? '',
                'custom_fonts' => [],
            ], $soundFieldMappingsMapped, [
                'overscores' => $overscores,
                'enigmas' => $enigmas,
                'quests' => $quests,
                'levels' => $levels,
            ]);
            $data = ['game_meta' => $gameMeta];
        }

        $scenarioType = $ownership === 'product' ? 'product' : 'custom';
        $rowClientId = $ownership === 'product' ? null : (int)$clientId;

        $sql = 'INSERT INTO scenarios (client_id, title, description, data, medias, game_type, scenario_type, scenario_layout, status, uniqid, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $ins = $pdo->prepare($sql);
        $ins->execute([
            $rowClientId,
            $title,
            $description,
            json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            json_encode($medias, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $type,
            $scenarioType,
            '[]',
            'draft',
            $uniqid,
            $createdBy,
        ]);
        $newId = (int)$pdo->lastInsertId();

        $pdo->commit();

        // Media files were copied into media/{uniqid}/ above - hash the new
        // scenario so incremental sync picks it up. Post-commit (best effort).
        try {
            ScenarioHashes::recompute($pdo, $uniqid);
        } catch (Exception $e) {
            error_log('scenario_import.php - recompute hashes failed for ' . $uniqid . ': ' . $e->getMessage());
        }

        $ret = [
            'status' => 'created',
            'slug' => $slug,
            'uniqid' => $uniqid,
            'title' => $title,
            'id' => $newId,
            'game_type' => $type,
            'media_count' => $mediaCount,
        ];
        if ($type === 'mystery' && !empty($skippedUserMetaKeys)) {
            $ret['skipped_user_meta_keys'] = array_values(array_unique($skippedUserMetaKeys));
        }
        return $ret;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ($mediaDirCreated && $mediaDir) {
            ti_rrmdir($mediaDir);
        }
        throw $e;
    }
}

// ---------------------------------------------------------------- main

$action = $_GET['action'] ?? '';
if ($action !== 'import') {
    ti_json(['error' => 'Invalid action'], 400);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ti_json(['error' => 'Method not allowed'], 405);
}

ti_require_admin();

$tempDir = null;
try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    if (!isset($_FILES['zip_file']) || $_FILES['zip_file']['error'] !== UPLOAD_ERR_OK) {
        ti_json(['error' => 'Missing or invalid zip_file'], 400);
    }
    $ownership = $_POST['ownership'] ?? '';
    if ($ownership !== 'product' && $ownership !== 'client') {
        ti_json(['error' => "ownership must be 'product' or 'client'"], 400);
    }
    $clientId = null;
    if ($ownership === 'client') {
        $clientId = isset($_POST['client_id']) ? (int)$_POST['client_id'] : 0;
        if ($clientId <= 0) ti_json(['error' => 'client_id required when ownership=client'], 400);
        $stmt = $pdo->prepare('SELECT id FROM clients WHERE id = ?');
        $stmt->execute([$clientId]);
        if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
            ti_json(['error' => "client_id $clientId not found"], 404);
        }
    }

    $upload = $_FILES['zip_file'];
    if ($upload['size'] > 200 * 1024 * 1024) {
        ti_json(['error' => 'ZIP exceeds 200 MB'], 400);
    }
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_file($finfo, $upload['tmp_name']) : '';
    if ($finfo) finfo_close($finfo);
    if (!in_array($mime, ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], true)) {
        // octet-stream is allowed because some browsers send that for .zip
        ti_json(['error' => "Unsupported MIME type: $mime"], 400);
    }

    $tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'th_import_' . bin2hex(random_bytes(8));
    if (!@mkdir($tempDir, 0700, true) && !is_dir($tempDir)) {
        ti_json(['error' => 'Failed to create temp dir'], 500);
    }

    $zip = new ZipArchive();
    if ($zip->open($upload['tmp_name']) !== true) {
        ti_json(['error' => 'ZIP file is corrupt or unreadable'], 400);
    }
    if (!$zip->extractTo($tempDir)) {
        $zip->close();
        ti_json(['error' => 'Failed to extract ZIP'], 500);
    }
    $zip->close();

    // Locate main_export_file.csv
    $mainCsvPath = null;
    foreach (["$tempDir/main_export_file.csv", "$tempDir/main_export_file"] as $c) {
        if (is_file($c)) { $mainCsvPath = $c; break; }
    }
    if (!$mainCsvPath) {
        $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tempDir, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($iter as $f) {
            if (!$f->isFile()) continue;
            $name = strtolower($f->getFilename());
            if ($name === 'main_export_file.csv' || $name === 'main_export_file') {
                $mainCsvPath = $f->getPathname();
                break;
            }
        }
    }
    if (!$mainCsvPath) {
        ti_json(['error' => 'main_export_file.csv not found in ZIP'], 400);
    }

    $mainRows = ti_parse_csv_file($mainCsvPath);
    $games = [];
    foreach ($mainRows as $row) {
        $rowType = $row['type'] ?? '';
        $rowSlug = $row['slug'] ?? '';
        if ($rowType !== 'game' || $rowSlug === '') continue;

        // Peek game.csv to read game-level type
        $gcsv = ti_find_game_file($tempDir, $rowSlug, 'game.csv');
        if (!$gcsv) {
            $games[] = ['slug' => $rowSlug, 'type' => null, 'error' => 'game.csv not found'];
            continue;
        }
        $gRows = ti_parse_csv_file($gcsv);
        $gType = isset($gRows[0]['type']) ? strtolower(trim($gRows[0]['type'])) : '';
        // Legacy: "survival" was the original product label for what we now
        // call "mystery" (same data shape, same enigmas table). Normalize so
        // the downstream import pipeline treats both as mystery.
        if ($gType === 'survival') $gType = 'mystery';
        // Legacy: "maximus" was the original product label for what we now
        // call "tracks" (checkpoint-based course gameplay).
        if ($gType === 'maximus') $gType = 'tracks';
        $games[] = ['slug' => $rowSlug, 'type' => $gType, 'error' => null];
    }

    if (count($games) === 0) {
        ti_json(['error' => 'No game rows found in main_export_file.csv'], 400);
    }

    $createdBy = (int)($_SESSION['user_id'] ?? 0);
    $created = [];
    $skipped = [];
    $failed = [];

    foreach ($games as $g) {
        $slug = $g['slug'];
        if ($g['error']) {
            $failed[] = ['slug' => $slug, 'error' => $g['error']];
            continue;
        }
        if ($g['type'] !== 'mystery' && $g['type'] !== 'tagquest' && $g['type'] !== 'tracks') {
            $skipped[] = ['slug' => $slug, 'uniqid' => '', 'reason' => 'unsupported_game_type'];
            continue;
        }
        try {
            $result = ti_import_game($pdo, $tempDir, ['slug' => $slug, 'type' => $g['type']], $ownership, $clientId, $createdBy);
            if ($result['status'] === 'created') {
                unset($result['status']);
                $created[] = $result;
            } else {
                unset($result['status']);
                $skipped[] = $result;
            }
        } catch (Throwable $e) {
            Logger::log('scenario_import', 'POST', 'import_game', $createdBy, ['slug' => $slug], ['error' => $e->getMessage()], 500);
            $failed[] = ['slug' => $slug, 'error' => $e->getMessage()];
        }
    }

    ti_json([
        'success' => true,
        'summary' => [
            'total' => count($games),
            'created' => count($created),
            'skipped' => count($skipped),
            'failed' => count($failed),
        ],
        'created' => $created,
        'skipped' => $skipped,
        'failed' => $failed,
    ]);
} catch (Throwable $e) {
    Logger::log('scenario_import', 'POST', 'import', $_SESSION['user_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    ti_json(['error' => $e->getMessage()], 500);
} finally {
    if ($tempDir && is_dir($tempDir)) {
        ti_rrmdir($tempDir);
    }
}
