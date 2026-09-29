<?php

// Tag Hunter GO cloud endpoints. Serves the player PWA (go.taghunter.fr):
//   - load        (GET, public)  gate + scenario bundle, cached offline by the PWA
//   - score       (POST, public) idempotent leaderboard upsert from a team phone
//   - leaderboard (GET, client)  ranked scores for the animateur (Studio space)
//   - tutorial_*  (admin)        the setup-screen tutorial carousel (Studio → GO → Tuto)
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

// These JSON responses are dynamic and must NEVER be cached - above all the
// polled boards (public_board / leaderboard), which sit behind a Google Cloud
// load balancer/CDN. Without this a cached GET is served back every poll and a
// projected leaderboard freezes on stale data (a just-finished team never
// appears). The `media` action sets its own Cache-Control and exits, so this
// only governs the API responses.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ScenarioLanguages.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

// Tutorial-carousel images live in their own media folder (not a scenario's), so
// they can be served by the same go.php?action=media proxy: the proxy's `u`
// segment is sanitized to [A-Za-z0-9_-], which this name survives.
const GO_TUTORIAL_DIR = 'go_tutorial';

// Admin-only guard for the tutorial CRUD actions. Exits with 401 when the caller
// is not an authenticated admin.
function requireAdminAuth($db) {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    $auth = $token ? TokenManager::validateToken($db, $token) : null;
    if (!$auth || ($auth['user_type'] ?? '') !== 'admin') {
        jsonResponse(['error' => 'unauthorized'], 401);
    }
    return $auth;
}

// Client-or-admin guard resolving WHICH client the call acts on: a client always
// acts on itself; an admin must name the client. Used by the duration config
// actions, which both surfaces (client QR page + admin client page) share.
function requireClientScope($db, $clientIdParam) {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    $auth = $token ? TokenManager::validateToken($db, $token) : null;
    if (!$auth) {
        jsonResponse(['error' => 'unauthorized'], 401);
    }
    $clientId = ($auth['user_type'] ?? '') === 'client' ? $auth['user_id'] : $clientIdParam;
    if (!$clientId) {
        jsonResponse(['error' => 'missing_params', 'reason' => 'client_id required'], 400);
    }
    return [$auth, $clientId];
}

// Normalize a list of durations (minutes) from any caller: ints only, 1..600,
// deduped, ascending, capped. The same rule guards the catalog and each
// scenario's offer so nothing downstream has to defend against 0 or "abc".
function normalizeDurations($raw) {
    if (!is_array($raw)) return [];
    $out = [];
    foreach ($raw as $v) {
        $n = (int)$v;
        if ($n >= 1 && $n <= 600) $out[$n] = true;
    }
    $out = array_keys($out);
    sort($out, SORT_NUMERIC);
    return array_slice($out, 0, 12);
}

// The durations a (client, scenario, app) offers, falling back to the scenario's
// authored default_time when the operator hasn't configured anything - so every
// pre-existing QR keeps working with exactly one implicit challenge.
function resolveDurations($grantDurationsJson, $authoredMinutes) {
    $configured = normalizeDurations(
        !empty($grantDurationsJson) ? json_decode($grantDurationsJson, true) : []
    );
    if ($configured) return $configured;
    $authored = (int)$authoredMinutes;
    return $authored > 0 ? [$authored] : [];
}

// This endpoint serves two apps from one codebase (project_taghunter_spot): GO
// and Spot. Normalize the `app` selector; anything but 'spot' is GO (the default
// keeps every existing GO caller unchanged).
function requestApp($raw) {
    return ($raw === 'spot') ? 'spot' : 'go';
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

// ---------------------------------------------------------------------------
// Catalog fonts for the Players-Instructions slides.
//
// +-------------------------------------------------------------------------+
// | DERIVED FROM studio-taghunter/src/fonts/catalog.ts - KEEP IN SYNC.       |
// | Only the BUNDLED families are listed: catalog "system" fonts (Arial,     |
// | Georgia, Impact...) have no files and need nothing shipped - the phone's |
// | OS provides them and the PWA just names the family.                      |
// +-------------------------------------------------------------------------+
//
// A slide's font is global to the carousel, so it cannot ride on a scenario's
// `custom_fonts` the way the scenario's own font does. Instead `load` resolves
// only the families the slides in THIS bundle actually reference and appends
// their faces to `media.fonts`, which the PWA already caches as blobs and
// injects as @font-face. The whole catalog is ~2.5 MB - never ship it all.
function goCatalogFontFaces() {
    return [
        'Glacial Indifference' => [
            ['file' => 'glacial-indifference.otf', 'weight' => 400, 'style' => 'normal'],
            ['file' => 'glacial-indifference-bold.otf', 'weight' => 700, 'style' => 'normal'],
        ],
        'Zombie'          => [['file' => 'zombie.ttf', 'weight' => 400, 'style' => 'normal']],
        'Zombie Blood'    => [['file' => 'zombie-blood.ttf', 'weight' => 400, 'style' => 'normal']],
        'Spider'          => [['file' => 'spider.ttf', 'weight' => 400, 'style' => 'normal']],
        'Mortified Drip'  => [['file' => 'mortified-drip.ttf', 'weight' => 400, 'style' => 'normal']],
        'October Crow'    => [['file' => 'october-crow.ttf', 'weight' => 400, 'style' => 'normal']],
        'Ancient Medium'  => [['file' => 'ancient-medium.ttf', 'weight' => 400, 'style' => 'normal']],
        'Trajan Pro'      => [
            ['file' => 'trajan-pro.ttf', 'weight' => 400, 'style' => 'normal'],
            ['file' => 'trajan-pro-bold.otf', 'weight' => 700, 'style' => 'normal'],
        ],
        'Stranger Things' => [['file' => 'stranger-things.ttf', 'weight' => 400, 'style' => 'normal']],
        'Stranger'        => [['file' => 'stranger.ttf', 'weight' => 400, 'style' => 'normal']],
        'Monsters'        => [['file' => 'monsters.ttf', 'weight' => 400, 'style' => 'normal']],
        'Monster'         => [['file' => 'monster.ttf', 'weight' => 400, 'style' => 'normal']],
        'Caribbean'       => [['file' => 'caribbean.ttf', 'weight' => 400, 'style' => 'normal']],
        'Another Danger'  => [
            ['file' => 'another-danger.otf', 'weight' => 400, 'style' => 'normal'],
            ['file' => 'another-danger-slanted.otf', 'weight' => 400, 'style' => 'italic'],
        ],
    ];
}

// The catalog families that need NO file: the phone's OS provides them, so a
// slide naming one ships nothing. Listed only so normalizeSlideStyle() can tell
// a valid choice from a typo.
//
// +-------------------------------------------------------------------------+
// | DERIVED FROM studio-taghunter/src/fonts/catalog.ts - KEEP IN SYNC.       |
// +-------------------------------------------------------------------------+
function goCatalogSystemFamilies() {
    return [
        'Arial', 'Arial Black', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact',
        'Georgia', 'Times New Roman', 'Courier New', 'Comic Sans MS',
        'Palatino Linotype', 'Lucida Sans',
    ];
}

// Where the catalog font files actually sit. `public/fonts/` is Vite's source
// dir; a built deployment serves the same files from the site root or from
// dist/. Probe the candidates rather than hard-coding one layout, so this works
// in laragon dev and in prod without a config flag.
function goCatalogFontPath($file) {
    $name = basename($file);
    foreach (['/../../public/fonts/', '/../../dist/fonts/', '/../../fonts/'] as $rel) {
        $path = realpath(__DIR__ . $rel . $name);
        if ($path && is_file($path)) return $path;
    }
    return null;
}

function catalogFontUrl($file) {
    $self = $_SERVER['SCRIPT_NAME'] ?? '/backend/api/go.php';
    return mediaBaseUrl() . $self . '?action=font&f=' . rawurlencode(basename($file));
}

// The `media.fonts` entries needed by a set of slides: one per face of every
// bundled catalog family they name, deduped. Families that are catalog SYSTEM
// fonts (or unknown) contribute nothing - the PWA names them and the OS obliges.
function slideFontFaces($slideSets) {
    $catalog = goCatalogFontFaces();
    // Case-insensitive lookup, since the family is stored as authored.
    $byLower = [];
    foreach ($catalog as $family => $faces) $byLower[strtolower($family)] = [$family, $faces];

    $wanted = [];
    foreach ($slideSets as $slides) {
        foreach ($slides as $slide) {
            $family = $slide['font_family'] ?? null;
            if (!$family) continue;
            $hit = $byLower[strtolower(trim($family))] ?? null;
            if ($hit) $wanted[$hit[0]] = $hit[1];
        }
    }

    $out = [];
    foreach ($wanted as $family => $faces) {
        foreach ($faces as $face) {
            if (!goCatalogFontPath($face['file'])) continue; // not deployed here
            $out[] = [
                'family' => $family,
                'weight' => $face['weight'],
                'style' => $face['style'],
                'url' => catalogFontUrl($face['file']),
            ];
        }
    }
    return $out;
}

// Lower bound (UTC 'Y-m-d H:i:s') for a named time range, computed on the SERVER
// so it shares the exact clock that stamps go_scores.updated_at. This is why a
// just-finished game reliably lands in "today": both the row's timestamp and
// this boundary come from the same now(), so no browser/server clock or timezone
// mismatch can push a fresh game out of its own day.
//
// `tz` is the viewer's IANA zone (e.g. "Europe/Paris") so "today" / "this week"
// still mean the operator's calendar period; it defaults to the server's own
// zone and falls back to it if the browser sends garbage. `all`, `custom`, and
// anything unrecognized return null (no lower bound).
function namedRangeStartUtc($range, $tz) {
    if (!$range || $range === 'all' || $range === 'custom') return null;
    try {
        $zone = $tz ? new DateTimeZone($tz) : new DateTimeZone(date_default_timezone_get());
    } catch (Exception $e) {
        $zone = new DateTimeZone(date_default_timezone_get());
    }
    $start = new DateTime('now', $zone);
    switch ($range) {
        case 'today':
            $start->setTime(0, 0, 0);
            break;
        case 'week': // Week starts Monday.
            $start->setTime(0, 0, 0);
            $start->modify('-' . ((int)$start->format('N') - 1) . ' days');
            break;
        case 'month':
            $start->setDate((int)$start->format('Y'), (int)$start->format('n'), 1)->setTime(0, 0, 0);
            break;
        case 'year':
            $start->setDate((int)$start->format('Y'), 1, 1)->setTime(0, 0, 0);
            break;
        default:
            return null;
    }
    $start->setTimezone(new DateTimeZone('UTC'));
    return $start->format('Y-m-d H:i:s');
}

// Resolve the from/to filter for a board request from either a named `range`
// (+ optional `tz`), computed server-side, or explicit `from`/`to` bounds
// (custom range, client-supplied UTC). Explicit bounds win when present, so old
// callers that only sent from/to keep working unchanged.
function resolveBoardBounds() {
    $from = trim((string)($_GET['from'] ?? ''));
    $to = trim((string)($_GET['to'] ?? ''));
    if ($from === '' && $to === '') {
        $named = namedRangeStartUtc($_GET['range'] ?? '', $_GET['tz'] ?? '');
        if ($named !== null) $from = $named;
    }
    return [$from, $to];
}

// Per-app capability + billing gate for an unauthenticated caller, mirroring the
// one `load` applies inline. Returns null when the client may be served, or a
// [reason, status] pair to refuse with. Used by `public_board`, which - like
// `load` and `score` - is reached by a phone with no account.
function goClientGateReason($db, $clientId, $app) {
    if ($app === 'spot') {
        $client = $db->fetch(
            'SELECT id, spot_enabled, spot_billing_overdue_since, spot_billing_grace_days
             FROM clients WHERE id = ?',
            [$clientId]
        );
        if (!$client) return ['unknown_client', 403];
        if (empty($client['spot_enabled'])) return ['spot_disabled', 403];
        $overdueSince = $client['spot_billing_overdue_since'] ?? null;
        $graceDays = (int)($client['spot_billing_grace_days'] ?? 30);
    } else {
        $client = $db->fetch(
            'SELECT id, go_enabled, go_billing_overdue_since, go_billing_grace_days
             FROM clients WHERE id = ?',
            [$clientId]
        );
        if (!$client) return ['unknown_client', 403];
        if (empty($client['go_enabled'])) return ['go_disabled', 403];
        $overdueSince = $client['go_billing_overdue_since'] ?? null;
        $graceDays = (int)($client['go_billing_grace_days'] ?? 30);
    }
    if (!empty($overdueSince)) {
        $overdueTs = strtotime($overdueSince);
        if ($overdueTs !== false && time() > $overdueTs + $graceDays * 86400) {
            return ['subscription_inactive', 403];
        }
    }
    return null;
}

// Parse a GO pattern's pattern_data ([{index, assignments:{A:'good'|'wrong'|...}}])
// into enigma-number -> letter->slot. Returns [] when there's no usable pattern.
function patternAssignments($patternDataJson) {
    $out = [];
    if (!$patternDataJson) return $out;
    $rows = json_decode($patternDataJson, true);
    if (!is_array($rows)) return $out;
    foreach ($rows as $row) {
        if (!is_array($row) || !isset($row['index']) || !is_array($row['assignments'] ?? null)) continue;
        $out[(string)$row['index']] = $row['assignments'];
    }
    return $out;
}

// Enigma-number -> correct letter (the one mapped to the 'good' slot).
function correctLettersFromAssignments($assignmentsByNumber) {
    $out = [];
    foreach ($assignmentsByNumber as $number => $assignments) {
        foreach ((array)$assignments as $letter => $slot) {
            if ($slot === 'good') {
                $out[(string)$number] = $letter;
                break;
            }
        }
    }
    return $out;
}

// Splice the per-enigma media back onto game_meta.enigmas[].
//
// The Mystery editor's cleanGameMetaForData() rebuilds every enigma from a fixed
// field list, which DROPS the answer-image fields and parks them in the
// structured `scenarios.medias.enigmas[]` list keyed by `enigma_number`. Anything
// that wants to read `good_answer_image` / `wrong_answer_image*` off game_meta
// must merge them back first - the same merge playground.php does for the Mystery
// runtime.
//
// The media list only holds enigmas that HAVE an image, so its indices do NOT
// line up with game_meta.enigmas: match on the enigma NUMBER, never on position.
//
// Both `load` and `preview` need this. `preview` didn't do it (and didn't even
// SELECT `medias`), which is why the client-side GO answer sheet came up with
// every tile empty - retour Ludiom #58.
function mergeEnigmaMedia($gm, $medias) {
    if (!is_array($gm['enigmas'] ?? null)) return $gm;
    $byNumber = [];
    foreach ((is_array($medias['enigmas'] ?? null) ? $medias['enigmas'] : []) as $em) {
        if (!is_array($em)) continue;
        $num = $em['enigma_number'] ?? null;
        if ($num === null || $num === '') continue;
        $byNumber[(string)$num] = $em;
    }
    if (!$byNumber) return $gm;
    foreach ($gm['enigmas'] as $i => $e) {
        if (!is_array($e)) continue;
        $num = $e['number'] ?? null;
        if ($num === null || $num === '' || !isset($byNumber[(string)$num])) continue;
        foreach ($byNumber[(string)$num] as $k => $v) {
            if ($k === 'enigma_number' || $v === '' || $v === null) continue;
            $gm['enigmas'][$i][$k] = $v;
        }
    }
    return $gm;
}

// Does this client hold this scenario in this app? Only an explicit
// mode='<app>' grant row counts (returned, so callers can read pattern_id /
// durations off it). GO and Spot are sold separately and granted by hand from
// the admin client page - the premium licence (whole playground catalogue)
// never implies them.
function goResolveGrant($db, $clientId, $scenarioId, $app) {
    $grant = $db->fetch(
        'SELECT pattern_id, durations FROM client_scenarios WHERE client_id = ? AND scenario_id = ? AND mode = ?',
        [$clientId, $scenarioId, $app]
    );
    return $grant ?: null;
}

// Which enigma image field backs each pattern slot.
function goSlotImageFields() {
    return [
        'good' => 'good_answer_image', 'wrong' => 'wrong_answer_image',
        'wrong2' => 'wrong_answer_image_2', 'wrong3' => 'wrong_answer_image_3',
    ];
}

// Slides for the PWA bundle, from go_tutorial_slides.
//
// One table, two carousels, told apart by `scenario_id`:
//   null       -> the app-wide "how to play" tutorial (setup screen)
//   an id      -> that scenario's BRIEFING screens, shown after "Commencer" and
//                 before the first question (#67)
//
// Returns [] if the table or the column isn't there yet: both migrations deploy
// separately and `load` is the player-critical path - a missing carousel must
// never refuse a game.
// Normalize the `scenario_id` that separates the two carousels: absent, empty or
// 0 all mean "the global tutorial", never scenario 0.
function slideScenarioId($raw) {
    if ($raw === null || $raw === '' || $raw === 'null') return null;
    $id = (int)$raw;
    return $id > 0 ? $id : null;
}

// A carousel is read on a phone's setup screen and cached offline with the rest
// of the bundle, so it is deliberately short and its images deliberately small.
// Both caps are enforced server-side; Studio also warns above 1 MB.
const GO_MAX_SLIDES = 10;
const GO_MAX_SLIDE_IMAGE_BYTES = 5 * 1024 * 1024;

// How many slides a carousel already holds, for the cap.
function slideCount($db, $app, $scenarioId) {
    $row = $scenarioId === null
        ? $db->fetch('SELECT COUNT(*) AS n FROM go_tutorial_slides WHERE app = ? AND scenario_id IS NULL', [$app])
        : $db->fetch('SELECT COUNT(*) AS n FROM go_tutorial_slides WHERE app = ? AND scenario_id = ?', [$app, $scenarioId]);
    return (int)($row['n'] ?? 0);
}

// Positions are per (app, scenario_id), so a briefing never inherits the global
// carousel's numbering.
function nextSlidePosition($db, $app, $scenarioId) {
    $max = $scenarioId === null
        ? $db->fetch('SELECT MAX(position) AS p FROM go_tutorial_slides WHERE app = ? AND scenario_id IS NULL', [$app])
        : $db->fetch('SELECT MAX(position) AS p FROM go_tutorial_slides WHERE app = ? AND scenario_id = ?', [$app, $scenarioId]);
    return (int)($max['p'] ?? 0) + 1;
}

// Best-effort file cleanup for a slide image: basename-guarded, own folder only,
// and a no-op for a colour-background slide (filename NULL).
function deleteSlideFile($filename) {
    if (!$filename) return;
    $path = __DIR__ . '/../../media/' . GO_TUTORIAL_DIR . '/' . basename($filename);
    if (is_file($path)) @unlink($path);
}

// Coerce a slide's styling payload into exactly what the columns accept. The
// editor is admin-only, but these values are rendered straight into CSS on a
// player's phone - so colours are pattern-checked rather than trusted, and every
// enum falls back to its default instead of reaching the DB as an invalid value.
function normalizeSlideStyle($d) {
    $hex = function ($v) {
        $v = is_string($v) ? trim($v) : '';
        return preg_match('/^#[0-9A-Fa-f]{6}$/', $v) ? strtolower($v) : null;
    };
    $enum = function ($v, $allowed, $default) {
        return (is_string($v) && in_array($v, $allowed, true)) ? $v : $default;
    };

    $family = $d['font_family'] ?? null;
    // Only a family the catalog knows may be stored. A system catalog font has
    // no faces to ship but is still a valid choice, so the check is against the
    // full catalog, not just the bundled families.
    if (is_string($family) && trim($family) !== '') {
        $family = trim($family);
        $known = array_keys(goCatalogFontFaces());
        $isKnown = false;
        foreach (array_merge($known, goCatalogSystemFamilies()) as $k) {
            if (strcasecmp($k, $family) === 0) { $family = $k; $isKnown = true; break; }
        }
        if (!$isKnown) $family = null;
    } else {
        $family = null;
    }

    // Size is a PERCENTAGE OF THE SLIDE'S WIDTH. Clamped so a slider accident
    // cannot produce a single letter filling the card or text too small to read.
    $size = isset($d['font_size_pct']) ? (float)$d['font_size_pct'] : 7.0;
    $size = max(2.0, min(20.0, $size));

    return [
        'font_family' => $family,
        'font_color' => $hex($d['font_color'] ?? null),
        'font_size_pct' => round($size, 2),
        'text_align' => $enum($d['text_align'] ?? null, ['left', 'center', 'right'], 'center'),
        'text_anchor' => $enum($d['text_anchor'] ?? null, ['top', 'middle', 'bottom'], 'middle'),
        'scrim' => max(0, min(100, (int)($d['scrim'] ?? 0))),
        'background_color' => $hex($d['background_color'] ?? null),
        'background_fit' => $enum($d['background_fit'] ?? null, ['cover', 'contain'], 'cover'),
    ];
}

// The columns a slide carries. Kept in one place because `load` (player path)
// and `tutorial_list` (admin path) must agree exactly on the shape.
const GO_SLIDE_COLUMNS = 'filename, caption, font_family, font_color, font_size_pct,
                          text_align, text_anchor, scrim, background_color,
                          background_fit';

// Normalize one DB row into the slide shape both the PWA and Studio render.
// `caption` is the localized TEXT drawn on the slide (the column kept its old
// name so phones holding a cached bundle keep working - see the migration).
function goSlideRow($r) {
    $caption = !empty($r['caption']) ? json_decode($r['caption'], true) : null;
    return [
        'image_url' => mediaUrl(GO_TUTORIAL_DIR, $r['filename'] ?? null),
        'caption' => is_array($caption) ? $caption : null,
        'font_family' => $r['font_family'] ?? null,
        'font_color' => $r['font_color'] ?? null,
        'font_size_pct' => isset($r['font_size_pct']) ? (float)$r['font_size_pct'] : 7.0,
        'text_align' => $r['text_align'] ?? 'center',
        'text_anchor' => $r['text_anchor'] ?? 'middle',
        'scrim' => (int)($r['scrim'] ?? 0),
        'background_color' => $r['background_color'] ?? null,
        'background_fit' => $r['background_fit'] ?? 'cover',
    ];
}

function goSlides($db, $app, $scenarioId = null) {
    $cols = GO_SLIDE_COLUMNS;
    try {
        $rows = $scenarioId === null
            ? $db->fetchAll(
                "SELECT $cols FROM go_tutorial_slides
                 WHERE app = ? AND scenario_id IS NULL ORDER BY position ASC, id ASC",
                [$app]
            )
            : $db->fetchAll(
                "SELECT $cols FROM go_tutorial_slides
                 WHERE app = ? AND scenario_id = ? ORDER BY position ASC, id ASC",
                [$app, $scenarioId]
            );
    } catch (Exception $e) {
        // The styling migration may not have run yet. Fall back to the columns
        // that have always existed rather than refusing a game: a slide then
        // renders with the defaults goSlideRow() supplies.
        try {
            $rows = $scenarioId === null
                ? $db->fetchAll(
                    'SELECT filename, caption FROM go_tutorial_slides
                     WHERE app = ? AND scenario_id IS NULL ORDER BY position ASC, id ASC',
                    [$app]
                )
                : $db->fetchAll(
                    'SELECT filename, caption FROM go_tutorial_slides
                     WHERE app = ? AND scenario_id = ? ORDER BY position ASC, id ASC',
                    [$app, $scenarioId]
                );
        } catch (Exception $e2) {
            return [];
        }
    }
    $out = [];
    foreach ($rows as $r) $out[] = goSlideRow($r);
    return $out;
}

// The carousel's authored heading for an app (Localized map), or null when the
// admin left it blank - the PWA then falls back to its own built-in string.
function goInstructionsTitle($db, $app) {
    try {
        $row = $db->fetch('SELECT instructions_title FROM go_app_settings WHERE app = ?', [$app]);
    } catch (Exception $e) {
        return null; // migration not applied yet
    }
    if (!$row || empty($row['instructions_title'])) return null;
    $decoded = json_decode($row['instructions_title'], true);
    return is_array($decoded) && $decoded ? $decoded : null;
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

    // ---- font: CORS-friendly proxy for CATALOG font files -------------------
    // The Players-Instructions slides pick from Studio's curated font catalog,
    // but the PWA is a separate cross-origin app that ships no font files of its
    // own. `load` puts the faces a bundle needs in media.fonts pointing here;
    // the PWA fetches them once, caches the blobs, and injects @font-face.
    //
    // Whitelisted by construction: only a file named by the catalog map can be
    // served, so `f` cannot address anything else on disk.
    case 'font': {
        $f = basename((string)($_GET['f'] ?? ''));
        $allowed = [];
        foreach (goCatalogFontFaces() as $faces) {
            foreach ($faces as $face) $allowed[$face['file']] = true;
        }
        if ($f === '' || !isset($allowed[$f])) {
            http_response_code(404);
            exit;
        }
        $path = goCatalogFontPath($f);
        if (!$path) {
            http_response_code(404);
            exit;
        }
        header('Content-Type: ' . goMediaContentType($path)); // overrides the JSON header
        header('Content-Length: ' . filesize($path));
        // Catalog files are immutable - a font is never re-uploaded under the
        // same name, so this can be cached hard.
        header('Cache-Control: public, max-age=31536000, immutable');
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

        // This endpoint serves two apps (project_taghunter_spot): GO (letter
        // answers, physical panneau) and Spot (on-screen answer-image tiles,
        // linear randomized sequence). `app` selects which gate/grant/bundle to
        // use; default 'go' keeps the existing GO contract unchanged.
        $app = requestApp($_GET['app'] ?? null);

        // (1) Client + per-app capability + billing gate (project_client_app_section).
        // {app}_enabled is the master on/off. Billing is the same overdue_since +
        // grace clock for every app: when billing-ok flips off, clients.php stamps
        // {app}_billing_overdue_since; the app keeps working until
        // now > overdue_since + {app}_billing_grace_days, then locks. (No reprieve
        // - that's a Playground-device concept.)
        if ($app === 'spot') {
            $client = $db->fetch(
                'SELECT id, spot_enabled,
                        spot_billing_overdue_since, spot_billing_grace_days
                 FROM clients WHERE id = ?',
                [$clientId]
            );
            if (!$client) {
                jsonResponse(['error' => 'refused', 'reason' => 'unknown_client'], 403);
            }
            if (empty($client['spot_enabled'])) {
                jsonResponse(['error' => 'refused', 'reason' => 'spot_disabled'], 403);
            }
            $overdueSince = $client['spot_billing_overdue_since'] ?? null;
            $graceDays = (int)($client['spot_billing_grace_days'] ?? 30);
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
        // (GO only) bound pattern. Spot uses a distinct mode='spot' grant. Only
        // an explicit grant row counts - GO/Spot are granted by hand, never
        // implied by the licence.
        $grant = goResolveGrant($db, $clientId, $scenarioId, $app);
        if (!$grant) {
            jsonResponse(['error' => 'refused', 'reason' => 'not_granted'], 403);
        }

        // (3) Scenario + the requested app's OWN eligibility flag. Spot started
        // out reusing GO's `adaptable_go` pool, but got its own editor toggle
        // (`adaptable_spot`) once its content diverged - so a scenario ticked
        // only "Adaptable à Spot" must load in Spot, and one ticked only
        // "Adaptable à GO" must not. Checking adaptable_go for both apps (as this
        // did until the Drop->Spot rename) refused the former with `not_go`.
        $scenario = $db->fetch(
            'SELECT id, uniqid, title, data, medias, client_id, validated_languages, IFNULL(version, "1.0") AS version FROM scenarios WHERE id = ?',
            [$scenarioId]
        );
        if (!$scenario) {
            jsonResponse(['error' => 'refused', 'reason' => 'unknown_scenario'], 403);
        }
        // Languages an admin has not validated yet never reach a phone.
        $scenario['data'] = ScenarioLanguages::strip(
            $scenario['data'],
            ScenarioLanguages::visibleLanguages($db, $scenario, (int)$clientId)
        );
        $data = !empty($scenario['data']) ? json_decode($scenario['data'], true) : null;
        $gm = is_array($data) ? ($data['game_meta'] ?? ($data['data']['game_meta'] ?? [])) : [];
        if ($app === 'spot') {
            if (empty($gm['adaptable_spot'])) {
                jsonResponse(['error' => 'refused', 'reason' => 'not_spot'], 403);
            }
        } elseif (empty($gm['adaptable_go'])) {
            jsonResponse(['error' => 'refused', 'reason' => 'not_go'], 403);
        }

        $uniqid = $scenario['uniqid'];
        $medias = !empty($scenario['medias']) ? json_decode($scenario['medias'], true) : [];
        $mImages = is_array($medias['images'] ?? null) ? $medias['images'] : [];
        $mSounds = is_array($medias['sounds'] ?? null) ? $medias['sounds'] : [];

        // Answer images live in medias.enigmas[], not in game_meta - splice them
        // back before either branch reads them.
        $gm = mergeEnigmaMedia($gm, $medias);

        $warning = null;
        $answerCount = ($gm['go_answer_count'] ?? null) == 4 ? 4 : 2;
        $enigmas = [];

        if ($app === 'spot') {
            // (4/5) Spot: on-screen answer-image tiles. No pattern, no codes - the
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
                // 1..3 stars, shown under the title and used to break the final
                // recap down by difficulty. 0 = the author left it unset.
                $difficulty = (int)($e['difficulty'] ?? 0);
                $enigmas[] = [
                    'number' => $e['number'] ?? (string)($idx + 1),
                    // The enigma name/title (Localized map) - shown above the tiles.
                    'text' => $e['text'] ?? null,
                    // The authored question (Localized). Spot has no physical
                    // panneau to carry it, so it replaces the generic prompt.
                    'question' => $e['spot_question'] ?? null,
                    'difficulty' => ($difficulty >= 1 && $difficulty <= 3) ? $difficulty : null,
                    'good_points' => $e['good_answer_points'] ?? null,
                    // Authored signed (negative = penalty), like the maluses. Sent raw:
                    // the app deducts the magnitude either way, so scenarios saved
                    // before the sign convention still penalise.
                    'wrong_points' => $e['wrong_answer_points'] ?? null,
                    'answers' => $answers,
                ];
            }
        } else {
            // (4) GO: resolve the answer key (letter -> slot) from the scenario's
            // default GO pattern (one per scenario, set in the editor). Legacy
            // fallback: a pattern_id bound on the grant. If neither, identity
            // (A = good) + warn.
            $assignments = [];
            $defaultGoUniqid = $gm['scenario_default_go_pattern'] ?? null;
            if ($defaultGoUniqid) {
                $pattern = $db->fetch('SELECT pattern_data FROM patterns WHERE pattern_uniqid = ? AND mode = "go"', [$defaultGoUniqid]);
                $assignments = patternAssignments($pattern['pattern_data'] ?? null);
            }
            if (!$assignments && !empty($grant['pattern_id'])) {
                $pattern = $db->fetch('SELECT pattern_data FROM patterns WHERE id = ? AND mode = "go"', [$grant['pattern_id']]);
                $assignments = patternAssignments($pattern['pattern_data'] ?? null);
            }
            $correctLetters = correctLettersFromAssignments($assignments);
            if (!$correctLetters) {
                $warning = 'no_pattern_bound';
            }

            // (5) Code + correct letter, PLUS the answer image behind each letter:
            // the phone now shows the visuals in the answer boxes (not bare
            // letters), so the same slot->image resolution `preview` does for the
            // operator's answer sheet ships to the player too. The letters stay
            // the answer key - the images just ride along.
            $letters = $answerCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B'];
            $slotField = goSlotImageFields();
            foreach (($gm['enigmas'] ?? []) as $e) {
                if (!is_array($e)) continue;
                $num = (string)($e['number'] ?? '');
                $assign = $assignments[$num] ?? null;
                $answers = [];
                foreach ($letters as $l) {
                    // No pattern bound → identity (A = good, the rest wrong).
                    $slot = $assign[$l] ?? ($l === 'A' ? 'good' : 'wrong');
                    $field = $slotField[$slot] ?? null;
                    $filename = $field ? ($e[$field] ?? null) : null;
                    $answers[] = [
                        'letter' => $l,
                        'image_url' => $filename ? mediaUrl($uniqid, $filename) : null,
                    ];
                }
                $enigmas[] = [
                    'number' => $e['number'] ?? null,
                    'short_code' => isset($e['short_code']) ? strtoupper(trim($e['short_code'])) : null,
                    'correct_letter' => $correctLetters[$num] ?? 'A',
                    'good_points' => $e['good_answer_points'] ?? null,
                    // Authored signed (negative = penalty), like the maluses. Sent raw:
                    // the app deducts the magnitude either way, so scenarios saved
                    // before the sign convention still penalise.
                    'wrong_points' => $e['wrong_answer_points'] ?? null,
                    // The enigma name/title (Localized map) - shown in the GO header
                    // so the player confirms which enigma they're answering.
                    'text' => $e['text'] ?? null,
                    'answers' => $answers,
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

        // The two carousels, read once: their fonts have to be resolved into
        // `media.fonts` below, so they cannot be inlined in the bundle literal.
        $tutorialSlides = goSlides($db, $app, null);
        $briefingSlides = goSlides($db, $app, (int)$scenario['id']);
        // Catalog font faces the slides need, on top of the scenario's own
        // custom fonts. Only the families actually used are shipped.
        $slideFonts = slideFontFaces([$tutorialSlides, $briefingSlides]);

        $bundle = [
            'version' => $scenario['version'],
            'app' => $app,
            'scenario_id' => (int)$scenario['id'],
            'go_answer_count' => $answerCount,
            'default_language' => $data['default_language'] ?? 'fr',
            'available_languages' => $data['available_languages'] ?? ['fr'],
            'title' => $gm['title'] ?? $scenario['title'] ?? '',
            // The scenario's pitch (Localized), shown under the title on the
            // PWA's inscription screen so the team reads what the game is about
            // before starting.
            //
            // This is `description`, NOT `story`: retour #16 turned the editor's
            // "Histoire" field (stored as `story`) into licensee-facing
            // "Informations" - technical notes that must never reach a player.
            // `story` is therefore no longer sent; a phone still holding an old
            // cached bundle keeps showing its `story` (the PWA falls back to it)
            // until the bundle refreshes.
            'description' => $gm['description'] ?? null,
            // "How to play" carousel (Studio → GO → Tuto). Global per app, cached
            // offline with the rest of the bundle.
            'tutorial' => $tutorialSlides,
            // The carousel's heading, authored per app in Studio (Localized).
            // Null = the PWA uses its own built-in string.
            'instructions_title' => goInstructionsTitle($db, $app),
            // This scenario's BRIEFING screens - the consignes + the story, shown
            // full-screen between "Commencer" and the first question (#67). Empty
            // = the game starts straight away, as before.
            'briefing' => $briefingSlides,
            'media' => [
                'background_url' => mediaUrl($uniqid, $bgFile),
                'sound_good_url' => mediaUrl($uniqid, $mSounds['enigma_success'] ?? null),
                'sound_wrong_url' => mediaUrl($uniqid, $mSounds['enigma_error'] ?? null),
                // Custom font faces resolved to URLs so the PWA can @font-face them
                // and render with the scenario's font. (Catalog fonts have no faces
                // → the PWA just sets the family name with a fallback.)
                'fonts' => (function () use ($gm, $uniqid, $slideFonts) {
                    $out = $slideFonts;
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
            // The challenges this operator offers for this scenario, in minutes.
            // One entry = no choice screen (applied silently); several = the
            // player picks on the setup screen. `duration_reference` is the time
            // the scenario's LEVELS were authored for: the PWA scales the level
            // thresholds by chosen/reference so a short challenge stays
            // climbable. (project_go_spot_durations)
            'durations' => resolveDurations($grant['durations'] ?? null, $gm['default_time'] ?? null),
            'duration_reference' => (int)($gm['default_time'] ?? 0) ?: null,
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
        // GO vs Spot loads in the shared table.
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
        // The challenge this run was played on. NULL when the phone predates
        // durations - the board then files it under "unspecified".
        $duration = isset($d['duration_minutes']) ? (int)$d['duration_minutes'] : 0;
        $duration = ($duration >= 1 && $duration <= 600) ? $duration : null;

        // Last-write-wins upsert keyed by (client, scenario, team_uuid, app) - the
        // `app` discriminator lets the same scenario run in GO and Spot without the
        // two boards colliding on one team_uuid.
        $db->execute(
            'INSERT INTO go_scores
                (client_id, scenario_id, team_uuid, team_name, score, level, finished, elapsed_seconds, app, duration_minutes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                team_name = VALUES(team_name), score = VALUES(score), level = VALUES(level),
                finished = VALUES(finished), elapsed_seconds = VALUES(elapsed_seconds),
                duration_minutes = VALUES(duration_minutes)',
            [$clientId, $scenarioId, $teamUuid, $teamName, $score, $level, $finished, $elapsed, $app, $duration]
        );

        jsonResponse(['ok' => true]);
        break;
    }

    // ---- duration_*: the operator's challenge configuration (client/admin) ---
    // Two levels (project_go_spot_durations): a client-level CATALOG of minutes
    // shared by GO and Spot, and a per-(scenario, app) SELECTION drawn from it.
    // A client always acts on itself; an admin passes client_id and gets the same
    // editor inside the client page.
    case 'duration_catalog': {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        [, $clientId] = requireClientScope($db, $_GET['client_id'] ?? null);
        $row = $db->fetch('SELECT duration_catalog FROM clients WHERE id = ?', [$clientId]);
        if (!$row) {
            jsonResponse(['error' => 'refused', 'reason' => 'unknown_client'], 403);
        }
        $catalog = !empty($row['duration_catalog']) ? json_decode($row['duration_catalog'], true) : [];
        jsonResponse(['data' => ['catalog' => normalizeDurations($catalog)]]);
        break;
    }

    case 'duration_catalog_save': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        $d = getRequestData();
        [, $clientId] = requireClientScope($db, $d['client_id'] ?? null);
        $catalog = normalizeDurations($d['catalog'] ?? []);
        $db->execute(
            'UPDATE clients SET duration_catalog = ? WHERE id = ?',
            [json_encode($catalog), $clientId]
        );
        jsonResponse(['ok' => true, 'catalog' => $catalog]);
        break;
    }

    // Which challenges a scenario offers in one app. Written on the grant row,
    // so it only exists for a (client, scenario) the app can actually serve.
    case 'duration_scenario_save': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        $d = getRequestData();
        [, $clientId] = requireClientScope($db, $d['client_id'] ?? null);
        $scenarioId = $d['scenario_id'] ?? null;
        if (!$scenarioId) {
            jsonResponse(['error' => 'missing_params', 'reason' => 'scenario_id required'], 400);
        }
        $app = requestApp($d['app'] ?? null);
        $grant = $db->fetch(
            'SELECT id FROM client_scenarios WHERE client_id = ? AND scenario_id = ? AND mode = ?',
            [$clientId, $scenarioId, $app]
        );
        // The challenge list lives ON the grant row: no row, no GO/Spot access.
        if (!$grant) {
            jsonResponse(['error' => 'refused', 'reason' => 'not_granted'], 403);
        }
        $durations = normalizeDurations($d['durations'] ?? []);
        $db->execute(
            'UPDATE client_scenarios SET durations = ? WHERE id = ?',
            [$durations ? json_encode($durations) : null, $grant['id']]
        );
        jsonResponse(['ok' => true, 'durations' => $durations]);
        break;
    }

    // ---- tutorial_*: the two slide carousels (admin) -------------------------
    // Without `scenario_id`: the app-wide "Players Instructions" carousel, shown
    // on the setup screen under the scenario description - one per app, whatever
    // the scenario. WITH a `scenario_id`: that scenario's BRIEFING screens,
    // shown after "Commencer" and before the first question (#67).
    //
    // Same table, same CRUD, same editor, same renderer - only the canvas shape
    // differs (a 4:5 card vs full screen). A slide is a localized TEXT block
    // (font, colour, size, placement, scrim) over a background that is either a
    // solid colour or an image, so a slide can exist with no file at all.
    // Authored in Studio -> Players Instructions; both ship inside every `load`
    // bundle so the phone carries them offline. Images live in media/go_tutorial/
    // and are served by the `media` proxy above.
    case 'tutorial_list': {
        requireAdminAuth($db);
        $app = requestApp($_GET['app'] ?? null);
        $scenarioId = slideScenarioId($_GET['scenario_id'] ?? null);
        $cols = 'id, position, needs_review, ' . GO_SLIDE_COLUMNS;
        $rows = $db->fetchAll(
            $scenarioId === null
                ? "SELECT $cols FROM go_tutorial_slides
                   WHERE app = ? AND scenario_id IS NULL ORDER BY position ASC, id ASC"
                : "SELECT $cols FROM go_tutorial_slides
                   WHERE app = ? AND scenario_id = ? ORDER BY position ASC, id ASC",
            $scenarioId === null ? [$app] : [$app, $scenarioId]
        );
        $out = [];
        foreach ($rows as $r) {
            $slide = goSlideRow($r);
            $out[] = array_merge($slide, [
                'id' => (int)$r['id'],
                'position' => (int)$r['position'],
                'filename' => $r['filename'],
                // Set by the styling migration on slides converted from the old
                // image+caption model; cleared the first time this slide saves.
                'needs_review' => !empty($r['needs_review']),
                // An all-blank text reads back as {} rather than null so the
                // editor's per-language inputs bind cleanly.
                'caption' => $slide['caption'] ?? new stdClass(),
            ]);
        }
        jsonResponse([
            'data' => $out,
            'max_slides' => GO_MAX_SLIDES,
            // Only meaningful for the global carousel, but always returned so
            // the page can render its heading field without a second request.
            'instructions_title' => goInstructionsTitle($db, $app) ?? new stdClass(),
        ]);
        break;
    }

    // The scenarios that can carry a briefing in this app, for the page's target
    // picker. Lean on purpose: scenarios.php?action=list would ship every
    // scenario's whole `data` blob just to read one flag.
    case 'briefing_scenarios': {
        requireAdminAuth($db);
        $app = requestApp($_GET['app'] ?? null);
        $flag = $app === 'spot' ? 'adaptable_spot' : 'adaptable_go';
        $rows = $db->fetchAll(
            'SELECT id, title, data FROM scenarios WHERE game_type = "mystery" ORDER BY title ASC'
        );
        $out = [];
        foreach ($rows as $r) {
            $data = !empty($r['data']) ? json_decode($r['data'], true) : null;
            $gm = is_array($data) ? ($data['game_meta'] ?? ($data['data']['game_meta'] ?? null)) : null;
            if (!is_array($gm) || empty($gm[$flag])) continue;
            $count = $db->fetch(
                'SELECT COUNT(*) AS n FROM go_tutorial_slides WHERE app = ? AND scenario_id = ?',
                [$app, $r['id']]
            );
            $out[] = [
                'id' => (int)$r['id'],
                'title' => $r['title'],
                'slides' => (int)($count['n'] ?? 0),
            ];
        }
        jsonResponse(['data' => $out]);
        break;
    }

    // Append an EMPTY slide (no image): a plain colour background the admin then
    // styles. Uploading an image is a separate, optional step - which is the
    // whole point of the text-over-background model.
    case 'tutorial_create': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        requireAdminAuth($db);
        $d = getRequestData();
        $app = requestApp($d['app'] ?? null);
        $scenarioId = slideScenarioId($d['scenario_id'] ?? null);
        if (slideCount($db, $app, $scenarioId) >= GO_MAX_SLIDES) {
            jsonResponse(['error' => 'too_many_slides', 'reason' => 'max ' . GO_MAX_SLIDES . ' slides'], 400);
        }
        $db->execute(
            'INSERT INTO go_tutorial_slides
                (app, scenario_id, position, filename, background_color, background_fit)
             VALUES (?, ?, ?, NULL, ?, ?)',
            [$app, $scenarioId, nextSlidePosition($db, $app, $scenarioId), '#0f172a', 'cover']
        );
        jsonResponse(['ok' => true, 'id' => (int)$db->getConnection()->lastInsertId()]);
        break;
    }

    case 'tutorial_upload': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        requireAdminAuth($db);
        $app = requestApp($_POST['app'] ?? null);
        // Null = the global carousel; an id = that scenario's briefing (#67).
        $scenarioId = slideScenarioId($_POST['scenario_id'] ?? null);
        // With an `id` the image is attached to (or replaces the image on) an
        // EXISTING slide; without one this creates a slide carrying it, which is
        // how the page behaved before slides could exist without an image.
        $slideId = (int)($_POST['id'] ?? 0);

        $file = $_FILES['image'] ?? null;
        if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            jsonResponse(['error' => 'upload_failed', 'reason' => 'no image received'], 400);
        }
        if (($file['size'] ?? 0) > GO_MAX_SLIDE_IMAGE_BYTES) {
            jsonResponse([
                'error' => 'file_too_large',
                'reason' => 'max ' . (int)(GO_MAX_SLIDE_IMAGE_BYTES / 1048576) . ' MB per image',
            ], 400);
        }
        $ext = strtolower(pathinfo($file['name'] ?? '', PATHINFO_EXTENSION));
        if (!in_array($ext, ['png', 'jpg', 'jpeg', 'gif', 'webp'], true)) {
            jsonResponse(['error' => 'unsupported_type', 'reason' => 'png, jpg, gif or webp only'], 400);
        }
        if (!$slideId && slideCount($db, $app, $scenarioId) >= GO_MAX_SLIDES) {
            jsonResponse(['error' => 'too_many_slides', 'reason' => 'max ' . GO_MAX_SLIDES . ' slides'], 400);
        }

        $dir = __DIR__ . '/../../media/' . GO_TUTORIAL_DIR;
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            jsonResponse(['error' => 'server_error', 'reason' => 'cannot create media dir'], 500);
        }
        // The random suffix is what makes the URL change on every re-upload, so
        // a phone holding the old file in its blob cache refetches it instead of
        // keeping a stale background forever (the PWA now reuses blobs by URL).
        $filename = 'slide_' . $app . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(3)) . '.' . $ext;
        if (!move_uploaded_file($file['tmp_name'], $dir . '/' . $filename)) {
            jsonResponse(['error' => 'upload_failed', 'reason' => 'could not store the file'], 500);
        }

        if ($slideId) {
            $prev = $db->fetch('SELECT filename FROM go_tutorial_slides WHERE id = ?', [$slideId]);
            if (!$prev) {
                @unlink($dir . '/' . $filename);
                jsonResponse(['error' => 'not_found', 'reason' => 'unknown slide'], 404);
            }
            $db->execute('UPDATE go_tutorial_slides SET filename = ? WHERE id = ?', [$filename, $slideId]);
            deleteSlideFile($prev['filename'] ?? null);
        } else {
            // Append at the end of THIS carousel - positions are per (app,
            // scenario), so a briefing never inherits the carousel's numbering.
            $caption = isset($_POST['caption']) ? json_decode((string)$_POST['caption'], true) : null;
            $db->execute(
                'INSERT INTO go_tutorial_slides (app, scenario_id, position, filename, caption, background_fit)
                 VALUES (?, ?, ?, ?, ?, ?)',
                [
                    $app, $scenarioId, nextSlidePosition($db, $app, $scenarioId), $filename,
                    is_array($caption) ? json_encode($caption, JSON_UNESCAPED_UNICODE) : null,
                    'cover',
                ]
            );
            $slideId = (int)$db->getConnection()->lastInsertId();
        }

        jsonResponse([
            'ok' => true,
            'id' => $slideId,
            'filename' => $filename,
            'image_url' => mediaUrl(GO_TUTORIAL_DIR, $filename),
        ]);
        break;
    }

    // Drop a slide's image without deleting the slide: it falls back to its
    // solid background colour.
    case 'tutorial_image_delete': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        requireAdminAuth($db);
        $d = getRequestData();
        $id = (int)($d['id'] ?? 0);
        if (!$id) {
            jsonResponse(['error' => 'missing_params', 'reason' => 'id required'], 400);
        }
        $row = $db->fetch('SELECT filename FROM go_tutorial_slides WHERE id = ?', [$id]);
        if ($row) {
            $db->execute('UPDATE go_tutorial_slides SET filename = NULL WHERE id = ?', [$id]);
            deleteSlideFile($row['filename'] ?? null);
        }
        jsonResponse(['ok' => true]);
        break;
    }

    // Save a slide: its localized text AND its styling, in one call. Saving is
    // also what clears `needs_review` - an admin has now looked at the slide.
    case 'tutorial_update': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        requireAdminAuth($db);
        $d = getRequestData();
        $id = (int)($d['id'] ?? 0);
        if (!$id) {
            jsonResponse(['error' => 'missing_params', 'reason' => 'id required'], 400);
        }
        $caption = is_array($d['caption'] ?? null) ? $d['caption'] : [];
        // Drop empty translations so an all-blank text reads back as "none".
        $caption = array_filter($caption, fn($v) => is_string($v) && trim($v) !== '');
        $style = normalizeSlideStyle($d);
        $db->execute(
            'UPDATE go_tutorial_slides
                SET caption = ?, font_family = ?, font_color = ?, font_size_pct = ?,
                    text_align = ?, text_anchor = ?, scrim = ?, background_color = ?,
                    background_fit = ?, needs_review = 0
              WHERE id = ?',
            [
                $caption ? json_encode($caption, JSON_UNESCAPED_UNICODE) : null,
                $style['font_family'], $style['font_color'], $style['font_size_pct'],
                $style['text_align'], $style['text_anchor'], $style['scrim'],
                $style['background_color'], $style['background_fit'],
                $id,
            ]
        );
        jsonResponse(['ok' => true]);
        break;
    }

    // Reorder in one shot: the client sends the slide ids in their new order and
    // we rewrite `position` from the array index (no per-move swapping).
    case 'tutorial_reorder': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        requireAdminAuth($db);
        $d = getRequestData();
        $ids = is_array($d['ids'] ?? null) ? $d['ids'] : [];
        foreach (array_values($ids) as $i => $id) {
            $db->execute('UPDATE go_tutorial_slides SET position = ? WHERE id = ?', [$i + 1, (int)$id]);
        }
        jsonResponse(['ok' => true]);
        break;
    }

    case 'tutorial_delete': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        requireAdminAuth($db);
        $d = getRequestData();
        $id = (int)($d['id'] ?? 0);
        if (!$id) {
            jsonResponse(['error' => 'missing_params', 'reason' => 'id required'], 400);
        }
        $row = $db->fetch('SELECT filename FROM go_tutorial_slides WHERE id = ?', [$id]);
        if ($row) {
            $db->execute('DELETE FROM go_tutorial_slides WHERE id = ?', [$id]);
            deleteSlideFile($row['filename'] ?? null);
        }
        jsonResponse(['ok' => true]);
        break;
    }

    // The carousel's on-screen heading for an app (Localized). Replaces the
    // PWA's fixed string, which said the same thing for GO and Spot and needed a
    // redeploy to change.
    case 'instructions_title_update': {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        requireAdminAuth($db);
        $d = getRequestData();
        $app = requestApp($d['app'] ?? null);
        $title = is_array($d['title'] ?? null) ? $d['title'] : [];
        $title = array_filter($title, fn($v) => is_string($v) && trim($v) !== '');
        $db->execute(
            'INSERT INTO go_app_settings (app, instructions_title) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE instructions_title = VALUES(instructions_title)',
            [$app, $title ? json_encode($title, JSON_UNESCAPED_UNICODE) : null]
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
        // `medias` is required: the answer images the preview is FOR live there,
        // not in `data`. Leaving it out is what made every tile blank (#58).
        if ($uniqidParam) {
            $scenario = $db->fetch('SELECT id, uniqid, title, data, medias, client_id, validated_languages FROM scenarios WHERE uniqid = ?', [$uniqidParam]);
        } elseif ($scenarioIdParam) {
            $scenario = $db->fetch('SELECT id, uniqid, title, data, medias, client_id, validated_languages FROM scenarios WHERE id = ?', [$scenarioIdParam]);
        } else {
            jsonResponse(['error' => 'missing_params', 'reason' => 'uniqid or scenario_id required'], 400);
        }
        if (!$scenario) {
            jsonResponse(['error' => 'refused', 'reason' => 'unknown_scenario'], 403);
        }
        // The client must hold an explicit GO grant for this scenario (same
        // rule as `load`).
        if (!goResolveGrant($db, $clientId, $scenario['id'], 'go')) {
            jsonResponse(['error' => 'refused', 'reason' => 'not_granted'], 403);
        }
        // A client previews what its phones get; an admin sees every language.
        if (($auth['user_type'] ?? '') === 'client') {
            $scenario['data'] = ScenarioLanguages::strip(
                $scenario['data'],
                ScenarioLanguages::visibleLanguages($db, $scenario, (int)$clientId)
            );
        }
        $data = !empty($scenario['data']) ? json_decode($scenario['data'], true) : null;
        $gm = is_array($data) ? ($data['game_meta'] ?? ($data['data']['game_meta'] ?? [])) : [];
        if (empty($gm['adaptable_go'])) {
            jsonResponse(['error' => 'refused', 'reason' => 'not_go'], 403);
        }
        // Answer images are parked in medias.enigmas[] by the editor - without
        // this merge every `image_url` below resolves to null (#58).
        $medias = !empty($scenario['medias']) ? json_decode($scenario['medias'], true) : [];
        $gm = mergeEnigmaMedia($gm, is_array($medias) ? $medias : []);

        $uniqid = $scenario['uniqid'];
        $answerCount = ($gm['go_answer_count'] ?? null) == 4 ? 4 : 2;
        $letters = $answerCount === 4 ? ['A', 'B', 'C', 'D'] : ['A', 'B'];

        // Build letter→slot per enigma index from the default GO pattern.
        $rowsByIndex = [];
        $warning = null;
        $defaultGoUniqid = $gm['scenario_default_go_pattern'] ?? null;
        if ($defaultGoUniqid) {
            $pattern = $db->fetch('SELECT pattern_data FROM patterns WHERE pattern_uniqid = ? AND mode = "go"', [$defaultGoUniqid]);
            $rowsByIndex = patternAssignments($pattern['pattern_data'] ?? null);
        }
        if (!$rowsByIndex) $warning = 'no_pattern_bound';

        $slotField = goSlotImageFields();

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
        [$from, $to] = resolveBoardBounds();
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
        // Optional challenge filter. Omitted = every duration comes back and the
        // board groups them into one ranked section each (a 30-min run is never
        // ranked against a 1 h 30 one). `d=0` selects the pre-durations rows.
        if (isset($_GET['d']) && $_GET['d'] !== '') {
            $d = (int)$_GET['d'];
            if ($d > 0) { $where .= ' AND duration_minutes = ?'; $params[] = $d; }
            else { $where .= ' AND duration_minutes IS NULL'; }
        }

        $rows = $db->fetchAll(
            "SELECT team_uuid, team_name, score, level, finished, elapsed_seconds, updated_at, duration_minutes
             FROM go_scores WHERE $where
             ORDER BY score DESC, elapsed_seconds ASC",
            $params
        );
        jsonResponse(['data' => $rows]);
        break;
    }

    // ---- public_board: the SAME board, for players (no auth) ----------------
    // Players have no account, so this mirrors `leaderboard` with the token check
    // replaced by explicit scoping: the client comes from `c`, and the scenario
    // must actually be granted to that client in this app's mode. Without the
    // grant check anyone could enumerate boards for arbitrary scenario ids.
    //
    // The operator chooses the time window in their Studio space and it travels
    // in the page URL, so `from`/`to` arrive here exactly as they do for the
    // operator's own board - already UTC, computed in the viewer's timezone.
    //
    // team_uuid is deliberately NOT returned: `score` upserts by
    // (client, scenario, team_uuid, app) with no auth, so publishing team_uuids
    // would let a visitor overwrite another team's score.
    case 'public_board': {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            jsonResponse(['error' => 'method_not_allowed'], 405);
        }
        $clientId = $_GET['c'] ?? $_GET['client'] ?? null;
        $scenarioId = $_GET['s'] ?? $_GET['scenario'] ?? $_GET['scenario_id'] ?? null;
        if (!$clientId || !$scenarioId) {
            jsonResponse(['error' => 'missing_params', 'reason' => 'client and scenario are required'], 400);
        }
        $app = requestApp($_GET['app'] ?? null);

        $refusal = goClientGateReason($db, $clientId, $app);
        if ($refusal !== null) {
            jsonResponse(['error' => 'refused', 'reason' => $refusal[0]], $refusal[1]);
        }

        // The scenario must be granted to this client for this app.
        $grant = $db->fetch(
            'SELECT id FROM client_scenarios WHERE client_id = ? AND scenario_id = ? AND mode = ?',
            [$clientId, $scenarioId, $app]
        );
        if (!$grant) {
            jsonResponse(['error' => 'refused', 'reason' => 'not_granted'], 403);
        }

        $scenario = $db->fetch('SELECT id, title FROM scenarios WHERE id = ?', [$scenarioId]);
        if (!$scenario) {
            jsonResponse(['error' => 'refused', 'reason' => 'unknown_scenario'], 403);
        }

        [$from, $to] = resolveBoardBounds();

        // finished = 1 only: the player-facing board shows a team only once it has
        // ENDED its game, so a live score mid-play doesn't pop in and jump around
        // on the projector. (The operator's own leaderboard still sees in-progress
        // teams.) `total` below is over the same finished set, so "showing X of Y"
        // stays consistent.
        $where = 'scenario_id = ? AND app = ? AND client_id = ? AND finished = 1';
        $params = [$scenarioId, $app, $clientId];
        // updated_at is UTC (connection pinned above); bounds arrive as UTC too.
        if ($from !== '') { $where .= ' AND updated_at >= ?'; $params[] = $from; }
        if ($to !== '')   { $where .= ' AND updated_at <= ?'; $params[] = $to; }

        // Optional challenge filter, same contract as `leaderboard` (the operator
        // bakes it into the projected link; the board's own chips re-request).
        if (isset($_GET['d']) && $_GET['d'] !== '') {
            $d = (int)$_GET['d'];
            if ($d > 0) { $where .= ' AND duration_minutes = ?'; $params[] = $d; }
            else { $where .= ' AND duration_minutes IS NULL'; }
        }

        // Cap the payload - this is polled from phones. The cap is applied PER
        // CHALLENGE (window function), not across the whole set: the board shows
        // one ranked section per duration, and a busy 30-min group must not eat
        // the 1 h group's slots. `totals` reports each group's real size so the
        // page can say "showing X of Y" instead of silently truncating.
        $limit = 200;
        $totalRow = $db->fetch("SELECT COUNT(*) AS n FROM go_scores WHERE $where", $params);
        $totals = $db->fetchAll(
            "SELECT duration_minutes, COUNT(*) AS n FROM go_scores WHERE $where
             GROUP BY duration_minutes ORDER BY duration_minutes ASC",
            $params
        );
        $rows = $db->fetchAll(
            "SELECT team_name, score, level, finished, elapsed_seconds, updated_at, duration_minutes
             FROM (
                SELECT team_name, score, level, finished, elapsed_seconds, updated_at, duration_minutes,
                       ROW_NUMBER() OVER (
                           PARTITION BY duration_minutes
                           ORDER BY score DESC, elapsed_seconds ASC
                       ) AS rn
                FROM go_scores WHERE $where
             ) ranked
             WHERE rn <= $limit
             ORDER BY score DESC, elapsed_seconds ASC",
            $params
        );
        jsonResponse([
            'data' => $rows,
            'total' => (int)($totalRow['n'] ?? count($rows)),
            'totals' => $totals,
            'title' => $scenario['title'] ?? '',
        ]);
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
    // The client-portal "GO & Spot Statistics" page. Scoped to the caller's own
    // client_id (an admin may pass ?client_id=). Pairs go_loads (how many times
    // each GO scenario was opened) with go_scores (teams that pushed a score:
    // counts, finish rate, avg/best score, last played). Read-only own data.
    // Design: project_client_app_section (GO/Spot statistics surface).
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
        // Scope to the requested app so the GO and Spot stat sections stay separate.
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
