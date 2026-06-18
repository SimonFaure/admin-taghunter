<?php
/**
 * Studio admin endpoint for managing playground app releases.
 *
 * Backs the "Releases" tab in the studio admin UI. Admin-only.
 *
 * Actions:
 *   - list          GET   : all releases, newest first.
 *   - upload        POST  : multipart -- desktop artifact + .sig signature file.
 *   - upload_mobile POST  : JSON -- a mobile (android/ios) store-link release.
 *   - set_latest    POST  : JSON {id} -- mark a release latest for its platform.
 *   - set_floor     POST  : JSON {id, min_supported_version} -- raise the hard floor.
 *   - update_notes  POST  : JSON {id, notes}.
 *   - delete        POST  : JSON {id} -- delete any release; if it was the latest,
 *                                        the next-newest build for its platform is
 *                                        promoted to latest automatically.
 */

require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';

setCorsHeaders();
session_start();

header('Content-Type: application/json');

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

/** Require an authenticated admin. Returns the admin user id. */
function requireAdmin(Database $db): int {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    $header = preg_replace('/^Bearer\s+/i', '', trim($header));
    if ($header !== '') {
        $tokenData = TokenManager::validateToken($db, $header);
        if ($tokenData && ($tokenData['user_type'] ?? '') === 'admin') {
            $_SESSION['user_id'] = $tokenData['user_id'];
            return (int)$tokenData['user_id'];
        }
        if ($tokenData) {
            jsonResponse(['error' => 'Forbidden - admin only'], 403);
        }
    }
    if (isset($_SESSION['user_id']) && ($_SESSION['user_type'] ?? '') === 'admin') {
        return (int)$_SESSION['user_id'];
    }
    jsonResponse(['error' => 'Unauthorized'], 401);
}

function jsonBody(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

const TARGETS = ['windows', 'darwin', 'linux', 'android', 'ios'];
const ARCHS   = ['x86_64', 'aarch64', 'universal'];
const CHANNELS = ['stable', 'test'];

function isSemver(string $v): bool {
    return (bool)preg_match('/^\d+\.\d+\.\d+$/', $v);
}

function sanitizeChannel(string $v): string {
    return in_array($v, CHANNELS, true) ? $v : 'stable';
}

/** Mark one release latest for its (channel, target, arch), clearing siblings. Atomic. */
function setLatest(Database $db, array $row): void {
    $channel = $row['channel'] ?? 'stable';
    $conn = $db->getConnection();
    $conn->beginTransaction();
    try {
        $db->query(
            'UPDATE playground_releases SET is_latest = 0
             WHERE channel = ? AND target = ? AND arch = ?',
            [$channel, $row['target'], $row['arch']]
        );
        $db->query('UPDATE playground_releases SET is_latest = 1 WHERE id = ?', [$row['id']]);
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollBack();
        throw $e;
    }
}

try {
    $db = Database::getInstance();
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    // A POST that overran post_max_size arrives with empty $_POST/$_FILES.
    if ($method === 'POST' && empty($_POST) && empty($_FILES)
        && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0
        && in_array($action, ['upload'], true)) {
        jsonResponse([
            'error' => 'Upload too large for the server. Increase PHP upload_max_filesize / post_max_size.',
        ], 413);
    }

    $adminId = requireAdmin($db);
    $releasesRoot = __DIR__ . '/../releases';

    switch ($action) {
        case 'list': {
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            $rows = $db->fetchAll(
                'SELECT id, version, channel, target, arch, artifact_filename, artifact_size,
                        store_url, pub_date, notes, min_supported_version, is_latest, created_at
                 FROM playground_releases
                 ORDER BY created_at DESC, id DESC'
            );
            foreach ($rows as &$r) {
                $r['is_latest'] = (bool)$r['is_latest'];
                $r['has_signature'] = !empty($r['artifact_filename']);
            }
            jsonResponse(['releases' => $rows]);
            break;
        }

        case 'upload': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);

            $version = trim($_POST['version'] ?? '');
            $target  = trim($_POST['target'] ?? '');
            $arch    = trim($_POST['arch'] ?? '');
            $channel = sanitizeChannel(trim($_POST['channel'] ?? 'stable'));
            $floor   = trim($_POST['min_supported_version'] ?? '0.0.0');
            $notes   = $_POST['notes'] ?? '';
            $markLatest = filter_var($_POST['mark_latest'] ?? 'true', FILTER_VALIDATE_BOOLEAN);

            if (!isSemver($version)) jsonResponse(['error' => 'version must be semver (x.y.z)'], 400);
            if (!in_array($target, ['windows', 'darwin', 'linux'], true)) {
                jsonResponse(['error' => 'upload is for desktop targets only (windows/darwin/linux)'], 400);
            }
            if (!in_array($arch, ARCHS, true)) jsonResponse(['error' => 'invalid arch'], 400);
            if (!isSemver($floor)) jsonResponse(['error' => 'min_supported_version must be semver'], 400);

            if (!isset($_FILES['artifact']) || $_FILES['artifact']['error'] !== UPLOAD_ERR_OK) {
                jsonResponse(['error' => 'artifact file is required'], 400);
            }
            if (!isset($_FILES['signature']) || $_FILES['signature']['error'] !== UPLOAD_ERR_OK) {
                jsonResponse(['error' => 'signature (.sig) file is required'], 400);
            }

            // Sanitize the artifact filename.
            $rawName = basename($_FILES['artifact']['name']);
            $filename = preg_replace('/[^A-Za-z0-9._\-]/', '_', $rawName);
            if ($filename === '' || $filename[0] === '.') {
                jsonResponse(['error' => 'invalid artifact filename'], 400);
            }

            $signature = file_get_contents($_FILES['signature']['tmp_name']);
            if ($signature === false || trim($signature) === '') {
                jsonResponse(['error' => 'could not read signature file'], 400);
            }

            $destDir = $releasesRoot . '/' . $version;
            if (!is_dir($destDir) && !mkdir($destDir, 0775, true) && !is_dir($destDir)) {
                jsonResponse(['error' => 'failed to create release directory'], 500);
            }
            $destPath = $destDir . '/' . $filename;
            if (!move_uploaded_file($_FILES['artifact']['tmp_name'], $destPath)) {
                jsonResponse(['error' => 'failed to store artifact'], 500);
            }

            $relPath = $version . '/' . $filename;
            $size = filesize($destPath);

            // UPSERT on (channel, version, target, arch).
            $db->query(
                'INSERT INTO playground_releases
                    (version, channel, target, arch, artifact_path, artifact_filename, artifact_size,
                     signature, pub_date, notes, min_supported_version, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    artifact_path = VALUES(artifact_path),
                    artifact_filename = VALUES(artifact_filename),
                    artifact_size = VALUES(artifact_size),
                    signature = VALUES(signature),
                    pub_date = NOW(),
                    notes = VALUES(notes),
                    min_supported_version = VALUES(min_supported_version)',
                [$version, $channel, $target, $arch, $relPath, $filename, $size,
                 trim($signature), $notes, $floor, $adminId]
            );

            $row = $db->fetch(
                'SELECT * FROM playground_releases WHERE channel = ? AND version = ? AND target = ? AND arch = ?',
                [$channel, $version, $target, $arch]
            );
            if ($markLatest && $row) {
                setLatest($db, $row);
            }

            Logger::log('playground_releases_admin', $method, 'upload', $adminId,
                ['version' => $version, 'target' => $target, 'arch' => $arch],
                ['id' => $row['id'] ?? null], 200);
            jsonResponse(['success' => true, 'id' => (int)($row['id'] ?? 0)]);
            break;
        }

        case 'upload_mobile': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $body = jsonBody();

            $version  = trim($body['version'] ?? '');
            $target   = trim($body['target'] ?? '');
            $channel  = sanitizeChannel(trim($body['channel'] ?? 'stable'));
            $storeUrl = trim($body['store_url'] ?? '');
            $floor    = trim($body['min_supported_version'] ?? '0.0.0');
            $notes    = $body['notes'] ?? '';
            $markLatest = (bool)($body['mark_latest'] ?? true);

            if (!isSemver($version)) jsonResponse(['error' => 'version must be semver (x.y.z)'], 400);
            if (!in_array($target, ['android', 'ios'], true)) {
                jsonResponse(['error' => 'upload_mobile target must be android or ios'], 400);
            }
            if (!filter_var($storeUrl, FILTER_VALIDATE_URL)) {
                jsonResponse(['error' => 'store_url must be a valid URL'], 400);
            }
            if (!isSemver($floor)) jsonResponse(['error' => 'min_supported_version must be semver'], 400);

            $db->query(
                'INSERT INTO playground_releases
                    (version, channel, target, arch, store_url, pub_date, notes, min_supported_version, created_by)
                 VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    store_url = VALUES(store_url),
                    pub_date = NOW(),
                    notes = VALUES(notes),
                    min_supported_version = VALUES(min_supported_version)',
                [$version, $channel, $target, 'universal', $storeUrl, $notes, $floor, $adminId]
            );

            $row = $db->fetch(
                'SELECT * FROM playground_releases WHERE channel = ? AND version = ? AND target = ? AND arch = ?',
                [$channel, $version, $target, 'universal']
            );
            if ($markLatest && $row) {
                setLatest($db, $row);
            }

            Logger::log('playground_releases_admin', $method, 'upload_mobile', $adminId,
                ['version' => $version, 'target' => $target], ['id' => $row['id'] ?? null], 200);
            jsonResponse(['success' => true, 'id' => (int)($row['id'] ?? 0)]);
            break;
        }

        case 'set_latest': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $id = (int)(jsonBody()['id'] ?? 0);
            $row = $db->fetch('SELECT * FROM playground_releases WHERE id = ?', [$id]);
            if (!$row) jsonResponse(['error' => 'release not found'], 404);
            setLatest($db, $row);
            Logger::log('playground_releases_admin', $method, 'set_latest', $adminId,
                ['id' => $id], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;
        }

        case 'set_floor': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $body = jsonBody();
            $id = (int)($body['id'] ?? 0);
            $floor = trim($body['min_supported_version'] ?? '');
            if (!isSemver($floor)) jsonResponse(['error' => 'min_supported_version must be semver'], 400);
            $row = $db->fetch('SELECT id FROM playground_releases WHERE id = ?', [$id]);
            if (!$row) jsonResponse(['error' => 'release not found'], 404);
            $db->query('UPDATE playground_releases SET min_supported_version = ? WHERE id = ?',
                [$floor, $id]);
            Logger::log('playground_releases_admin', $method, 'set_floor', $adminId,
                ['id' => $id, 'floor' => $floor], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;
        }

        case 'update_notes': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $body = jsonBody();
            $id = (int)($body['id'] ?? 0);
            $row = $db->fetch('SELECT id FROM playground_releases WHERE id = ?', [$id]);
            if (!$row) jsonResponse(['error' => 'release not found'], 404);
            $db->query('UPDATE playground_releases SET notes = ? WHERE id = ?',
                [$body['notes'] ?? '', $id]);
            Logger::log('playground_releases_admin', $method, 'update_notes', $adminId,
                ['id' => $id], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;
        }

        case 'delete': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $id = (int)(jsonBody()['id'] ?? 0);
            $row = $db->fetch('SELECT * FROM playground_releases WHERE id = ?', [$id]);
            if (!$row) jsonResponse(['error' => 'release not found'], 404);

            // Delete the row first, then -- if it was the latest for its platform --
            // promote the next-newest remaining build of the same (target, arch) to
            // latest so self-update never loses its target. All atomic.
            $conn = $db->getConnection();
            $conn->beginTransaction();
            try {
                $db->query('DELETE FROM playground_releases WHERE id = ?', [$id]);
                $promoted = null;
                if ((int)$row['is_latest'] === 1) {
                    $next = $db->fetch(
                        'SELECT id, version FROM playground_releases
                         WHERE channel = ? AND target = ? AND arch = ?
                         ORDER BY created_at DESC, id DESC
                         LIMIT 1',
                        [$row['channel'], $row['target'], $row['arch']]
                    );
                    if ($next) {
                        $db->query('UPDATE playground_releases SET is_latest = 1 WHERE id = ?',
                            [$next['id']]);
                        $promoted = $next['version'];
                    }
                }
                $conn->commit();
            } catch (Throwable $e) {
                $conn->rollBack();
                throw $e;
            }

            // Remove the stored artifact (and its now-empty version dir) only after
            // the DB delete committed.
            if (!empty($row['artifact_path'])) {
                $abs = realpath($releasesRoot . '/' . str_replace('/', DIRECTORY_SEPARATOR, $row['artifact_path']));
                $rootReal = realpath($releasesRoot);
                if ($abs && $rootReal && strpos($abs, $rootReal) === 0 && is_file($abs)) {
                    @unlink($abs);
                    $dir = dirname($abs);
                    if ($dir !== $rootReal && is_dir($dir)
                        && count(array_diff(scandir($dir), ['.', '..'])) === 0) {
                        @rmdir($dir);
                    }
                }
            }
            Logger::log('playground_releases_admin', $method, 'delete', $adminId,
                ['id' => $id], ['success' => true, 'promoted_latest' => $promoted], 200);
            jsonResponse(['success' => true, 'promoted_latest' => $promoted]);
            break;
        }

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
