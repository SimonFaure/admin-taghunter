<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/RecoveryCodes.php';
require_once __DIR__ . '/../utils/TokenManager.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

// Token takes precedence; the session is only a fallback. The studio is
// token-based (secure_auth.php sets no PHP session), so without bridging the
// X-Auth-Token here this endpoint 401s unless a sibling endpoint happened to
// set the session first. Mirrors scenarios.php::requireAuth().
function requireAuth() {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        if (strpos($header, 'Bearer ') === 0) {
            $header = substr($header, 7);
        }
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
        if ($tokenData) {
            // Overwrite any stale session with the authoritative token values.
            $_SESSION['user_id'] = $tokenData['user_id'];
            $_SESSION['user_type'] = $tokenData['user_type'];
            return $tokenData['user_id'];
        }
    }

    if (isset($_SESSION['user_id']) && isset($_SESSION['user_type'])) {
        return $_SESSION['user_id'];
    }

    jsonResponse(['error' => 'Unauthorized'], 401);
}

function formatClientData($client) {
    if (!$client) return $client;

    if (isset($client['billing_up_to_date'])) {
        $client['billing_up_to_date'] = (bool)$client['billing_up_to_date'];
    }

    return $client;
}

// The client UI language is constrained to the studio/playground chrome set.
// Anything else collapses to the default so a bad value can never strand a
// client on an untranslated surface. Design: project_client_language.
const CLIENT_LANGUAGES = ['fr', 'en', 'es'];
function sanitizeLanguage($value) {
    return in_array($value, CLIENT_LANGUAGES, true) ? $value : 'fr';
}

// The app-update channel a client (and, unless overridden, its devices) pulls
// builds from. A bad value collapses to 'stable' so a typo can never strand a
// client on a non-existent track. Design: project_client_tester_update_channel.
const UPDATE_CHANNELS = ['stable', 'test'];
function sanitizeChannel($value) {
    return in_array($value, UPDATE_CHANNELS, true) ? $value : 'stable';
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'list', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();

            $clients = $db->fetchAll(
                'SELECT * FROM clients ORDER BY created_at DESC'
            );

            $clients = array_map('formatClientData', $clients);

            $response = ['data' => $clients];
            Logger::log('clients', 'GET', 'list', $userId, [], $response, 200);
            jsonResponse($response);
            break;

        case 'get':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'get', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();

            $id = $_GET['id'] ?? '';
            if (empty($id)) {
                $response = ['error' => 'Client ID is required'];
                Logger::log('clients', 'GET', 'get', $userId, ['id' => ''], $response, 400);
                jsonResponse($response, 400);
            }

            $client = $db->fetch(
                'SELECT * FROM clients WHERE id = ?',
                [$id]
            );

            if (!$client) {
                $response = ['error' => 'Client not found'];
                Logger::log('clients', 'GET', 'get', $userId, ['id' => $id], $response, 404);
                jsonResponse($response, 404);
            }

            $client = formatClientData($client);

            $response = ['data' => $client];
            Logger::log('clients', 'GET', 'get', $userId, ['id' => $id], $response, 200);
            jsonResponse($response);
            break;

        case 'create':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'create', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();
            $data = getRequestData();

            $requiredFields = ['email', 'name'];
            foreach ($requiredFields as $field) {
                if (empty($data[$field])) {
                    $response = ['error' => ucfirst($field) . ' is required'];
                    Logger::log('clients', 'POST', 'create', $userId, $data, $response, 400);
                    jsonResponse($response, 400);
                }
            }

            $existingClient = $db->fetch(
                'SELECT id FROM clients WHERE email = ?',
                [$data['email']]
            );

            if ($existingClient) {
                $response = ['error' => 'A client with this email already exists'];
                Logger::log('clients', 'POST', 'create', $userId, $data, $response, 400);
                jsonResponse($response, 400);
            }

            $fields = [
                'email' => $data['email'],
                'name' => $data['name'],
                'company' => $data['company'] ?? null,
                'phone' => $data['phone'] ?? null,
                'notes' => $data['notes'] ?? null,
                'avatar_url' => $data['avatar_url'] ?? null,
                'license_type' => $data['license_type'] ?? 'access',
                'billing_up_to_date' => (isset($data['billing_up_to_date']) ? $data['billing_up_to_date'] : true) ? 1 : 0,
                'language' => sanitizeLanguage($data['language'] ?? 'fr'),
                'update_channel' => sanitizeChannel($data['update_channel'] ?? 'stable'),
                'created_by' => $userId,
            ];

            // Hash password if provided
            if (!empty($data['password'])) {
                $fields['password_hash'] = password_hash($data['password'], PASSWORD_DEFAULT);
            }

            $placeholders = array_fill(0, count($fields), '?');
            $columns = implode(', ', array_keys($fields));
            $values = array_values($fields);

            $sql = "INSERT INTO clients ($columns) VALUES (" . implode(', ', $placeholders) . ")";
            $clientId = $db->execute($sql, $values);

            // Issue an offline PIN-recovery pool for the new client so their
            // devices sync codes from day one. Best-effort: a failure here must
            // never block client creation (it self-heals on first pool view).
            try {
                RecoveryCodes::ensureForClient($db, (int)$clientId);
            } catch (Exception $e) {
                error_log('[clients.create] recovery codes provisioning failed: ' . $e->getMessage());
            }

            $client = $db->fetch(
                'SELECT * FROM clients WHERE id = ?',
                [$clientId]
            );

            $client = formatClientData($client);

            $response = ['data' => $client];
            Logger::log('clients', 'POST', 'create', $userId, $data, $response, 200);
            jsonResponse($response);
            break;

        case 'update':
            if ($_SERVER['REQUEST_METHOD'] !== 'PUT') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'update', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();
            $data = getRequestData();

            $id = $data['id'] ?? '';
            if (empty($id)) {
                $response = ['error' => 'Client ID is required'];
                Logger::log('clients', 'PUT', 'update', $userId, $data, $response, 400);
                jsonResponse($response, 400);
            }

            $existingClient = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$id]
            );

            if (!$existingClient) {
                $response = ['error' => 'Client not found'];
                Logger::log('clients', 'PUT', 'update', $userId, $data, $response, 404);
                jsonResponse($response, 404);
            }

            $updates = [];
            $values = [];

            $allowedFields = ['email', 'name', 'company', 'phone', 'notes', 'avatar_url', 'license_type', 'billing_up_to_date', 'language', 'update_channel', 'playground_version', 'creator_version'];
            foreach ($allowedFields as $field) {
                if (array_key_exists($field, $data)) {
                    $updates[] = "$field = ?";
                    $value = $data[$field];
                    if ($field === 'billing_up_to_date') {
                        $value = $value ? 1 : 0;
                    } elseif ($field === 'language') {
                        $value = sanitizeLanguage($value);
                    } elseif ($field === 'update_channel') {
                        $value = sanitizeChannel($value);
                    }
                    $values[] = $value;
                }
            }

            if (empty($updates)) {
                $response = ['error' => 'No fields to update'];
                Logger::log('clients', 'PUT', 'update', $userId, $data, $response, 400);
                jsonResponse($response, 400);
            }

            $values[] = $id;
            $sql = "UPDATE clients SET " . implode(', ', $updates) . " WHERE id = ?";
            $db->execute($sql, $values);

            $client = $db->fetch(
                'SELECT * FROM clients WHERE id = ?',
                [$id]
            );

            $client = formatClientData($client);

            $response = ['data' => $client];
            Logger::log('clients', 'PUT', 'update', $userId, $data, $response, 200);
            jsonResponse($response);
            break;

        case 'delete':
            if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'delete', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();

            $id = $_GET['id'] ?? '';
            if (empty($id)) {
                $response = ['error' => 'Client ID is required'];
                Logger::log('clients', 'DELETE', 'delete', $userId, ['id' => ''], $response, 400);
                jsonResponse($response, 400);
            }

            $existingClient = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$id]
            );

            if (!$existingClient) {
                $response = ['error' => 'Client not found'];
                Logger::log('clients', 'DELETE', 'delete', $userId, ['id' => $id], $response, 404);
                jsonResponse($response, 404);
            }

            $db->execute(
                'DELETE FROM clients WHERE id = ?',
                [$id]
            );

            $response = ['message' => 'Client deleted successfully'];
            Logger::log('clients', 'DELETE', 'delete', $userId, ['id' => $id], $response, 200);
            jsonResponse($response);
            break;

        case 'upload_avatar':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'upload_avatar', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();

            $clientId = $_POST['client_id'] ?? '';
            if (empty($clientId)) {
                $response = ['error' => 'Client ID is required'];
                Logger::log('clients', 'POST', 'upload_avatar', $userId, [], $response, 400);
                jsonResponse($response, 400);
            }

            $existingClient = $db->fetch(
                'SELECT id, avatar_url FROM clients WHERE id = ?',
                [$clientId]
            );

            if (!$existingClient) {
                $response = ['error' => 'Client not found'];
                Logger::log('clients', 'POST', 'upload_avatar', $userId, ['client_id' => $clientId], $response, 404);
                jsonResponse($response, 404);
            }

            if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
                $errorMsg = isset($_FILES['avatar']) ? 'Upload error: ' . $_FILES['avatar']['error'] : 'No file uploaded';
                $response = ['error' => $errorMsg];
                Logger::log('clients', 'POST', 'upload_avatar', $userId, ['client_id' => $clientId], $response, 400);
                jsonResponse($response, 400);
            }

            $file = $_FILES['avatar'];

            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mimeType = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);

            $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!in_array($mimeType, $allowedTypes)) {
                $response = ['error' => 'Only image files are allowed (JPEG, PNG, GIF, WebP)'];
                Logger::log('clients', 'POST', 'upload_avatar', $userId, ['client_id' => $clientId], $response, 400);
                jsonResponse($response, 400);
            }

            if ($file['size'] > 2 * 1024 * 1024) {
                $response = ['error' => 'Image must be smaller than 2MB'];
                Logger::log('clients', 'POST', 'upload_avatar', $userId, ['client_id' => $clientId], $response, 400);
                jsonResponse($response, 400);
            }

            $uploadDir = __DIR__ . '/../../media/avatars/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            if ($existingClient['avatar_url']) {
                $oldPath = __DIR__ . '/../../' . ltrim(parse_url($existingClient['avatar_url'], PHP_URL_PATH), '/');
                if (file_exists($oldPath) && is_file($oldPath)) {
                    unlink($oldPath);
                }
            }

            $fileExtension = pathinfo($file['name'], PATHINFO_EXTENSION);
            $uniqueName = 'client_' . $clientId . '_' . uniqid() . '.' . $fileExtension;
            $uploadPath = $uploadDir . $uniqueName;

            if (!move_uploaded_file($file['tmp_name'], $uploadPath)) {
                $response = ['error' => 'Failed to upload file'];
                Logger::log('clients', 'POST', 'upload_avatar', $userId, ['client_id' => $clientId], $response, 500);
                jsonResponse($response, 500);
            }

            $avatarUrl = '/media/avatars/' . $uniqueName;

            $db->execute(
                'UPDATE clients SET avatar_url = ? WHERE id = ?',
                [$avatarUrl, $clientId]
            );

            $client = $db->fetch(
                'SELECT * FROM clients WHERE id = ?',
                [$clientId]
            );

            $client = formatClientData($client);

            $response = ['data' => $client];
            Logger::log('clients', 'POST', 'upload_avatar', $userId, ['client_id' => $clientId], $response, 200);
            jsonResponse($response);
            break;

        case 'change_password':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'change_password', $_SESSION['user_id'] ?? null, [], $response, 405);
                jsonResponse($response, 405);
            }

            $userId = requireAuth();
            $data = getRequestData();

            $clientId = $data['client_id'] ?? '';
            $newPassword = $data['new_password'] ?? '';

            if (empty($clientId)) {
                $response = ['error' => 'Client ID is required'];
                Logger::log('clients', 'POST', 'change_password', $userId, ['client_id' => ''], $response, 400);
                jsonResponse($response, 400);
            }

            if (empty($newPassword)) {
                $response = ['error' => 'New password is required'];
                Logger::log('clients', 'POST', 'change_password', $userId, ['client_id' => $clientId], $response, 400);
                jsonResponse($response, 400);
            }

            if (strlen($newPassword) < 8) {
                $response = ['error' => 'Password must be at least 8 characters long'];
                Logger::log('clients', 'POST', 'change_password', $userId, ['client_id' => $clientId], $response, 400);
                jsonResponse($response, 400);
            }

            $existingClient = $db->fetch(
                'SELECT id FROM clients WHERE id = ?',
                [$clientId]
            );

            if (!$existingClient) {
                $response = ['error' => 'Client not found'];
                Logger::log('clients', 'POST', 'change_password', $userId, ['client_id' => $clientId], $response, 404);
                jsonResponse($response, 404);
            }

            $passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);

            $db->execute(
                'UPDATE clients SET password_hash = ? WHERE id = ?',
                [$passwordHash, $clientId]
            );

            $response = ['message' => 'Password changed successfully'];
            Logger::log('clients', 'POST', 'change_password', $userId, ['client_id' => $clientId], $response, 200);
            jsonResponse($response);
            break;

        case 'creator_list':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                $response = ['error' => 'Method not allowed'];
                Logger::log('clients', $_SERVER['REQUEST_METHOD'], 'creator_list', null, [], $response, 405, 'creator');
                jsonResponse($response, 405);
            }

            $email = $_GET['email'] ?? '';
            if (empty($email)) {
                $response = ['error' => 'Email is required'];
                Logger::log('clients', 'GET', 'creator_list', null, ['email' => ''], $response, 400, 'creator');
                jsonResponse($response, 400);
            }

            $admin = $db->fetch(
                'SELECT id, email FROM admin_users WHERE email = ?',
                [$email]
            );

            if (!$admin) {
                $response = ['error' => 'Admin user not found'];
                Logger::log('clients', 'GET', 'creator_list', null, ['email' => $email], $response, 403, 'creator');
                jsonResponse($response, 403);
            }

            $clients = $db->fetchAll(
                'SELECT * FROM clients ORDER BY created_at DESC'
            );

            $clients = array_map('formatClientData', $clients);

            $response = [
                'success' => true,
                'data' => $clients,
                'message' => 'Clients retrieved successfully'
            ];
            Logger::log('clients', 'GET', 'creator_list', $admin['id'], ['email' => $email], $response, 200, 'creator');
            jsonResponse($response);
            break;

        default:
            $response = ['error' => 'Invalid action'];
            Logger::log('clients', $_SERVER['REQUEST_METHOD'], $action, $_SESSION['user_id'] ?? null, [], $response, 400);
            jsonResponse($response, 400);
    }
} catch (Exception $e) {
    $response = ['error' => 'Server error: ' . $e->getMessage()];
    Logger::log('clients', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], $response, 500);
    jsonResponse($response, 500);
}
