<?php
/**
 * Playground app self-update endpoint.
 *
 * UNAUTHENTICATED on purpose: a too-old client must be able to learn it is
 * too old (the hard update floor) before doing anything else, even if its
 * auth handling is itself out of date. Only public release metadata and the
 * public installer binaries are exposed -- the same binaries handed out as a
 * normal download. Artifact integrity is guaranteed by the Tauri updater
 * signing key, not by transport auth.
 *
 * Actions:
 *   - manifest : Tauri updater plugin endpoint. Returns the Tauri v2 updater
 *                JSON for ?target=&arch=&current_version=, or 204 when the
 *                caller is already up to date / no release exists.
 *   - check    : Same body as manifest but ALWAYS returned (never 204). Used
 *                by the playground's own update service for the floor
 *                comparison + release notes + mobile store links.
 *   - download : Streams a release artifact by id (PHP passthrough; the
 *                releases/ directory is never web-served directly).
 */

require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

setCorsHeaders();

function jsonResponse($data, $statusCode = 200) {
    SecurityHeaders::setHeaders();
    header('Content-Type: application/json');
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

/** Absolute URL of this script, for building download links. */
function updateBaseUrl(): string {
    $proto = 'http';
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
        $proto = explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO'])[0];
    } elseif (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        $proto = 'https';
    }
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $script = $_SERVER['SCRIPT_NAME'] ?? '/backend/api/playground_update.php';
    return $proto . '://' . $host . $script;
}

/** Latest store URLs for mobile platforms, keyed by target. */
function mobileStoreUrls(Database $db): array {
    $rows = $db->fetchAll(
        "SELECT target, store_url FROM playground_releases
         WHERE target IN ('android','ios') AND is_latest = 1 AND store_url IS NOT NULL"
    );
    $out = [];
    foreach ($rows as $r) {
        $out[$r['target']] = $r['store_url'];
    }
    return $out;
}

/**
 * Build the latest-release payload for a given platform.
 * Returns null when no release is published for that platform.
 */
function buildManifest(Database $db, string $target, string $arch): ?array {
    $isMobile = in_array($target, ['android', 'ios'], true);

    if ($isMobile) {
        // Mobile releases are arch-agnostic (one store listing).
        $row = $db->fetch(
            "SELECT * FROM playground_releases
             WHERE target = ? AND is_latest = 1 LIMIT 1",
            [$target]
        );
    } else {
        $row = $db->fetch(
            "SELECT * FROM playground_releases
             WHERE target = ? AND arch = ? AND is_latest = 1 LIMIT 1",
            [$target, $arch]
        );
    }

    if (!$row) {
        return null;
    }

    $manifest = [
        'version'   => $row['version'],
        'notes'     => $row['notes'] ?? '',
        'pub_date'  => date('c', strtotime($row['pub_date'])),
        // Extra fields -- the Tauri updater plugin ignores unknown keys; the
        // playground's own update service reads them.
        'min_supported_version' => $row['min_supported_version'] ?? '0.0.0',
        'store_urls' => mobileStoreUrls($db),
    ];

    // Desktop platforms carry a downloadable, signed artifact.
    if (!$isMobile && !empty($row['artifact_path']) && $row['signature'] !== null) {
        $manifest['platforms'] = [
            "$target-$arch" => [
                'signature' => $row['signature'],
                'url'       => updateBaseUrl() . '?action=download&id=' . (int)$row['id'],
            ],
        ];
    }

    return $manifest;
}

try {
    $db = Database::getInstance();
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'manifest':
        case 'check': {
            if ($method !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $target = $_GET['target'] ?? '';
            $arch   = $_GET['arch'] ?? '';
            $current = $_GET['current_version'] ?? '0.0.0';

            if ($target === '' || $arch === '') {
                jsonResponse(['error' => 'target and arch are required'], 400);
            }

            $manifest = buildManifest($db, $target, $arch);

            // 'manifest' is the Tauri plugin endpoint: 204 means "up to date".
            if ($action === 'manifest') {
                if ($manifest === null || version_compare($manifest['version'], $current, '<=')) {
                    Logger::log('playground_update', $method, 'manifest', null,
                        ['target' => $target, 'arch' => $arch, 'current' => $current],
                        ['result' => 'up_to_date'], 204, 'playground');
                    SecurityHeaders::setHeaders();
                    http_response_code(204);
                    exit;
                }
                Logger::log('playground_update', $method, 'manifest', null,
                    ['target' => $target, 'arch' => $arch, 'current' => $current],
                    ['version' => $manifest['version']], 200, 'playground');
                jsonResponse($manifest);
            }

            // 'check' always returns a body so the client can run the floor logic.
            Logger::log('playground_update', $method, 'check', null,
                ['target' => $target, 'arch' => $arch, 'current' => $current],
                ['version' => $manifest['version'] ?? null], 200, 'playground');
            jsonResponse([
                'available' => $manifest !== null,
                'manifest'  => $manifest,
            ]);
            break;
        }

        case 'download': {
            if ($method !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $id = (int)($_GET['id'] ?? 0);
            $row = $db->fetch(
                'SELECT artifact_path, artifact_filename FROM playground_releases WHERE id = ?',
                [$id]
            );

            if (!$row || empty($row['artifact_path'])) {
                jsonResponse(['error' => 'Release artifact not found'], 404);
            }

            $releasesRoot = realpath(__DIR__ . '/../releases');
            $resolved = $releasesRoot
                ? realpath($releasesRoot . DIRECTORY_SEPARATOR
                    . str_replace('/', DIRECTORY_SEPARATOR, $row['artifact_path']))
                : false;

            // Containment guard: the resolved path must stay under releases/.
            if (!$resolved || !$releasesRoot
                || strpos($resolved, $releasesRoot) !== 0 || !is_file($resolved)) {
                jsonResponse(['error' => 'Release artifact not found'], 404);
            }

            $filename = $row['artifact_filename'] ?: basename($resolved);
            Logger::log('playground_update', $method, 'download', null,
                ['id' => $id], ['filename' => $filename], 200, 'playground');

            header('Content-Type: application/octet-stream');
            header('Content-Length: ' . filesize($resolved));
            header('Content-Disposition: attachment; filename="'
                . str_replace('"', '', $filename) . '"');
            header('X-Content-Type-Options: nosniff');

            $fp = fopen($resolved, 'rb');
            if ($fp === false) {
                http_response_code(500);
                exit;
            }
            while (!feof($fp)) {
                echo fread($fp, 1 << 20); // 1 MB chunks
            }
            fclose($fp);
            exit;
        }

        default:
            jsonResponse(['error' => 'Invalid action. Available: manifest, check, download'], 400);
    }
} catch (Exception $e) {
    Logger::log('playground_update', $_SERVER['REQUEST_METHOD'] ?? 'GET',
        $_GET['action'] ?? 'unknown', null, [], ['error' => $e->getMessage()], 500, 'playground');
    jsonResponse(['error' => 'Server error'], 500);
}
