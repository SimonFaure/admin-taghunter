<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

require_once __DIR__ . '/../utils/SecurityHeaders.php';
SecurityHeaders::setHeaders();

header('Content-Type: application/json');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/RateLimiter.php';
require_once __DIR__ . '/../utils/OTPManager.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';
    $ipAddress = SecurityHeaders::getClientIp();
    $userAgent = SecurityHeaders::getUserAgent();

    RateLimiter::cleanupOldAttempts($db);
    OTPManager::cleanupExpiredCodes($db);
    TokenManager::cleanupExpiredTokens($db);

    switch ($action) {
        case 'login':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $email = $data['email'] ?? '';
            $password = $data['password'] ?? '';
            $appOrigin = $data['app_origin'] ?? null;
            $appVersion = $data['app_version'] ?? null;

            if (empty($email) || !SecurityHeaders::validateEmail($email)) {
                Logger::log('secure_auth', 'POST', 'login', null, ['email' => $email], ['error' => 'Invalid email'], 400);
                jsonResponse(['error' => 'Invalid email address'], 400);
            }

            $rateLimitCheck = RateLimiter::checkRateLimit($db, $email, $ipAddress);
            if (!$rateLimitCheck['allowed']) {
                Logger::log('secure_auth', 'POST', 'login', null, ['email' => $email], ['error' => 'Rate limited'], 429);
                jsonResponse([
                    'error' => 'Too many attempts. Please try again later.',
                    'retry_after' => $rateLimitCheck['retry_after']
                ], 429);
            }

            $client = $db->fetch('SELECT id, password_hash, email, name, license_type, billing_up_to_date, created_at, avatar_url FROM clients WHERE email = ?', [$email]);
            $admin = null;
            $userType = 'client';

            if (!$client) {
                $admin = $db->fetch('SELECT id, email, name FROM admin_users WHERE email = ?', [$email]);
                if ($admin) {
                    $userType = 'admin';
                }
            }

            if (!$client && !$admin) {
                RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Email not found');
                Logger::log('secure_auth', 'POST', 'login', null, ['email' => $email], ['error' => 'Email not found'], 404);
                jsonResponse(['error' => 'Email not registered'], 404);
            }

            if ($client && !empty($password)) {
                if (empty($client['password_hash'])) {
                    RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Password not set');
                    Logger::log('secure_auth', 'POST', 'login', $client['id'], ['email' => $email], ['error' => 'Password not configured'], 400);
                    jsonResponse(['error' => 'Password authentication not configured for this account'], 400);
                }

                if (!password_verify($password, $client['password_hash'])) {
                    RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Invalid password');
                    Logger::log('secure_auth', 'POST', 'login', $client['id'], ['email' => $email], ['error' => 'Invalid password'], 401);
                    jsonResponse(['error' => 'Invalid password'], 401);
                }
            }

            if ($client && empty($password) && !empty($client['password_hash'])) {
                RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Password required');
                Logger::log('secure_auth', 'POST', 'login', $client['id'], ['email' => $email], ['error' => 'Password required'], 400);
                jsonResponse(['error' => 'Password is required'], 400);
            }

            if ($client && $appOrigin && $appVersion) {
                $versionField = null;
                if ($appOrigin === 'creator') {
                    $versionField = 'creator_version';
                } elseif ($appOrigin === 'playground') {
                    $versionField = 'playground_version';
                }

                if ($versionField) {
                    $db->execute(
                        "UPDATE clients SET {$versionField} = ? WHERE id = ?",
                        [$appVersion, $client['id']]
                    );
                }
            }

            $userId = $client ? $client['id'] : $admin['id'];
            $hashedLongLivedToken = TokenManager::hasValidLongLivedToken($db, $userId, $userType);

            if ($hashedLongLivedToken) {
                $tokenData = TokenManager::createToken($db, $userId, $ipAddress, $userAgent, $userType, false);

                $response = [
                    'success' => true,
                    'code_required' => false,
                    'data' => [
                        'token' => $tokenData['token'],
                        'expires_at' => $tokenData['expires_at'],
                        'user_id' => $userId,
                        'user_type' => $userType,
                        'email' => $email,
                        'name' => $client ? $client['name'] : $admin['name']
                    ]
                ];

                if ($userType === 'client') {
                    $response['data']['license_type'] = $client['license_type'];
                    $response['data']['billing_up_to_date'] = $client['billing_up_to_date'];
                    $response['data']['created_at'] = $client['created_at'];
                    $response['data']['avatar_url'] = $client['avatar_url'];
                }

                RateLimiter::recordAttempt($db, $email, $ipAddress, true, null);
                Logger::log('secure_auth', 'POST', 'login', $userId, ['email' => $email, 'user_type' => $userType, 'remember_me' => true], ['success' => true], 200);
                jsonResponse($response);
            }

            $codeCheck = OTPManager::canRequestCode($db, $email);
            if (!$codeCheck['allowed']) {
                Logger::log('secure_auth', 'POST', 'login', $userId, ['email' => $email], ['error' => 'Too many codes'], 429);
                jsonResponse(['error' => $codeCheck['reason']], 429);
            }

            $codeData = OTPManager::createCode($db, $email, $ipAddress, 'otp');
            $emailSent = OTPManager::sendCodeEmail($email, $codeData['code'], 'otp');

            if (!$emailSent) {
                Logger::log('secure_auth', 'POST', 'login', $userId, ['email' => $email], ['error' => 'Failed to send email'], 500);
                jsonResponse(['error' => 'Failed to send code. Please try again.'], 500);
            }

            $response = [
                'success' => true,
                'code_required' => true,
                'message' => 'Code sent to your email',
                'expires_in' => 900
            ];

            Logger::log('secure_auth', 'POST', 'login', $userId, ['email' => $email, 'app_origin' => $appOrigin, 'app_version' => $appVersion], $response, 200);
            jsonResponse($response);
            break;

        case 'request-code':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $email = $data['email'] ?? '';
            $type = $data['type'] ?? 'otp';
            $password = $data['password'] ?? '';
            $appOrigin = $data['app_origin'] ?? null;
            $appVersion = $data['app_version'] ?? null;

            if (empty($email) || !SecurityHeaders::validateEmail($email)) {
                Logger::log('secure_auth', 'POST', 'request-code', null, ['email' => $email], ['error' => 'Invalid email'], 400);
                jsonResponse(['error' => 'Invalid email address'], 400);
            }

            $rateLimitCheck = RateLimiter::checkRateLimit($db, $email, $ipAddress);
            if (!$rateLimitCheck['allowed']) {
                Logger::log('secure_auth', 'POST', 'request-code', null, ['email' => $email], ['error' => 'Rate limited'], 429);
                jsonResponse([
                    'error' => 'Too many attempts. Please try again later.',
                    'retry_after' => $rateLimitCheck['retry_after']
                ], 429);
            }

            $codeCheck = OTPManager::canRequestCode($db, $email);
            if (!$codeCheck['allowed']) {
                Logger::log('secure_auth', 'POST', 'request-code', null, ['email' => $email], ['error' => 'Too many codes'], 429);
                jsonResponse(['error' => $codeCheck['reason']], 429);
            }

            $client = $db->fetch('SELECT id, password_hash FROM clients WHERE email = ?', [$email]);
            $admin = null;

            if (!$client) {
                $admin = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);
            }

            if (!$client && !$admin) {
                RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Email not found');
                Logger::log('secure_auth', 'POST', 'request-code', null, ['email' => $email], ['error' => 'Email not found'], 404);
                jsonResponse(['error' => 'Email not registered'], 404);
            }

            if ($client && !empty($password)) {
                if (empty($client['password_hash'])) {
                    RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Password not set');
                    Logger::log('secure_auth', 'POST', 'request-code', $client['id'], ['email' => $email], ['error' => 'Password not configured'], 400);
                    jsonResponse(['error' => 'Password authentication not configured for this account'], 400);
                }

                if (!password_verify($password, $client['password_hash'])) {
                    RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Invalid password');
                    Logger::log('secure_auth', 'POST', 'request-code', $client['id'], ['email' => $email], ['error' => 'Invalid password'], 401);
                    jsonResponse(['error' => 'Invalid password'], 401);
                }
            }

            if ($client && empty($password) && !empty($client['password_hash'])) {
                RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Password required');
                Logger::log('secure_auth', 'POST', 'request-code', $client['id'], ['email' => $email], ['error' => 'Password required'], 400);
                jsonResponse(['error' => 'Password is required'], 400);
            }

            if ($client && $appOrigin && $appVersion) {
                $versionField = null;
                if ($appOrigin === 'creator') {
                    $versionField = 'creator_version';
                } elseif ($appOrigin === 'playground') {
                    $versionField = 'playground_version';
                }

                if ($versionField) {
                    $db->execute(
                        "UPDATE clients SET {$versionField} = ? WHERE id = ?",
                        [$appVersion, $client['id']]
                    );
                }
            }

            $codeData = OTPManager::createCode($db, $email, $ipAddress, $type);

            $emailSent = OTPManager::sendCodeEmail($email, $codeData['code'], $type);

            if (!$emailSent) {
                Logger::log('secure_auth', 'POST', 'request-code', null, ['email' => $email], ['error' => 'Failed to send email'], 500);
                jsonResponse(['error' => 'Failed to send code. Please try again.'], 500);
            }

            $response = [
                'success' => true,
                'message' => $type === 'otp' ? 'Code sent to your email' : 'Magic link sent to your email',
                'expires_in' => 900
            ];

            Logger::log('secure_auth', 'POST', 'request-code', null, ['email' => $email, 'app_origin' => $appOrigin, 'app_version' => $appVersion], $response, 200);
            jsonResponse($response);
            break;

        case 'verify-code':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $email = $data['email'] ?? '';
            $code = $data['code'] ?? '';
            $rememberMe = $data['remember_me'] ?? false;

            if (empty($email) || empty($code)) {
                Logger::log('secure_auth', 'POST', 'verify-code', null, ['email' => $email], ['error' => 'Missing fields'], 400);
                jsonResponse(['error' => 'Email and code are required'], 400);
            }

            if (!SecurityHeaders::validateEmail($email)) {
                Logger::log('secure_auth', 'POST', 'verify-code', null, ['email' => $email], ['error' => 'Invalid email'], 400);
                jsonResponse(['error' => 'Invalid email address'], 400);
            }

            $rateLimitCheck = RateLimiter::checkRateLimit($db, $email, $ipAddress);
            if (!$rateLimitCheck['allowed']) {
                Logger::log('secure_auth', 'POST', 'verify-code', null, ['email' => $email], ['error' => 'Rate limited'], 429);
                jsonResponse([
                    'error' => 'Too many attempts. Please try again later.',
                    'retry_after' => $rateLimitCheck['retry_after']
                ], 429);
            }

            $codeValidation = OTPManager::validateCode($db, $email, $code);

            if (!$codeValidation['valid']) {
                RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Invalid code');
                Logger::log('secure_auth', 'POST', 'verify-code', null, ['email' => $email], ['error' => $codeValidation['reason']], 401);
                jsonResponse(['error' => $codeValidation['reason']], 401);
            }

            $client = $db->fetch('SELECT id, email, name, license_type, billing_up_to_date, created_at, avatar_url FROM clients WHERE email = ?', [$email]);
            $admin = null;
            $userType = 'client';
            $userId = null;
            $userName = null;
            $licenseType = null;
            $billingUpToDate = null;
            $createdAt = null;
            $avatarUrl = null;

            if (!$client) {
                $admin = $db->fetch('SELECT id, email, name FROM admin_users WHERE email = ?', [$email]);
                if ($admin) {
                    $userType = 'admin';
                    $userId = $admin['id'];
                    $userName = $admin['name'];
                }
            } else {
                $userId = $client['id'];
                $userName = $client['name'];
                $licenseType = $client['license_type'];
                $billingUpToDate = $client['billing_up_to_date'];
                $createdAt = $client['created_at'];
                $avatarUrl = $client['avatar_url'];
            }

            if (!$client && !$admin) {
                RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'User not found');
                Logger::log('secure_auth', 'POST', 'verify-code', null, ['email' => $email], ['error' => 'User not found'], 404);
                jsonResponse(['error' => 'User not found'], 404);
            }

            $tokenData = TokenManager::createToken($db, $userId, $ipAddress, $userAgent, $userType, $rememberMe);

            RateLimiter::recordAttempt($db, $email, $ipAddress, true, null);

            $response = [
                'success' => true,
                'data' => [
                    'token' => $tokenData['token'],
                    'expires_at' => $tokenData['expires_at'],
                    'long_lived' => $tokenData['long_lived'] ?? false,
                    'user_id' => $userId,
                    'user_type' => $userType,
                    'email' => $email,
                    'name' => $userName
                ]
            ];

            if ($userType === 'client') {
                $response['data']['license_type'] = $licenseType;
                $response['data']['billing_up_to_date'] = $billingUpToDate;
                $response['data']['created_at'] = $createdAt;
                $response['data']['avatar_url'] = $avatarUrl;
            }

            Logger::log('secure_auth', 'POST', 'verify-code', $userId, ['email' => $email, 'user_type' => $userType], ['success' => true], 200);
            jsonResponse($response);
            break;

        case 'validate':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $token = $data['token'] ?? $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';

            if (empty($token)) {
                jsonResponse(['error' => 'Token required'], 401);
            }

            $tokenData = TokenManager::validateToken($db, $token);

            if (!$tokenData) {
                jsonResponse([
                    'valid' => false,
                    'error' => 'Invalid or expired token'
                ], 401);
            }

            $response = [
                'valid' => true,
                'user_id' => $tokenData['user_id'],
                'user_type' => $tokenData['user_type'],
                'email' => $tokenData['email'],
                'name' => $tokenData['name'],
                'expires_at' => $tokenData['expires_at']
            ];

            if ($tokenData['user_type'] === 'client') {
                $response['client_id'] = $tokenData['user_id'];
                $response['license_type'] = $tokenData['license_type'] ?? 'access';
                $response['billing_up_to_date'] = $tokenData['billing_up_to_date'] ?? false;
                $response['created_at'] = $tokenData['created_at'] ?? null;
                $response['avatar_url'] = $tokenData['avatar_url'] ?? null;
            }

            Logger::log('secure_auth', 'POST', 'validate', $tokenData['user_id'], ['user_type' => $tokenData['user_type']], $response, 200);
            jsonResponse($response);
            break;

        case 'logout':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $token = $data['token'] ?? $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';

            if (empty($token)) {
                jsonResponse(['error' => 'Token required'], 401);
            }

            $tokenData = TokenManager::validateToken($db, $token);

            if ($tokenData) {
                TokenManager::revokeToken($db, $token);
                Logger::log('secure_auth', 'POST', 'logout', $tokenData['user_id'], ['user_type' => $tokenData['user_type']], ['success' => true], 200);
            }

            jsonResponse([
                'success' => true,
                'message' => 'Logged out successfully'
            ]);
            break;

        case 'refresh':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $token = $data['token'] ?? $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';

            if (empty($token)) {
                jsonResponse(['error' => 'Token required'], 401);
            }

            $newTokenData = TokenManager::refreshToken($db, $token, $ipAddress, $userAgent);

            if (!$newTokenData) {
                jsonResponse(['error' => 'Invalid or expired token'], 401);
            }

            $response = [
                'success' => true,
                'data' => [
                    'token' => $newTokenData['token'],
                    'expires_at' => $newTokenData['expires_at']
                ]
            ];

            Logger::log('secure_auth', 'POST', 'refresh', null, [], $response, 200);
            jsonResponse($response);
            break;

        case 'upload-avatar':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $authHeader = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
            if (empty($authHeader)) {
                jsonResponse(['error' => 'Authentication required'], 401);
            }

            $tokenData = TokenManager::validateToken($db, $authHeader);
            if (!$tokenData || $tokenData['user_type'] !== 'client') {
                jsonResponse(['error' => 'Invalid authentication'], 401);
            }

            $clientId = $tokenData['user_id'];

            if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] !== UPLOAD_ERR_OK) {
                $errorMsg = isset($_FILES['avatar']) ? 'Upload error: ' . $_FILES['avatar']['error'] : 'No file uploaded';
                Logger::log('secure_auth', 'POST', 'upload-avatar', $clientId, [], ['error' => $errorMsg], 400);
                jsonResponse(['error' => $errorMsg], 400);
            }

            $file = $_FILES['avatar'];

            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mimeType = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);

            $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!in_array($mimeType, $allowedTypes)) {
                Logger::log('secure_auth', 'POST', 'upload-avatar', $clientId, [], ['error' => 'Invalid file type'], 400);
                jsonResponse(['error' => 'Only image files are allowed (JPEG, PNG, GIF, WebP)'], 400);
            }

            if ($file['size'] > 2 * 1024 * 1024) {
                Logger::log('secure_auth', 'POST', 'upload-avatar', $clientId, [], ['error' => 'File too large'], 400);
                jsonResponse(['error' => 'Image must be smaller than 2MB'], 400);
            }

            $uploadDir = __DIR__ . '/../../media/avatars/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $existingClient = $db->fetch(
                'SELECT avatar_url FROM clients WHERE id = ?',
                [$clientId]
            );

            if ($existingClient && $existingClient['avatar_url']) {
                $oldPath = __DIR__ . '/../../' . ltrim(parse_url($existingClient['avatar_url'], PHP_URL_PATH), '/');
                if (file_exists($oldPath) && is_file($oldPath)) {
                    unlink($oldPath);
                }
            }

            $fileExtension = pathinfo($file['name'], PATHINFO_EXTENSION);
            $uniqueName = 'client_' . $clientId . '_' . uniqid() . '.' . $fileExtension;
            $uploadPath = $uploadDir . $uniqueName;

            if (!move_uploaded_file($file['tmp_name'], $uploadPath)) {
                Logger::log('secure_auth', 'POST', 'upload-avatar', $clientId, [], ['error' => 'Failed to upload file'], 500);
                jsonResponse(['error' => 'Failed to upload file'], 500);
            }

            $avatarUrl = 'https://admin.taghunter.fr/media/avatars/' . $uniqueName;

            $db->execute(
                'UPDATE clients SET avatar_url = ? WHERE id = ?',
                [$avatarUrl, $clientId]
            );

            $response = [
                'success' => true,
                'data' => [
                    'avatar_url' => $avatarUrl
                ]
            ];

            Logger::log('secure_auth', 'POST', 'upload-avatar', $clientId, [], $response, 200);
            jsonResponse($response);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    Logger::log('secure_auth', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
