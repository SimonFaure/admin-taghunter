<?php
/**
 * Studio admin endpoint for managing playground app releases.
 *
 * Backs the "Releases" tab in the studio admin UI. Admin-only.
 *
 * Actions:
 *   - list          GET   : all releases, newest first.
 *   - upload        POST  : multipart -- desktop artifact + .sig signature file,
 *                           or (target=android) a signed .apk with no .sig: the
 *                           server records its SHA-256, which the tablet checks
 *                           before installing (memory project_android_operator_tablet).
 *                           Rejects a file whose version/arch contradict the form,
 *                           a wrong extension, and a .sig made for another file.
 *                           Stored under releases/<version>/<target>-<arch>-<rand>/.
 *   - upload_mobile POST  : JSON -- a mobile (android/ios) store-link release.
 *   - set_latest    POST  : JSON {id} -- mark a release latest for its platform.
 *   - set_floor     POST  : JSON {id, min_supported_version} -- raise the hard floor.
 *   - set_channel   POST  : JSON {id, channel} -- move a release to stable/test,
 *                                        re-electing "latest" on both channels.
 *   - update_notes  POST  : JSON {id, notes}.
 *   - update_branch POST  : JSON {id, git_branch} -- the git branch the build came
 *                                        from (also sent with upload). Display only.
 *   - delete        POST  : JSON {id} -- delete any release; if it was the latest,
 *                                        the next-newest build for its platform is
 *                                        promoted to latest automatically.
 *   - delete_bulk   POST  : JSON {ids: [..]} -- same as delete for many releases at
 *                                        once; promotion runs once per affected
 *                                        platform after every row is gone.
 *   - set_android_visible POST : JSON {visible} -- show/hide the Android release
 *                                        on the licensee Releases page.
 *   - download      GET   : ?id= -- streams any release's artifact, test channel
 *                                        included (admin token required).
 *
 * Claude Desktop extensions (.mcpb, admin only -- never in playground_releases,
 * whose public download serves any row):
 *   - extension_list     GET   : every uploaded extension, newest first.
 *   - extension_upload   POST  : multipart {artifact, version?, notes} -- name and
 *                                version are read from the bundle's manifest.json.
 *   - extension_download GET   : ?id= -- streams the file (admin token required).
 *   - extension_delete   POST  : JSON {id}.
 */

require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/PlaygroundReleaseSettings.php';

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

/**
 * Stream a stored artifact as an attachment, path-checked against the releases
 * root. Ends the request.
 */
function streamArtifact(string $releasesRoot, ?string $relPath, string $filename): void {
    $abs = $relPath ? realpath($releasesRoot . '/' . $relPath) : false;
    $rootReal = realpath($releasesRoot);
    if (!$abs || !$rootReal || strpos($abs, $rootReal) !== 0 || !is_file($abs)) {
        jsonResponse(['error' => 'file missing on the server'], 404);
    }
    $type = strtolower(pathinfo($filename, PATHINFO_EXTENSION)) === 'apk'
        ? 'application/vnd.android.package-archive'
        : 'application/octet-stream';
    header('Content-Type: ' . $type);
    header('Content-Length: ' . filesize($abs));
    header('Content-Disposition: attachment; filename="' . str_replace('"', '', $filename) . '"');
    header('X-Content-Type-Options: nosniff');
    readfile($abs);
    exit;
}

/**
 * The manifest.json of a .mcpb bundle (it is a zip). Null when the zip extension
 * is missing or the manifest can't be read.
 */
function readMcpbManifest(string $path): ?array {
    if (!class_exists('ZipArchive')) return null;
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) return null;
    $raw = $zip->getFromName('manifest.json');
    $zip->close();
    if ($raw === false) return null;
    $m = json_decode($raw, true);
    return is_array($m) ? $m : null;
}

function isSemver(string $v): bool {
    return (bool)preg_match('/^\d+\.\d+\.\d+$/', $v);
}

function sanitizeChannel(string $v): string {
    return in_array($v, CHANNELS, true) ? $v : 'stable';
}

/**
 * A git branch name from the form: null when empty, else it must look like a
 * branch ("main", "feat/custom-fonts"). Ends the request when it doesn't.
 */
function parseGitBranch($raw): ?string {
    $branch = trim((string)($raw ?? ''));
    if ($branch === '') return null;
    if (strlen($branch) > 100 || !preg_match('#^[A-Za-z0-9._/\-]+$#', $branch)
        || strpos($branch, '..') !== false || $branch[0] === '/' || $branch[0] === '-'
        || substr($branch, -1) === '/') {
        jsonResponse(['error' => "\"$branch\" is not a valid git branch name"], 400);
    }
    return $branch;
}

/**
 * Delete a release's stored artifact (and its dirs once empty). Path-checked
 * against the releases root so a bad DB value can never reach outside it. Call only
 * after the DB delete has committed. With $db, the file is kept while any
 * playground_releases row still points at it: before uploads got a dir of their
 * own, the same build sent to two channels (or with two archs) shared one file,
 * and deleting one row used to break the other's download.
 */
function removeArtifactFile(string $releasesRoot, ?string $relPath, ?Database $db = null): void {
    if (empty($relPath)) return;
    if ($db) {
        $refs = $db->fetch('SELECT COUNT(*) AS n FROM playground_releases WHERE artifact_path = ?', [$relPath]);
        if ((int)($refs['n'] ?? 0) > 0) return;
    }
    $abs = realpath($releasesRoot . '/' . str_replace('/', DIRECTORY_SEPARATOR, $relPath));
    $rootReal = realpath($releasesRoot);
    if (!$abs || !$rootReal || strpos($abs, $rootReal) !== 0 || !is_file($abs)) return;
    @unlink($abs);
    $dir = dirname($abs);
    while ($dir !== $rootReal && strpos($dir, $rootReal) === 0 && is_dir($dir)
        && count(array_diff(scandir($dir), ['.', '..'])) === 0) {
        @rmdir($dir);
        $dir = dirname($dir);
    }
}

/** Readable message for a failed $_FILES entry ("artifact file is required" hid the real cause). */
function uploadErrorMessage(string $what, ?array $file): string {
    $code = $file['error'] ?? UPLOAD_ERR_NO_FILE;
    switch ($code) {
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            return "$what is larger than the server limit (upload_max_filesize = "
                . ini_get('upload_max_filesize') . ')';
        case UPLOAD_ERR_PARTIAL:
            return "$what upload was interrupted -- try again";
        case UPLOAD_ERR_NO_FILE:
            return "$what is required";
        default:
            return "the server could not receive the $what (PHP upload error $code)";
    }
}

// Tauri updater public key: a copy of plugins.updater.pubkey in
// taghunter_playground/src-tauri/tauri.conf.json. Keep the two in sync.
const UPDATER_PUBKEY = 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEIxNUZFMzYxODNGMTc2QTEKUldTaGR2R0RZZU5mc2JsNkF6K2lpVDVKSkJTM3B1UUpxM3ZFS21SRDhOTUNvaTdRV1JCdUxKUHoK';

// Updater bundles per desktop target (Tauri 2 with createUpdaterArtifacts; the
// .zip forms are the v1-compatible ones).
const DESKTOP_EXTENSIONS = [
    'windows' => ['-setup.exe', '.exe', '.msi', '.nsis.zip', '.msi.zip'],
    'darwin'  => ['.app.tar.gz'],
    'linux'   => ['.appimage', '.appimage.tar.gz', '.deb', '.rpm'],
];

/**
 * Parse a Tauri .sig (base64 of a minisign signature file). Null when it isn't one.
 * 'file' is the signed artifact's name from the trusted comment
 * ("timestamp:<n>\tfile:<name>"; the name may contain spaces).
 */
function parseMinisignSig(string $b64): ?array {
    $text = base64_decode(trim($b64), true);
    if ($text === false) return null;
    $lines = preg_split('/\r?\n/', trim($text));
    $prefix = 'trusted comment: ';
    if (count($lines) < 4 || strpos($lines[2], $prefix) !== 0) return null;
    $bin = base64_decode(trim($lines[1]), true);
    $global = base64_decode(trim($lines[3]), true);
    if ($bin === false || strlen($bin) !== 74 || $global === false || strlen($global) !== 64) return null;
    $alg = substr($bin, 0, 2);
    if ($alg !== 'ED' && $alg !== 'Ed') return null;
    $trusted = substr($lines[2], strlen($prefix));
    return [
        'alg'     => $alg,
        'keynum'  => substr($bin, 2, 8),
        'sig'     => substr($bin, 10, 64),
        'trusted' => $trusted,
        'global'  => $global,
        'file'    => preg_match('/(?:^|\t)file:([^\t]+)/', $trusted, $m) ? trim($m[1]) : null,
    ];
}

/**
 * Verify a parsed minisign signature over a file with the updater key -- the
 * check the playground's updater runs before installing. Returns null when it
 * can't be checked here (no ext-sodium), else an error message or '' when valid.
 */
function verifyMinisign(string $path, array $sig, string $pubkeyB64): ?string {
    if (!function_exists('sodium_crypto_sign_verify_detached')) return null;
    $pkLines = preg_split('/\r?\n/', trim((string)base64_decode($pubkeyB64, true)));
    $pkBin = base64_decode(trim($pkLines[1] ?? ''), true);
    if ($pkBin === false || strlen($pkBin) !== 42) return null;
    if (substr($pkBin, 2, 8) !== $sig['keynum']) {
        return 'the .sig was made with a different signing key than the playground updater trusts';
    }
    $pk = substr($pkBin, 10, 32);
    if ($sig['alg'] === 'ED') {
        // Prehashed: the signature covers the file's BLAKE2b-512.
        $state = sodium_crypto_generichash_init('', SODIUM_CRYPTO_GENERICHASH_BYTES_MAX);
        $fh = fopen($path, 'rb');
        if (!$fh) return null;
        while (!feof($fh)) {
            sodium_crypto_generichash_update($state, (string)fread($fh, 1 << 20));
        }
        fclose($fh);
        $message = sodium_crypto_generichash_final($state, SODIUM_CRYPTO_GENERICHASH_BYTES_MAX);
    } else {
        $message = file_get_contents($path);
    }
    if (!sodium_crypto_sign_verify_detached($sig['sig'], $message, $pk)
        || !sodium_crypto_sign_verify_detached($sig['global'], $sig['sig'] . $sig['trusted'], $pk)) {
        return 'the .sig does not match this file (the updater would refuse it)';
    }
    return '';
}

/** First x.y.z in a filename, or null. */
function versionFromFilename(string $name): ?string {
    return preg_match('/\d+\.\d+\.\d+/', $name, $m) ? $m[0] : null;
}

/** The arch a build's filename names (x64 / arm64 / universal...), or null when it names none. */
function archFromFilename(string $name): ?string {
    $n = strtolower($name);
    $token = fn(string $alts) => (bool)preg_match('/(?<![a-z0-9])(' . $alts . ')(?![a-z0-9])/', $n);
    if ($token('x64|x86_64|amd64')) return 'x86_64';
    if ($token('arm64|aarch64')) return 'aarch64';
    if ($token('universal')) return 'universal';
    return null;
}

/**
 * For each (channel, target, arch) group in $groups, mark the newest remaining
 * release latest. Used after deletes that removed the group's latest row.
 * Returns the promoted versions, labelled by platform. Runs inside the caller's
 * transaction.
 */
function promoteLatestForGroups(Database $db, array $groups): array {
    $promoted = [];
    foreach ($groups as [$channel, $target, $arch]) {
        $next = $db->fetch(
            'SELECT id, version FROM playground_releases
             WHERE channel = ? AND target = ? AND arch = ?
             ORDER BY created_at DESC, id DESC
             LIMIT 1',
            [$channel, $target, $arch]
        );
        if (!$next) continue;
        $db->query('UPDATE playground_releases SET is_latest = 1 WHERE id = ?', [$next['id']]);
        $promoted[] = "{$next['version']} ($target/$arch)";
    }
    return $promoted;
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
        && in_array($action, ['upload', 'extension_upload'], true)) {
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
                'SELECT id, version, channel, git_branch, target, arch, artifact_path, artifact_filename,
                        artifact_size, store_url, pub_date, notes, min_supported_version, is_latest, created_at
                 FROM playground_releases
                 ORDER BY created_at DESC, id DESC'
            );
            $rootReal = realpath($releasesRoot);
            foreach ($rows as &$r) {
                $r['is_latest'] = (bool)$r['is_latest'];
                $r['has_signature'] = !empty($r['artifact_filename']);
                // A row whose file is gone downloads as a 404: flag it so it can
                // be re-uploaded. Null for store links (no file).
                if (empty($r['artifact_path'])) {
                    $r['file_exists'] = null;
                } else {
                    $abs = realpath($releasesRoot . '/' . $r['artifact_path']);
                    $r['file_exists'] = $abs && $rootReal && strpos($abs, $rootReal) === 0 && is_file($abs);
                }
                unset($r['artifact_path']);
            }
            unset($r);
            jsonResponse([
                'releases' => $rows,
                'android_visible_to_clients' => PlaygroundReleaseSettings::androidVisibleToClients($db),
            ]);
            break;
        }

        case 'set_android_visible': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $visible = (bool)(jsonBody()['visible'] ?? false);
            PlaygroundReleaseSettings::setAndroidVisibleToClients($db, $visible, $adminId);
            Logger::log('playground_releases_admin', $method, 'set_android_visible', $adminId,
                ['visible' => $visible], ['success' => true], 200);
            jsonResponse(['success' => true, 'android_visible_to_clients' => $visible]);
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
            $branch  = parseGitBranch($_POST['git_branch'] ?? '');
            $markLatest = filter_var($_POST['mark_latest'] ?? 'true', FILTER_VALIDATE_BOOLEAN);

            $isApk = $target === 'android';
            if ($isApk) $arch = 'universal'; // one APK carries every ABI

            if (!isSemver($version)) jsonResponse(['error' => 'version must be semver (x.y.z)'], 400);
            if (!in_array($target, ['windows', 'darwin', 'linux', 'android'], true)) {
                jsonResponse(['error' => 'upload is for desktop targets or an android APK'], 400);
            }
            if (!in_array($arch, ARCHS, true)) jsonResponse(['error' => 'invalid arch'], 400);
            if (!isSemver($floor)) jsonResponse(['error' => 'min_supported_version must be semver'], 400);

            if (($_FILES['artifact']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                jsonResponse(['error' => uploadErrorMessage('artifact file', $_FILES['artifact'] ?? null)], 400);
            }
            if (!$isApk && ($_FILES['signature']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
                jsonResponse(['error' => uploadErrorMessage('signature (.sig) file', $_FILES['signature'] ?? null)], 400);
            }

            // Sanitize the artifact filename.
            $rawName = basename($_FILES['artifact']['name']);
            $filename = preg_replace('/[^A-Za-z0-9._\-]/', '_', $rawName);
            if ($filename === '' || $filename[0] === '.') {
                jsonResponse(['error' => 'invalid artifact filename'], 400);
            }

            // The filename must agree with what was typed in the form: the
            // version field is auto-filled once and survives swapping the file.
            $fileVersion = versionFromFilename($rawName);
            if ($fileVersion !== null && $fileVersion !== $version) {
                jsonResponse(['error' => "the file is version $fileVersion but the form says $version"], 400);
            }
            $fileArch = $isApk ? null : archFromFilename($rawName);
            if ($fileArch !== null && $fileArch !== $arch) {
                jsonResponse(['error' => "the file is a $fileArch build but the form says $arch"], 400);
            }

            $signature = null;
            $sha256 = null;
            if ($isApk) {
                // An APK is a zip: reject anything else before it reaches tablets.
                $fh = fopen($_FILES['artifact']['tmp_name'], 'rb');
                $magic = $fh ? fread($fh, 2) : '';
                if ($fh) fclose($fh);
                if (strtolower(pathinfo($filename, PATHINFO_EXTENSION)) !== 'apk' || $magic !== 'PK') {
                    jsonResponse(['error' => 'android upload must be a .apk file'], 400);
                }
                $sha256 = hash_file('sha256', $_FILES['artifact']['tmp_name']);
            } else {
                $lowerName = strtolower($rawName);
                $okExt = false;
                foreach (DESKTOP_EXTENSIONS[$target] as $ext) {
                    if (substr($lowerName, -strlen($ext)) === $ext) $okExt = true;
                }
                if (!$okExt || substr($lowerName, -4) === '.sig') {
                    jsonResponse(['error' => "a $target artifact must end in "
                        . implode(', ', array_unique(DESKTOP_EXTENSIONS[$target]))
                        . " -- \"$rawName\" is not an updater bundle"], 400);
                }

                $signature = file_get_contents($_FILES['signature']['tmp_name']);
                if ($signature === false || trim($signature) === '') {
                    jsonResponse(['error' => 'could not read signature file'], 400);
                }
                $signature = trim($signature);

                // The .sig must be the one Tauri wrote next to THIS artifact.
                $parsedSig = parseMinisignSig($signature);
                if (!$parsedSig) {
                    jsonResponse(['error' => 'the signature file is not a Tauri .sig'], 400);
                }
                if ($parsedSig['file'] !== null && $parsedSig['file'] !== $rawName) {
                    jsonResponse(['error' => "the .sig was made for \"{$parsedSig['file']}\", not for \"$rawName\""
                        . ' -- pick the .sig next to this installer'], 400);
                }
                $sigError = verifyMinisign($_FILES['artifact']['tmp_name'], $parsedSig, UPDATER_PUBKEY);
                if ($sigError) {
                    jsonResponse(['error' => $sigError], 400);
                }
            }

            // Every upload gets a dir of its own, so no two rows can ever share
            // a file (deleting one used to break the other's download). The
            // channel is left out of the path: set_channel moves rows, not files.
            $relDir = $version . '/' . $target . '-' . $arch . '-' . bin2hex(random_bytes(4));
            $destDir = $releasesRoot . '/' . $relDir;
            if (!is_dir($destDir) && !mkdir($destDir, 0775, true) && !is_dir($destDir)) {
                jsonResponse(['error' => 'failed to create release directory'], 500);
            }
            $destPath = $destDir . '/' . $filename;
            $expectedSize = (int)$_FILES['artifact']['size'];
            if (!move_uploaded_file($_FILES['artifact']['tmp_name'], $destPath)) {
                jsonResponse(['error' => 'failed to store artifact'], 500);
            }
            clearstatcache(true, $destPath);
            $size = filesize($destPath);
            if ($size !== $expectedSize) {
                removeArtifactFile($releasesRoot, $relDir . '/' . $filename);
                jsonResponse(['error' => "the stored file is $size bytes instead of $expectedSize -- upload again"], 500);
            }

            $relPath = $relDir . '/' . $filename;

            // A re-upload of the same (channel, version, target, arch) replaces
            // the row: its previous file is dropped below once nothing uses it.
            $previous = $db->fetch(
                'SELECT artifact_path FROM playground_releases
                 WHERE channel = ? AND version = ? AND target = ? AND arch = ?',
                [$channel, $version, $target, $arch]
            );

            // UPSERT on (channel, version, target, arch).
            $db->query(
                'INSERT INTO playground_releases
                    (version, channel, git_branch, target, arch, artifact_path, artifact_filename,
                     artifact_size, signature, artifact_sha256, pub_date, notes, min_supported_version,
                     created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    git_branch = VALUES(git_branch),
                    artifact_path = VALUES(artifact_path),
                    artifact_filename = VALUES(artifact_filename),
                    artifact_size = VALUES(artifact_size),
                    signature = VALUES(signature),
                    artifact_sha256 = VALUES(artifact_sha256),
                    pub_date = NOW(),
                    notes = VALUES(notes),
                    min_supported_version = VALUES(min_supported_version)',
                [$version, $channel, $branch, $target, $arch, $relPath, $filename, $size,
                 $signature, $sha256, $notes, $floor, $adminId]
            );
            if ($previous && !empty($previous['artifact_path']) && $previous['artifact_path'] !== $relPath) {
                removeArtifactFile($releasesRoot, $previous['artifact_path'], $db);
            }

            $row = $db->fetch(
                'SELECT * FROM playground_releases WHERE channel = ? AND version = ? AND target = ? AND arch = ?',
                [$channel, $version, $target, $arch]
            );
            if ($markLatest && $row) {
                setLatest($db, $row);
            }

            Logger::log('playground_releases_admin', $method, 'upload', $adminId,
                ['version' => $version, 'target' => $target, 'arch' => $arch, 'git_branch' => $branch],
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

        case 'set_channel': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $body = jsonBody();
            $id = (int)($body['id'] ?? 0);
            $channel = trim($body['channel'] ?? '');
            if (!in_array($channel, CHANNELS, true)) jsonResponse(['error' => 'invalid channel'], 400);
            $row = $db->fetch('SELECT * FROM playground_releases WHERE id = ?', [$id]);
            if (!$row) jsonResponse(['error' => 'release not found'], 404);
            $oldChannel = $row['channel'] ?? 'stable';
            if ($oldChannel === $channel) jsonResponse(['success' => true, 'unchanged' => true]);

            // The unique key is (channel, version, target, arch): the same build
            // can't exist twice in one channel.
            $clash = $db->fetch(
                'SELECT id FROM playground_releases
                 WHERE channel = ? AND version = ? AND target = ? AND arch = ? AND id <> ?',
                [$channel, $row['version'], $row['target'], $row['arch'], $id]
            );
            if ($clash) {
                jsonResponse(['error' => "{$row['version']} ({$row['target']}/{$row['arch']}) "
                    . "already exists in the $channel channel -- delete that one first"], 409);
            }

            // Move the row, then fix "latest" on both sides: the old channel gets
            // its next-newest build promoted if this was its latest; in the new
            // channel this build becomes latest only if it is newer than the
            // current latest there (or there is none) -- so promoting a test build
            // to stable ships it, while demoting an old build never hijacks test.
            $conn = $db->getConnection();
            $conn->beginTransaction();
            try {
                $db->query('UPDATE playground_releases SET channel = ?, is_latest = 0 WHERE id = ?',
                    [$channel, $id]);
                $promotedOld = (int)$row['is_latest'] === 1
                    ? (promoteLatestForGroups($db, [[$oldChannel, $row['target'], $row['arch']]])[0] ?? null)
                    : null;

                $current = $db->fetch(
                    'SELECT version FROM playground_releases
                     WHERE channel = ? AND target = ? AND arch = ? AND is_latest = 1
                     LIMIT 1',
                    [$channel, $row['target'], $row['arch']]
                );
                $becameLatest = !$current || version_compare($row['version'], $current['version'], '>');
                $conn->commit();
            } catch (Throwable $e) {
                $conn->rollBack();
                throw $e;
            }
            if ($becameLatest) {
                setLatest($db, array_merge($row, ['channel' => $channel]));
            }

            Logger::log('playground_releases_admin', $method, 'set_channel', $adminId,
                ['id' => $id, 'from' => $oldChannel, 'to' => $channel],
                ['success' => true, 'became_latest' => $becameLatest, 'promoted_latest' => $promotedOld], 200);
            jsonResponse(['success' => true, 'became_latest' => $becameLatest,
                'promoted_latest' => $promotedOld]);
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

        case 'update_branch': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $body = jsonBody();
            $id = (int)($body['id'] ?? 0);
            $branch = parseGitBranch($body['git_branch'] ?? '');
            $row = $db->fetch('SELECT id FROM playground_releases WHERE id = ?', [$id]);
            if (!$row) jsonResponse(['error' => 'release not found'], 404);
            $db->query('UPDATE playground_releases SET git_branch = ? WHERE id = ?', [$branch, $id]);
            Logger::log('playground_releases_admin', $method, 'update_branch', $adminId,
                ['id' => $id, 'git_branch' => $branch], ['success' => true], 200);
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
                $groups = (int)$row['is_latest'] === 1
                    ? [[$row['channel'] ?? 'stable', $row['target'], $row['arch']]]
                    : [];
                $promoted = promoteLatestForGroups($db, $groups)[0] ?? null;
                $conn->commit();
            } catch (Throwable $e) {
                $conn->rollBack();
                throw $e;
            }

            // Remove the stored artifact (and its now-empty version dir) only after
            // the DB delete committed.
            removeArtifactFile($releasesRoot, $row['artifact_path'] ?? null, $db);

            Logger::log('playground_releases_admin', $method, 'delete', $adminId,
                ['id' => $id], ['success' => true, 'promoted_latest' => $promoted], 200);
            jsonResponse(['success' => true, 'promoted_latest' => $promoted]);
            break;
        }

        case 'delete_bulk': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $ids = array_values(array_unique(array_filter(
                array_map('intval', (array)(jsonBody()['ids'] ?? [])),
                fn($id) => $id > 0
            )));
            if (!$ids) jsonResponse(['error' => 'ids must be a non-empty array'], 400);
            if (count($ids) > 500) jsonResponse(['error' => 'too many ids (max 500)'], 400);

            $ph = implode(',', array_fill(0, count($ids), '?'));
            $rows = $db->fetchAll("SELECT * FROM playground_releases WHERE id IN ($ph)", $ids);
            if (!$rows) jsonResponse(['error' => 'no matching releases'], 404);

            // Delete every row first, then promote a replacement latest once per
            // affected platform -- doing it per-row would promote builds that are
            // themselves about to be deleted.
            $conn = $db->getConnection();
            $conn->beginTransaction();
            try {
                $found = array_map('intval', array_column($rows, 'id'));
                $foundPh = implode(',', array_fill(0, count($found), '?'));
                $db->query("DELETE FROM playground_releases WHERE id IN ($foundPh)", $found);

                $groups = [];
                foreach ($rows as $r) {
                    if ((int)$r['is_latest'] !== 1) continue;
                    $channel = $r['channel'] ?? 'stable';
                    $groups["$channel|{$r['target']}|{$r['arch']}"] =
                        [$channel, $r['target'], $r['arch']];
                }
                $promoted = promoteLatestForGroups($db, $groups);
                $conn->commit();
            } catch (Throwable $e) {
                $conn->rollBack();
                throw $e;
            }

            foreach ($rows as $r) {
                removeArtifactFile($releasesRoot, $r['artifact_path'] ?? null, $db);
            }

            $deleted = count($rows);
            Logger::log('playground_releases_admin', $method, 'delete_bulk', $adminId,
                ['ids' => $ids], ['success' => true, 'deleted' => $deleted,
                 'promoted_latest' => $promoted], 200);
            jsonResponse(['success' => true, 'deleted' => $deleted, 'promoted_latest' => $promoted]);
            break;
        }

        case 'extension_list': {
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            $rows = $db->fetchAll(
                'SELECT id, name, version, artifact_filename, artifact_size, artifact_sha256,
                        notes, created_at
                 FROM playground_extension_releases
                 ORDER BY created_at DESC, id DESC'
            );
            jsonResponse(['extensions' => $rows]);
            break;
        }

        case 'extension_upload': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            if (!isset($_FILES['artifact']) || $_FILES['artifact']['error'] !== UPLOAD_ERR_OK) {
                jsonResponse(['error' => 'artifact file is required'], 400);
            }
            $tmp = $_FILES['artifact']['tmp_name'];
            $rawName = basename($_FILES['artifact']['name']);
            $filename = preg_replace('/[^A-Za-z0-9._\-]/', '_', $rawName);
            $fh = fopen($tmp, 'rb');
            $magic = $fh ? fread($fh, 2) : '';
            if ($fh) fclose($fh);
            if ($filename === '' || $filename[0] === '.'
                || strtolower(pathinfo($filename, PATHINFO_EXTENSION)) !== 'mcpb' || $magic !== 'PK') {
                jsonResponse(['error' => 'upload a .mcpb file (Claude Desktop extension)'], 400);
            }

            $manifest = readMcpbManifest($tmp);
            $name = trim((string)($manifest['name'] ?? ''));
            if ($name === '') $name = pathinfo($filename, PATHINFO_FILENAME);
            $name = substr(preg_replace('/[^A-Za-z0-9._\-]/', '_', $name), 0, 64);
            $version = trim((string)($_POST['version'] ?? ''));
            if ($version === '') $version = trim((string)($manifest['version'] ?? ''));
            if (!isSemver($version)) {
                jsonResponse(['error' => 'version must be semver (x.y.z): the manifest has none, enter one'], 400);
            }
            $notes = $_POST['notes'] ?? '';
            $sha256 = hash_file('sha256', $tmp);

            $relDir = 'extensions/' . $version;
            $destDir = $releasesRoot . '/' . $relDir;
            if (!is_dir($destDir) && !mkdir($destDir, 0775, true) && !is_dir($destDir)) {
                jsonResponse(['error' => 'failed to create the extension directory'], 500);
            }
            $destPath = $destDir . '/' . $filename;
            if (!move_uploaded_file($tmp, $destPath)) {
                jsonResponse(['error' => 'failed to store the extension'], 500);
            }
            $relPath = $relDir . '/' . $filename;

            // Same name + version uploaded again: replace it (drop the old file if renamed).
            $old = $db->fetch(
                'SELECT artifact_path FROM playground_extension_releases WHERE name = ? AND version = ?',
                [$name, $version]
            );
            $db->query(
                'INSERT INTO playground_extension_releases
                    (name, version, artifact_path, artifact_filename, artifact_size, artifact_sha256,
                     notes, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    artifact_path = VALUES(artifact_path),
                    artifact_filename = VALUES(artifact_filename),
                    artifact_size = VALUES(artifact_size),
                    artifact_sha256 = VALUES(artifact_sha256),
                    notes = VALUES(notes),
                    created_by = VALUES(created_by),
                    created_at = CURRENT_TIMESTAMP',
                [$name, $version, $relPath, $filename, filesize($destPath), $sha256, $notes, $adminId]
            );
            if ($old && $old['artifact_path'] !== $relPath) {
                removeArtifactFile($releasesRoot, $old['artifact_path']);
            }
            $row = $db->fetch(
                'SELECT id FROM playground_extension_releases WHERE name = ? AND version = ?',
                [$name, $version]
            );
            Logger::log('playground_releases_admin', $method, 'extension_upload', $adminId,
                ['name' => $name, 'version' => $version], ['id' => $row['id'] ?? null], 200);
            jsonResponse(['success' => true, 'id' => (int)($row['id'] ?? 0), 'name' => $name, 'version' => $version]);
            break;
        }

        case 'extension_download': {
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            $id = (int)($_GET['id'] ?? 0);
            $row = $db->fetch(
                'SELECT artifact_path, artifact_filename FROM playground_extension_releases WHERE id = ?',
                [$id]
            );
            if (!$row) jsonResponse(['error' => 'extension not found'], 404);
            Logger::log('playground_releases_admin', $method, 'extension_download', $adminId,
                ['id' => $id], ['success' => true], 200);
            streamArtifact($releasesRoot, $row['artifact_path'], $row['artifact_filename']);
        }

        case 'download': {
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            $id = (int)($_GET['id'] ?? 0);
            $row = $db->fetch(
                'SELECT artifact_path, artifact_filename FROM playground_releases WHERE id = ?',
                [$id]
            );
            if (!$row) jsonResponse(['error' => 'release not found'], 404);
            if (empty($row['artifact_path']) || empty($row['artifact_filename'])) {
                jsonResponse(['error' => 'this release is a store link, not a file'], 400);
            }
            Logger::log('playground_releases_admin', $method, 'download', $adminId,
                ['id' => $id], ['success' => true], 200);
            streamArtifact($releasesRoot, $row['artifact_path'], $row['artifact_filename']);
        }

        case 'extension_delete': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $id = (int)(jsonBody()['id'] ?? 0);
            $row = $db->fetch('SELECT * FROM playground_extension_releases WHERE id = ?', [$id]);
            if (!$row) jsonResponse(['error' => 'extension not found'], 404);
            $db->query('DELETE FROM playground_extension_releases WHERE id = ?', [$id]);
            removeArtifactFile($releasesRoot, $row['artifact_path']);
            Logger::log('playground_releases_admin', $method, 'extension_delete', $adminId,
                ['id' => $id, 'name' => $row['name'], 'version' => $row['version']], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;
        }

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
