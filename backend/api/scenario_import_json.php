<?php

/**
 * Admin-only JSON scenario importer (NOT the legacy Taghunter ZIP - that is
 * scenario_import.php). Imports one scenario authored outside Studio, e.g.
 * written by Claude Desktop from the "Clash scenario import format" spec.
 * Only game_type "clash" is supported for now.
 *
 * Endpoint: POST /backend/api/scenario_import_json.php?action=import
 * Multipart fields:
 *   - file       (required) scenario.json, OR a .zip holding scenario.json + media files
 *   - ownership  (required) 'product' | 'client'
 *   - client_id  (required if ownership='client')
 *
 * scenario.json (format_version 1):
 *   { format: "taghunter-scenario", format_version: 1, game_type: "clash",
 *     default_language: "fr", available_languages: ["fr", ...], game_meta: {...} }
 * `game_meta` mirrors data.game_meta as the editor stores it (see
 * src/types/scenario-data.ts ClashGameMetaSchema), with two conveniences:
 * every Localized field also accepts a plain string (= default language), and
 * media fields hold the bare filename of a file shipped in the ZIP.
 *
 * Structural problems (clan/territory counts, duplicate balises, missing
 * title…) reject the import. Everything else - missing media, unknown keys,
 * bad colours, unknown stations - is repaired/dropped and reported as a warning.
 * The scenario is always created as a draft with a fresh uniqid.
 */

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ScenarioHashes.php';

set_time_limit(0);

const SJ_LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'ja', 'zh', 'ar'];
const SJ_BANDS = ['age_4_5' => 'mini_kids', 'age_6_7' => 'mini_kids', 'age_8_10' => 'kids',
                  'age_11_12' => 'kids', 'age_13_plus' => 'ado_adultes', 'age_adultes' => 'ado_adultes'];
const SJ_CLAN_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad'];
const SJ_EXT = [
    'image' => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
    'sound' => ['mp3', 'wav', 'ogg', 'm4a'],
    'font' => ['ttf', 'otf', 'woff', 'woff2'],
];
/** Flat media fields - partitioned into the medias column (mirrors clash/mediaSlots.ts). */
const SJ_CLASH_FLAT_IMAGES = ['game_visual', 'game_visual_intl', 'map_image', 'frame_ranking', 'frame_territory_name',
                              'frame_gauge', 'frame_event', 'frame_timer', 'frame_separator', 'purge_image'];
const SJ_CLASH_FLAT_SOUNDS = ['purge_sound'];
const SJ_CLASH_LOCALIZED = ['title', 'description', 'story', 'event_text_conquest', 'event_text_attack',
                            'event_text_neutralized', 'event_text_purge', 'purge_text_already_used',
                            'purge_text_own_territory', 'purge_text_no_target', 'ranking_title'];
const SJ_CLASH_COLORS = ['timer_color', 'ranking_color', 'territory_name_color', 'event_color', 'font_color', 'level_font_color'];
const SJ_CLASH_NUMBERS = ['banner_size_percentage', 'purge_size_percentage', 'gauge_size_percentage',
                          'territory_name_scale', 'timer_scale'];
const SJ_CLASH_STRING_NUMBERS = ['default_time', 'delay_auto_reset', 'message_display_time', 'animation_display_time'];

class SjImportError extends Exception {}

function sj_json($data, $status = 200) {
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode($data);
    exit;
}

function sj_require_admin() {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
        if ($tokenData) {
            $_SESSION['user_id'] = $tokenData['user_id'];
            $_SESSION['user_type'] = $tokenData['user_type'];
        }
    }
    if (!isset($_SESSION['user_id']) || ($_SESSION['user_type'] ?? '') !== 'admin') {
        sj_json(['error' => 'Forbidden - admin only'], 403);
    }
}

function sj_rrmdir($dir) {
    if (!is_dir($dir)) return;
    foreach (array_diff(scandir($dir), ['.', '..']) as $entry) {
        $full = $dir . DIRECTORY_SEPARATOR . $entry;
        is_dir($full) ? sj_rrmdir($full) : @unlink($full);
    }
    @rmdir($dir);
}

function sj_sanitize_filename($name) {
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

/** Same shape as ScenarioCreator.tsx: 9 base-36 random chars + base-36 ms timestamp. */
function sj_new_uniqid(PDO $pdo) {
    for ($i = 0; $i < 5; $i++) {
        $rand = '';
        $alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
        for ($j = 0; $j < 9; $j++) $rand .= $alphabet[random_int(0, 35)];
        $uniqid = $rand . base_convert((string)(int)floor(microtime(true) * 1000), 10, 36);
        $stmt = $pdo->prepare('SELECT 1 FROM scenarios WHERE uniqid = ?');
        $stmt->execute([$uniqid]);
        if (!$stmt->fetchColumn()) return $uniqid;
    }
    throw new RuntimeException('Could not generate a unique uniqid');
}

/** Localized<string>: a plain string becomes {defaultLang: s}; unknown langs / non-strings dropped. */
function sj_loc($v, $dl, $path, array &$warnings) {
    if ($v === null) return [];
    if (is_string($v)) return trim($v) === '' ? [] : [$dl => $v];
    if (!is_array($v)) {
        $warnings[] = "$path: expected text or {lang: text}, ignored";
        return [];
    }
    $out = [];
    foreach ($v as $lang => $text) {
        if (!in_array($lang, SJ_LANGS, true)) {
            $warnings[] = "$path: unknown language \"$lang\" ignored";
            continue;
        }
        if (is_string($text) && $text !== '') $out[$lang] = $text;
    }
    return $out;
}

function sj_color($v, $fallback, $path, array &$warnings) {
    if ($v === null || $v === '') return $fallback;
    if (is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v)) return strtolower($v);
    if (is_string($v) && preg_match('/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/', $v, $m)) {
        return strtolower("#{$m[1]}{$m[1]}{$m[2]}{$m[2]}{$m[3]}{$m[3]}");
    }
    $warnings[] = "$path: \"" . (is_scalar($v) ? $v : gettype($v)) . "\" is not a #rrggbb colour, using $fallback";
    return $fallback;
}

function sj_num($v, $fallback, $path, array &$warnings) {
    if ($v === null || $v === '') return $fallback;
    if (is_numeric($v)) return $v + 0;
    $warnings[] = "$path: not a number, using $fallback";
    return $fallback;
}

/** Percent anchor {top, left} clamped to 0-100, or null when absent/invalid. */
function sj_anchor($v, $path, array &$warnings, array $boxKeys = []) {
    if ($v === null) return null;
    if (!is_array($v) || !isset($v['top'], $v['left']) || !is_numeric($v['top']) || !is_numeric($v['left'])) {
        $warnings[] = "$path: expected {top, left} in % - ignored, the editor default is used";
        return null;
    }
    $out = ['top' => max(0, min(100, $v['top'] + 0)), 'left' => max(0, min(100, $v['left'] + 0))];
    foreach ($boxKeys as $k) {
        if (isset($v[$k]) && is_numeric($v[$k])) $out[$k] = max(0, min(100, $v[$k] + 0));
    }
    return $out;
}

/**
 * Resolve a media filename against the extracted ZIP and copy it into
 * media/<uniqid>/. Returns the stored filename, or '' (with a warning) when
 * the file is not shipped / has the wrong extension.
 */
function sj_media($value, $kind, $path, $ctx, array &$warnings) {
    if ($value === null || $value === '') return '';
    if (!is_string($value)) {
        $warnings[] = "$path: expected a filename";
        return '';
    }
    $base = basename(str_replace('\\', '/', $value));
    $ext = strtolower(pathinfo($base, PATHINFO_EXTENSION));
    if (!in_array($ext, SJ_EXT[$kind], true)) {
        $warnings[] = "$path: \"$base\" is not an accepted $kind file (" . implode(', ', SJ_EXT[$kind]) . ')';
        return '';
    }
    if (isset($ctx->copied[$base])) return $ctx->copied[$base];
    $src = $ctx->files[strtolower($base)] ?? null;
    if (!$src) {
        $warnings[] = "$path: file \"$base\" not found in the upload - upload it in the editor";
        return '';
    }
    if (!is_dir($ctx->mediaDir)) {
        if (!@mkdir($ctx->mediaDir, 0755, true) && !is_dir($ctx->mediaDir)) {
            throw new RuntimeException('Failed to create media directory');
        }
        $ctx->mediaDirCreated = true;
    }
    $name = sj_sanitize_filename($base);
    $stem = pathinfo($name, PATHINFO_FILENAME);
    $n = 2;
    while (file_exists($ctx->mediaDir . DIRECTORY_SEPARATOR . $name)) {
        $name = $stem . '_' . $n++ . '.' . $ext;
    }
    if (!@copy($src, $ctx->mediaDir . DIRECTORY_SEPARATOR . $name)) {
        throw new RuntimeException("Failed to copy media file $base");
    }
    $ctx->copied[$base] = $name;
    return $name;
}

/** Map every regular file in the extracted ZIP by lower-cased basename (media/ folder wins). */
function sj_index_files($dir) {
    $files = [];
    if (!$dir || !is_dir($dir)) return $files;
    $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS));
    foreach ($iter as $f) {
        if (!$f->isFile()) continue;
        $key = strtolower($f->getFilename());
        $inMedia = (bool)preg_match('#[/\\\\]media[/\\\\]#i', substr($f->getPathname(), strlen($dir)));
        if (!isset($files[$key]) || $inMedia) $files[$key] = $f->getPathname();
    }
    return $files;
}

/**
 * Validate + normalise a Clash game_meta. Returns [gameMeta, medias].
 * Throws SjImportError listing every structural problem at once.
 */
function sj_build_clash(array $in, $dl, $ctx, PDO $pdo, array &$warnings) {
    $errors = [];
    $known = array_merge(SJ_CLASH_FLAT_IMAGES, SJ_CLASH_FLAT_SOUNDS, SJ_CLASH_LOCALIZED, SJ_CLASH_COLORS,
        SJ_CLASH_NUMBERS, SJ_CLASH_STRING_NUMBERS, [
        'clans', 'territories', 'purge_station', 'timer_position', 'timer_text_offset', 'ranking_position',
        'text_elements', 'text_categories', 'font', 'custom_fonts', 'audience_bands', 'univers', 'difficulty',
        'auto_reset', 'game_public', 'scenario_version',
    ]);
    foreach (array_keys($in) as $k) {
        if (!in_array($k, $known, true)) $warnings[] = "game_meta.$k: unknown field, ignored";
    }

    // Seeds = defaultClashGameMeta() (src/scenarios/bodies/clash/defaults.ts) minus clans/territories.
    $gm = [
        'title' => [], 'description' => [], 'story' => [],
        'purge_station' => 25,
        'banner_size_percentage' => 5, 'purge_size_percentage' => 4, 'gauge_size_percentage' => 5,
        'territory_name_scale' => 100, 'timer_scale' => 100,
        'timer_color' => '#ffffff', 'ranking_color' => '#ffffff', 'territory_name_color' => '#ffffff', 'event_color' => '#ffffff',
        'text_elements' => [], 'text_categories' => [],
        'game_public' => 'ado_adultes', 'default_time' => '60', 'scenario_version' => '1.0',
        'font' => 'Arial', 'font_color' => '#000000', 'level_font_color' => '#000000',
        'auto_reset' => false, 'delay_auto_reset' => '0', 'custom_fonts' => [],
        'event_text_conquest' => [], 'event_text_attack' => [], 'event_text_neutralized' => [], 'event_text_purge' => [],
        'purge_text_already_used' => [], 'purge_text_own_territory' => [], 'purge_text_no_target' => [],
        'ranking_title' => [],
        'message_display_time' => '2', 'animation_display_time' => '1',
    ];

    foreach (SJ_CLASH_LOCALIZED as $k) {
        if (array_key_exists($k, $in)) $gm[$k] = sj_loc($in[$k], $dl, "game_meta.$k", $warnings);
    }
    if (trim((string)($gm['title'][$dl] ?? '')) === '') {
        $errors[] = "game_meta.title: required in the default language \"$dl\"";
    }
    foreach (SJ_CLASH_COLORS as $k) {
        if (array_key_exists($k, $in)) $gm[$k] = sj_color($in[$k], $gm[$k], "game_meta.$k", $warnings);
    }
    foreach (SJ_CLASH_NUMBERS as $k) {
        if (array_key_exists($k, $in)) $gm[$k] = sj_num($in[$k], $gm[$k], "game_meta.$k", $warnings);
    }
    foreach (SJ_CLASH_STRING_NUMBERS as $k) {
        if (array_key_exists($k, $in)) $gm[$k] = (string)sj_num($in[$k], $gm[$k], "game_meta.$k", $warnings);
    }
    if (isset($in['font']) && is_string($in['font']) && $in['font'] !== '') $gm['font'] = $in['font'];
    if (isset($in['auto_reset'])) $gm['auto_reset'] = (bool)$in['auto_reset'];
    if (isset($in['scenario_version'])) $gm['scenario_version'] = (string)$in['scenario_version'];

    // Audience: bands are the source of truth, game_public is derived (oldest band wins).
    if (isset($in['audience_bands'])) {
        $bands = [];
        foreach ((array)$in['audience_bands'] as $b) {
            if (is_string($b) && isset(SJ_BANDS[$b])) $bands[$b] = true;
            else $warnings[] = 'game_meta.audience_bands: unknown band "' . (is_scalar($b) ? $b : '?') . '" ignored';
        }
        $ordered = array_values(array_filter(array_keys(SJ_BANDS), function ($b) use ($bands) { return isset($bands[$b]); }));
        $gm['audience_bands'] = $ordered;
        if ($ordered) $gm['game_public'] = SJ_BANDS[end($ordered)];
    }
    if (isset($in['univers'])) {
        $gm['univers'] = array_values(array_filter((array)$in['univers'], function ($u) { return is_string($u) && trim($u) !== ''; }));
    }
    if (isset($in['difficulty'])) {
        $d = (int)$in['difficulty'];
        if ($d >= 1 && $d <= 5) $gm['difficulty'] = $d;
        else $warnings[] = 'game_meta.difficulty: must be 1-5, ignored';
    }

    // Clans (2-4).
    $clansIn = $in['clans'] ?? null;
    $clans = [];
    if (!is_array($clansIn) || count($clansIn) < 2 || count($clansIn) > 4) {
        $errors[] = 'game_meta.clans: 2 to 4 clans required';
    } else {
        $seenIds = [];
        foreach (array_values($clansIn) as $i => $c) {
            $p = "game_meta.clans[$i]";
            if (!is_array($c)) { $errors[] = "$p: must be an object"; continue; }
            $id = (is_string($c['id'] ?? null) && $c['id'] !== '' && !isset($seenIds[$c['id']])) ? $c['id'] : 'clan_' . ($i + 1);
            $seenIds[$id] = true;
            $clan = [
                'id' => $id,
                'name' => sj_loc($c['name'] ?? null, $dl, "$p.name", $warnings),
                'color' => sj_color($c['color'] ?? null, SJ_CLAN_COLORS[$i], "$p.color", $warnings),
                'banner' => sj_media($c['banner'] ?? null, 'image', "$p.banner", $ctx, $warnings),
                'logo' => sj_media($c['logo'] ?? null, 'image', "$p.logo", $ctx, $warnings),
                'score_card' => sj_media($c['score_card'] ?? null, 'image', "$p.score_card", $ctx, $warnings),
            ];
            if (!$clan['name']) $warnings[] = "$p.name: missing";
            $clans[] = $clan;
        }
    }
    $gm['clans'] = $clans;

    // Purge station.
    if (array_key_exists('purge_station', $in)) {
        $ps = $in['purge_station'];
        if (is_numeric($ps) && (int)$ps > 0) $gm['purge_station'] = (int)$ps;
        else $errors[] = 'game_meta.purge_station: must be a positive station number';
    }

    // Territories (2-12), balises unique across territories and != purge station.
    $terrIn = $in['territories'] ?? null;
    $territories = [];
    if (!is_array($terrIn) || count($terrIn) < 2 || count($terrIn) > 12) {
        $errors[] = 'game_meta.territories: 2 to 12 territories required';
    } else {
        $owner = [];
        $seenIds = [];
        foreach (array_values($terrIn) as $i => $t) {
            $p = "game_meta.territories[$i]";
            if (!is_array($t)) { $errors[] = "$p: must be an object"; continue; }
            $id = (is_string($t['id'] ?? null) && $t['id'] !== '' && !isset($seenIds[$t['id']])) ? $t['id'] : 'territory_' . ($i + 1);
            $seenIds[$id] = true;
            $balises = [];
            foreach ((array)($t['balises'] ?? []) as $b) {
                if (!is_numeric($b) || (int)$b <= 0 || (int)$b != $b) {
                    $errors[] = "$p.balises: \"" . (is_scalar($b) ? $b : '?') . '" is not a positive station number';
                    continue;
                }
                $b = (int)$b;
                if ($b === $gm['purge_station']) {
                    $errors[] = "$p.balises: station $b is the purge station";
                } elseif (isset($owner[$b])) {
                    $errors[] = "$p.balises: station $b is already used by territory " . ($owner[$b] + 1);
                } else {
                    $owner[$b] = $i;
                    $balises[] = $b;
                }
            }
            if (!$balises) $errors[] = "$p.balises: at least one station required";
            $points = $t['points'] ?? '1';
            if (!is_numeric($points) || $points + 0 < 0) {
                $warnings[] = "$p.points: not a number, using 1";
                $points = '1';
            }
            if ($points + 0 == 0) $warnings[] = "$p.points: 0 points per minute";
            $terr = [
                'id' => $id,
                'name' => sj_loc($t['name'] ?? null, $dl, "$p.name", $warnings),
                'points' => (string)($points + 0),
                'balises' => $balises,
            ];
            foreach (['banner_position', 'label_position', 'purge_position'] as $k) {
                $a = sj_anchor($t[$k] ?? null, "$p.$k", $warnings);
                if ($a) $terr[$k] = $a;
            }
            $territories[] = $terr;
        }
        // Stations must exist in the SI station inventory, or the playground cannot map punches.
        if ($owner) {
            $existing = [];
            foreach ($pdo->query('SELECT station_name FROM si_balises')->fetchAll(PDO::FETCH_COLUMN) as $sn) {
                if (is_numeric($sn)) $existing[(int)$sn] = true;
            }
            $missing = array_values(array_filter(array_keys($owner + [$gm['purge_station'] => -1]), function ($b) use ($existing) { return !isset($existing[$b]); }));
            if ($missing && $existing) {
                sort($missing);
                $warnings[] = 'Stations not in the SI station list: ' . implode(', ', $missing);
            }
        }
    }
    $gm['territories'] = $territories;

    // Layout anchors (all optional - the Layout editor seeds defaults).
    $tp = sj_anchor($in['timer_position'] ?? null, 'game_meta.timer_position', $warnings, ['width', 'height']);
    if ($tp) $gm['timer_position'] = $tp;
    if (isset($in['timer_text_offset'])) {
        $o = $in['timer_text_offset'];
        if (is_array($o) && is_numeric($o['x'] ?? null) && is_numeric($o['y'] ?? null)) {
            $gm['timer_text_offset'] = ['x' => $o['x'] + 0, 'y' => $o['y'] + 0];
        } else {
            $warnings[] = 'game_meta.timer_text_offset: expected {x, y}, ignored';
        }
    }
    if (isset($in['ranking_position'])) {
        $r = $in['ranking_position'];
        if (is_array($r) && is_numeric($r['left'] ?? null) && is_numeric($r['top'] ?? null)
            && is_numeric($r['width'] ?? null) && is_numeric($r['height'] ?? null)) {
            $gm['ranking_position'] = ['left' => $r['left'] + 0, 'top' => $r['top'] + 0, 'width' => $r['width'] + 0, 'height' => $r['height'] + 0];
        } else {
            $warnings[] = 'game_meta.ranking_position: expected {left, top, width, height}, ignored';
        }
    }

    // Text overlays on the map.
    $styleKeys = ['font' => 'string', 'font_color' => 'string', 'bold' => 'bool', 'italic' => 'bool', 'underline' => 'bool',
                  'align' => 'align', 'shadow' => 'bool', 'background' => 'bool'];
    $pickStyle = function ($src) use ($styleKeys) {
        $out = [];
        foreach ($styleKeys as $k => $type) {
            if (!array_key_exists($k, $src)) continue;
            $v = $src[$k];
            if ($type === 'bool') $out[$k] = (bool)$v;
            elseif ($type === 'align' && in_array($v, ['left', 'center', 'right'], true)) $out[$k] = $v;
            elseif ($type === 'string' && is_string($v) && $v !== '') $out[$k] = $v;
        }
        return $out;
    };
    $catIds = [];
    foreach ((array)($in['text_categories'] ?? []) as $i => $c) {
        if (!is_array($c) || !is_string($c['id'] ?? null) || !is_string($c['name'] ?? null)) {
            $warnings[] = "game_meta.text_categories[$i]: needs id + name, ignored";
            continue;
        }
        $cat = ['id' => $c['id'], 'name' => $c['name']];
        if (is_array($c['typography'] ?? null)) $cat['typography'] = $pickStyle($c['typography']);
        $catIds[$c['id']] = true;
        $gm['text_categories'][] = $cat;
    }
    foreach ((array)($in['text_elements'] ?? []) as $i => $e) {
        $p = "game_meta.text_elements[$i]";
        if (!is_array($e)) { $warnings[] = "$p: must be an object, ignored"; continue; }
        $el = ['id' => is_string($e['id'] ?? null) && $e['id'] !== '' ? $e['id'] : 'text_' . bin2hex(random_bytes(4)),
               'text' => sj_loc($e['text'] ?? null, $dl, "$p.text", $warnings)];
        if (isset($e['category'])) {
            if (isset($catIds[$e['category']])) $el['category'] = $e['category'];
            else $warnings[] = "$p.category: unknown category, ignored";
        }
        $el += $pickStyle($e);
        $pos = $e['position'] ?? null;
        if (is_array($pos) && is_numeric($pos['left'] ?? null) && is_numeric($pos['top'] ?? null)
            && is_numeric($pos['width'] ?? null) && is_numeric($pos['height'] ?? null)) {
            $el['position'] = ['left' => $pos['left'] + 0, 'top' => $pos['top'] + 0, 'width' => $pos['width'] + 0, 'height' => $pos['height'] + 0];
        } elseif ($pos !== null) {
            $warnings[] = "$p.position: expected {left, top, width, height}, left unplaced";
        }
        $gm['text_elements'][] = $el;
    }

    // Custom fonts (files shipped in the ZIP).
    foreach ((array)($in['custom_fonts'] ?? []) as $i => $cf) {
        if (!is_array($cf) || !is_string($cf['family'] ?? null) || $cf['family'] === '') {
            $warnings[] = "game_meta.custom_fonts[$i]: needs a family, ignored";
            continue;
        }
        $faces = [];
        foreach ((array)($cf['faces'] ?? []) as $j => $face) {
            $fn = sj_media(is_array($face) ? ($face['filename'] ?? null) : null, 'font', "game_meta.custom_fonts[$i].faces[$j]", $ctx, $warnings);
            if ($fn === '') continue;
            $faces[] = [
                'filename' => $fn,
                'weight' => is_numeric($face['weight'] ?? null) ? (int)$face['weight'] : 400,
                'style' => ($face['style'] ?? '') === 'italic' ? 'italic' : 'normal',
            ];
        }
        if ($faces) $gm['custom_fonts'][] = ['family' => $cf['family'], 'faces' => $faces];
    }

    // Flat media → medias column (not stored in data.game_meta, like the editor's save).
    $medias = ['images' => [], 'sounds' => []];
    foreach (SJ_CLASH_FLAT_IMAGES as $k) {
        $fn = sj_media($in[$k] ?? null, 'image', "game_meta.$k", $ctx, $warnings);
        if ($fn !== '') $medias['images'][$k] = $fn;
    }
    foreach (SJ_CLASH_FLAT_SOUNDS as $k) {
        $fn = sj_media($in[$k] ?? null, 'sound', "game_meta.$k", $ctx, $warnings);
        if ($fn !== '') $medias['sounds'][$k] = $fn;
    }

    // Publish-checklist gaps (validateClashConfig) - reported, not blocking.
    if (empty($medias['images']['game_visual'])) $warnings[] = 'No game_visual (cover) - required before publishing';
    if (empty($medias['images']['map_image'])) $warnings[] = 'No map_image - required before publishing';
    foreach ($clans as $i => $c) {
        if ($c['banner'] === '' || $c['logo'] === '') $warnings[] = "Clan " . ($i + 1) . ': banner and logo required before publishing';
    }
    if (!empty($medias['sounds']['purge_sound']) && empty($medias['images']['purge_image'])) {
        $warnings[] = 'purge_sound without purge_image - the purge stays disabled at launch';
    }

    if ($errors) throw new SjImportError(implode("\n", array_unique($errors)));
    return [$gm, $medias];
}

// ---------------------------------------------------------------- main

$action = $_GET['action'] ?? '';
if ($action !== 'import') sj_json(['error' => 'Invalid action'], 400);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') sj_json(['error' => 'Method not allowed'], 405);

sj_require_admin();

$tempDir = null;
$ctx = null;
// sj_json() exits, which skips `finally` - clean the extraction dir on shutdown instead.
register_shutdown_function(function () use (&$tempDir) {
    if ($tempDir && is_dir($tempDir)) sj_rrmdir($tempDir);
});
try {
    $pdo = Database::getInstance()->getConnection();

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        sj_json(['error' => 'Missing or invalid file'], 400);
    }
    $ownership = $_POST['ownership'] ?? '';
    if ($ownership !== 'product' && $ownership !== 'client') {
        sj_json(['error' => "ownership must be 'product' or 'client'"], 400);
    }
    $clientId = null;
    if ($ownership === 'client') {
        $clientId = isset($_POST['client_id']) ? (int)$_POST['client_id'] : 0;
        if ($clientId <= 0) sj_json(['error' => 'client_id required when ownership=client'], 400);
        $stmt = $pdo->prepare('SELECT id FROM clients WHERE id = ?');
        $stmt->execute([$clientId]);
        if (!$stmt->fetch(PDO::FETCH_ASSOC)) sj_json(['error' => "client_id $clientId not found"], 404);
    }

    $upload = $_FILES['file'];
    if ($upload['size'] > 200 * 1024 * 1024) sj_json(['error' => 'File exceeds 200 MB'], 400);
    $ext = strtolower(pathinfo($upload['name'] ?? '', PATHINFO_EXTENSION));

    $jsonText = null;
    if ($ext === 'zip') {
        $tempDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'th_jsonimport_' . bin2hex(random_bytes(8));
        if (!@mkdir($tempDir, 0700, true) && !is_dir($tempDir)) sj_json(['error' => 'Failed to create temp dir'], 500);
        $zip = new ZipArchive();
        if ($zip->open($upload['tmp_name']) !== true) sj_json(['error' => 'ZIP file is corrupt or unreadable'], 400);
        if (!$zip->extractTo($tempDir)) { $zip->close(); sj_json(['error' => 'Failed to extract ZIP'], 500); }
        $zip->close();
        $jsonFiles = [];
        $iter = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($tempDir, RecursiveDirectoryIterator::SKIP_DOTS));
        foreach ($iter as $f) {
            if ($f->isFile() && strtolower($f->getExtension()) === 'json' && strpos($f->getPathname(), '__MACOSX') === false) {
                $jsonFiles[strtolower($f->getFilename())][] = $f->getPathname();
            }
        }
        $jsonPath = $jsonFiles['scenario.json'][0] ?? null;
        if (!$jsonPath && count($jsonFiles) === 1 && count(reset($jsonFiles)) === 1) $jsonPath = reset($jsonFiles)[0];
        if (!$jsonPath) sj_json(['error' => 'scenario.json not found in the ZIP'], 400);
        $jsonText = file_get_contents($jsonPath);
    } elseif ($ext === 'json') {
        $jsonText = file_get_contents($upload['tmp_name']);
    } else {
        sj_json(['error' => 'Upload a .json or .zip file'], 400);
    }

    $jsonText = preg_replace('/^\xEF\xBB\xBF/', '', (string)$jsonText);
    $doc = json_decode($jsonText, true);
    if (!is_array($doc)) sj_json(['error' => 'Invalid JSON: ' . json_last_error_msg()], 400);

    $warnings = [];
    if (isset($doc['format']) && $doc['format'] !== 'taghunter-scenario') {
        sj_json(['error' => 'Unknown format "' . $doc['format'] . '" (expected "taghunter-scenario")'], 400);
    }
    if (isset($doc['format_version']) && (int)$doc['format_version'] !== 1) {
        sj_json(['error' => 'Unsupported format_version ' . $doc['format_version'] . ' (expected 1)'], 400);
    }
    // Also accept a raw `data` column envelope: {data: {game_meta, default_language, available_languages}}.
    $root = is_array($doc['data'] ?? null) && isset($doc['data']['game_meta']) ? $doc['data'] + $doc : $doc;
    $gameType = strtolower((string)($root['game_type'] ?? ''));
    if ($gameType !== 'clash') {
        sj_json(['error' => 'game_type must be "clash"' . ($gameType !== '' ? " (got \"$gameType\")" : '')], 400);
    }
    if (!is_array($root['game_meta'] ?? null)) sj_json(['error' => 'game_meta object is missing'], 400);

    $dl = strtolower((string)($root['default_language'] ?? 'fr'));
    if (!in_array($dl, SJ_LANGS, true)) {
        sj_json(['error' => "default_language \"$dl\" is not one of " . implode(', ', SJ_LANGS)], 400);
    }
    $langs = [$dl];
    foreach ((array)($root['available_languages'] ?? []) as $l) {
        $l = strtolower((string)$l);
        if (!in_array($l, SJ_LANGS, true)) { $warnings[] = "available_languages: \"$l\" ignored"; continue; }
        if (!in_array($l, $langs, true)) $langs[] = $l;
    }

    $uniqid = sj_new_uniqid($pdo);
    $ctx = (object)[
        'files' => sj_index_files($tempDir),
        'mediaDir' => dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'media' . DIRECTORY_SEPARATOR . $uniqid,
        'mediaDirCreated' => false,
        'copied' => [],
    ];

    try {
        [$gameMeta, $medias] = sj_build_clash($root['game_meta'], $dl, $ctx, $pdo, $warnings);
    } catch (SjImportError $e) {
        if ($ctx->mediaDirCreated) sj_rrmdir($ctx->mediaDir);
        sj_json(['error' => 'The scenario has errors - nothing was imported', 'errors' => explode("\n", $e->getMessage()), 'warnings' => $warnings], 422);
    }

    $data = ['game_meta' => $gameMeta, 'default_language' => $dl, 'available_languages' => $langs];
    $title = $gameMeta['title'][$dl];
    $description = (string)($gameMeta['description'][$dl] ?? '');
    $createdBy = (int)($_SESSION['user_id'] ?? 0);

    $ins = $pdo->prepare('INSERT INTO scenarios (client_id, title, description, data, medias, game_type, scenario_type, scenario_layout, status, uniqid, created_by)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $ins->execute([
        $ownership === 'product' ? null : $clientId,
        $title,
        $description,
        json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        json_encode($medias, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'clash',
        $ownership === 'product' ? 'product' : 'custom',
        '[]',
        'draft',
        $uniqid,
        $createdBy,
    ]);
    $newId = (int)$pdo->lastInsertId();

    try {
        ScenarioHashes::recompute($pdo, $uniqid);
    } catch (Exception $e) {
        error_log('scenario_import_json.php - recompute hashes failed for ' . $uniqid . ': ' . $e->getMessage());
    }

    sj_json([
        'success' => true,
        'scenario' => ['id' => $newId, 'uniqid' => $uniqid, 'title' => $title, 'game_type' => 'clash'],
        'media_count' => count($ctx->copied),
        'warnings' => array_values(array_unique($warnings)),
    ]);
} catch (Throwable $e) {
    if ($ctx && $ctx->mediaDirCreated) sj_rrmdir($ctx->mediaDir);
    Logger::log('scenario_import_json', 'POST', 'import', $_SESSION['user_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    sj_json(['error' => $e->getMessage()], 500);
}
