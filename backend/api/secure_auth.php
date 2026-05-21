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
require_once __DIR__ . '/../utils/DeviceManager.php';
require_once __DIR__ . '/../utils/PlaygroundAuthState.php';

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

            $client = $db->fetch('SELECT id, password_hash, email, name, license_type, billing_up_to_date, created_at, avatar_url, company_logo_url, company_logo_uses_avatar FROM clients WHERE email = ?', [$email]);
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
                $tokenData = TokenManager::createToken($db, $userId, $ipAddress, $userAgent, $userType, true);

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
                    $response['data']['company_logo_url'] = $client['company_logo_url'] ?? null;
                    $response['data']['company_logo_uses_avatar'] = isset($client['company_logo_uses_avatar'])
                        ? (bool)$client['company_logo_uses_avatar']
                        : true;
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

            $client = $db->fetch('SELECT id, email, name, license_type, billing_up_to_date, created_at, avatar_url, company_logo_url, company_logo_uses_avatar FROM clients WHERE email = ?', [$email]);
            $admin = null;
            $userType = 'client';
            $userId = null;
            $userName = null;
            $licenseType = null;
            $billingUpToDate = null;
            $createdAt = null;
            $avatarUrl = null;
            $companyLogoUrl = null;
            $companyLogoUsesAvatar = true;

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
                $companyLogoUrl = $client['company_logo_url'] ?? null;
                $companyLogoUsesAvatar = isset($client['company_logo_uses_avatar'])
                    ? (bool)$client['company_logo_uses_avatar']
                    : true;
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
                $response['data']['company_logo_url'] = $companyLogoUrl;
                $response['data']['company_logo_uses_avatar'] = $companyLogoUsesAvatar;
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

                // Hydrate logo prefs so MyAccountView can render the Brand identity
                // card without an extra fetch. TokenManager doesn't carry these.
                $logoRow = $db->fetch(
                    'SELECT company_logo_url, company_logo_uses_avatar FROM clients WHERE id = ?',
                    [$tokenData['user_id']]
                );
                $response['company_logo_url'] = $logoRow['company_logo_url'] ?? null;
                $response['company_logo_uses_avatar'] = isset($logoRow['company_logo_uses_avatar'])
                    ? (bool)$logoRow['company_logo_uses_avatar']
                    : true;
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

        case 'logout-all':
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
                jsonResponse(['error' => 'Invalid token'], 401);
            }

            TokenManager::revokeAllUserTokens($db, $tokenData['user_id'], $tokenData['user_type']);
            Logger::log('secure_auth', 'POST', 'logout-all', $tokenData['user_id'], ['user_type' => $tokenData['user_type']], ['success' => true], 200);

            jsonResponse([
                'success' => true,
                'message' => 'All sessions revoked'
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

            // Store the avatar as a relative path; the frontend prefixes with
            // VITE_MEDIA_BASE_URL at render time. Avoids hardcoding a host that
            // changed when admin-taghunter merged into studio-taghunter.
            $avatarUrl = '/media/avatars/' . $uniqueName;

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

        case 'upload-company-logo':
            // Mirror of upload-avatar for clients.company_logo_url. Does NOT flip
            // company_logo_uses_avatar — that preference is controlled separately by
            // update-logo-preference, so toggling stays non-destructive.
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

            if (!isset($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
                $errorMsg = isset($_FILES['logo']) ? 'Upload error: ' . $_FILES['logo']['error'] : 'No file uploaded';
                Logger::log('secure_auth', 'POST', 'upload-company-logo', $clientId, [], ['error' => $errorMsg], 400);
                jsonResponse(['error' => $errorMsg], 400);
            }

            $file = $_FILES['logo'];

            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mimeType = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);

            $allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!in_array($mimeType, $allowedTypes)) {
                Logger::log('secure_auth', 'POST', 'upload-company-logo', $clientId, [], ['error' => 'Invalid file type'], 400);
                jsonResponse(['error' => 'Only image files are allowed (JPEG, PNG, GIF, WebP)'], 400);
            }

            if ($file['size'] > 2 * 1024 * 1024) {
                Logger::log('secure_auth', 'POST', 'upload-company-logo', $clientId, [], ['error' => 'File too large'], 400);
                jsonResponse(['error' => 'Image must be smaller than 2MB'], 400);
            }

            $uploadDir = __DIR__ . '/../../media/company-logos/';
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $existingClient = $db->fetch(
                'SELECT company_logo_url FROM clients WHERE id = ?',
                [$clientId]
            );

            // Replace-and-unlink (mirrors upload-avatar). The toggle path in
            // update-logo-preference does NOT touch the file — see note there.
            if ($existingClient && $existingClient['company_logo_url']) {
                $oldPath = __DIR__ . '/../../' . ltrim(parse_url($existingClient['company_logo_url'], PHP_URL_PATH), '/');
                if (file_exists($oldPath) && is_file($oldPath)) {
                    unlink($oldPath);
                }
            }

            $fileExtension = pathinfo($file['name'], PATHINFO_EXTENSION);
            $uniqueName = 'client_' . $clientId . '_logo_' . uniqid() . '.' . $fileExtension;
            $uploadPath = $uploadDir . $uniqueName;

            if (!move_uploaded_file($file['tmp_name'], $uploadPath)) {
                Logger::log('secure_auth', 'POST', 'upload-company-logo', $clientId, [], ['error' => 'Failed to upload file'], 500);
                jsonResponse(['error' => 'Failed to upload file'], 500);
            }

            $logoUrl = '/media/company-logos/' . $uniqueName;

            $db->execute(
                'UPDATE clients SET company_logo_url = ? WHERE id = ?',
                [$logoUrl, $clientId]
            );

            $response = [
                'success' => true,
                'data' => [
                    'company_logo_url' => $logoUrl,
                ],
            ];

            Logger::log('secure_auth', 'POST', 'upload-company-logo', $clientId, [], $response, 200);
            jsonResponse($response);
            break;

        case 'update-logo-preference':
            // Non-destructive toggle: changes which image is the "active" brand image
            // without touching the uploaded logo file. Returns the freshly resolved
            // brand_logo_url so the UI preview can update without re-fetching.
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

            $clientId = (int)$tokenData['user_id'];
            $body = getRequestData();
            if (!array_key_exists('use_avatar', $body)) {
                jsonResponse(['error' => 'use_avatar (boolean) is required'], 400);
            }

            $useAvatarInt = ((bool)$body['use_avatar']) ? 1 : 0;

            $db->execute(
                'UPDATE clients SET company_logo_uses_avatar = ? WHERE id = ?',
                [$useAvatarInt, $clientId]
            );

            $client = $db->fetch(
                'SELECT avatar_url, company_logo_url, company_logo_uses_avatar FROM clients WHERE id = ?',
                [$clientId]
            );

            $useAvatar = empty($client['company_logo_url']) || (int)$client['company_logo_uses_avatar'] === 1;
            $brandLogoUrl = $useAvatar ? ($client['avatar_url'] ?? null) : $client['company_logo_url'];

            $response = [
                'success' => true,
                'data' => [
                    'company_logo_uses_avatar' => (bool)$client['company_logo_uses_avatar'],
                    'brand_logo_url' => $brandLogoUrl,
                ],
            ];

            Logger::log('secure_auth', 'POST', 'update-logo-preference', $clientId, ['use_avatar' => (bool)$body['use_avatar']], $response, 200);
            jsonResponse($response);
            break;

        // ─────────────────────────────────────────────────────────────────
        // Playground-specific OTP login flow (Tauri client).
        //   Differences vs the studio web flow:
        //     - clients-only (admin_users emails are rejected)
        //     - no password path (pure OTP)
        //     - device-bound: each session is tied to a devices row
        //     - per-client max_devices cap with explicit eviction step
        //     - 10-year token expiry; revocation is the only way out
        // ─────────────────────────────────────────────────────────────────

        case 'playground-request-code':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $email = $data['email'] ?? '';

            if (empty($email) || !SecurityHeaders::validateEmail($email)) {
                Logger::log('secure_auth', 'POST', 'playground-request-code', null, ['email' => $email], ['error' => 'Invalid email'], 400);
                jsonResponse(['error' => 'Invalid email address'], 400);
            }

            $rateLimitCheck = RateLimiter::checkRateLimit($db, $email, $ipAddress);
            if (!$rateLimitCheck['allowed']) {
                Logger::log('secure_auth', 'POST', 'playground-request-code', null, ['email' => $email], ['error' => 'Rate limited'], 429);
                jsonResponse([
                    'error' => 'Too many attempts. Please try again later.',
                    'retry_after' => $rateLimitCheck['retry_after']
                ], 429);
            }

            $codeCheck = OTPManager::canRequestCode($db, $email);
            if (!$codeCheck['allowed']) {
                Logger::log('secure_auth', 'POST', 'playground-request-code', null, ['email' => $email], ['error' => 'Too many codes'], 429);
                jsonResponse(['error' => $codeCheck['reason']], 429);
            }

            $client = $db->fetch('SELECT id FROM clients WHERE email = ?', [$email]);
            $admin = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);

            if (!$client) {
                if ($admin) {
                    RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Admin email rejected by playground');
                    Logger::log('secure_auth', 'POST', 'playground-request-code', null, ['email' => $email], ['error' => 'Admin not allowed'], 403);
                    jsonResponse(['error' => 'This account cannot use the playground. Contact your administrator.'], 403);
                }

                RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Email not found');
                Logger::log('secure_auth', 'POST', 'playground-request-code', null, ['email' => $email], ['error' => 'Email not found'], 404);
                jsonResponse(['error' => 'No account for this email. Contact your administrator.'], 404);
            }

            $codeData = OTPManager::createCode($db, $email, $ipAddress, 'otp');
            $emailSent = OTPManager::sendCodeEmail($email, $codeData['code'], 'otp');

            if (!$emailSent) {
                Logger::log('secure_auth', 'POST', 'playground-request-code', $client['id'], ['email' => $email], ['error' => 'Failed to send email'], 500);
                jsonResponse(['error' => 'Failed to send code. Please try again.'], 500);
            }

            $response = [
                'success' => true,
                'message' => 'Code sent to your email',
                'expires_in' => 900,
            ];

            Logger::log('secure_auth', 'POST', 'playground-request-code', $client['id'], ['email' => $email], $response, 200);
            jsonResponse($response);
            break;

        case 'playground-verify-code':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $email = $data['email'] ?? '';
            $code = $data['code'] ?? '';
            $deviceUniq = $data['device_uniq'] ?? '';

            if (empty($email) || empty($code) || empty($deviceUniq)) {
                Logger::log('secure_auth', 'POST', 'playground-verify-code', null, ['email' => $email], ['error' => 'Missing fields'], 400);
                jsonResponse(['error' => 'email, code and device_uniq are required'], 400);
            }

            if (!SecurityHeaders::validateEmail($email)) {
                jsonResponse(['error' => 'Invalid email address'], 400);
            }

            $rateLimitCheck = RateLimiter::checkRateLimit($db, $email, $ipAddress);
            if (!$rateLimitCheck['allowed']) {
                jsonResponse([
                    'error' => 'Too many attempts. Please try again later.',
                    'retry_after' => $rateLimitCheck['retry_after']
                ], 429);
            }

            $codeValidation = OTPManager::validateCode($db, $email, $code);
            if (!$codeValidation['valid']) {
                RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Invalid code');
                Logger::log('secure_auth', 'POST', 'playground-verify-code', null, ['email' => $email], ['error' => $codeValidation['reason']], 401);
                jsonResponse(['error' => $codeValidation['reason']], 401);
            }

            $client = $db->fetch(
                'SELECT id, max_devices FROM clients WHERE email = ?',
                [$email]
            );

            if (!$client) {
                $admin = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);
                if ($admin) {
                    Logger::log('secure_auth', 'POST', 'playground-verify-code', $admin['id'], ['email' => $email], ['error' => 'Admin not allowed'], 403);
                    jsonResponse(['error' => 'This account cannot use the playground.'], 403);
                }
                Logger::log('secure_auth', 'POST', 'playground-verify-code', null, ['email' => $email], ['error' => 'Client not found'], 404);
                jsonResponse(['error' => 'No account for this email.'], 404);
            }

            $clientId = (int)$client['id'];
            $maxDevices = (int)$client['max_devices'];

            $existingDevice = $db->fetch(
                'SELECT id FROM devices WHERE client_id = ? AND device_uniq = ?',
                [$clientId, $deviceUniq]
            );

            $isNewDevice = !$existingDevice;
            $activeCount = DeviceManager::countActiveDevicesForClient($db, $clientId);

            // New device that would push us over the cap → return cap_reached + approval_token.
            // The OTP has already been consumed; the approval_token gates the eviction step.
            if ($isNewDevice && $activeCount >= $maxDevices) {
                $approvalToken = OTPManager::generateMagicLinkToken();
                $approvalExpiry = date('Y-m-d H:i:s', strtotime('+5 minutes'));
                $db->execute(
                    'INSERT INTO one_time_codes (email, code, expires_at, ip_address)
                     VALUES (?, ?, ?, ?)',
                    [$email, $approvalToken, $approvalExpiry, $ipAddress]
                );

                $devices = DeviceManager::listActiveForClient($db, $clientId);

                Logger::log('secure_auth', 'POST', 'playground-verify-code', $clientId, ['email' => $email], ['cap_reached' => true], 200);
                jsonResponse([
                    'success' => true,
                    'cap_reached' => true,
                    'max_devices' => $maxDevices,
                    'approval_token' => $approvalToken,
                    'devices' => $devices,
                ]);
            }

            $deviceId = DeviceManager::findOrCreate($db, $clientId, $deviceUniq, [
                'device_label' => $data['device_label'] ?? null,
                'os' => $data['os'] ?? null,
                'os_version' => $data['os_version'] ?? null,
                'app_version' => $data['app_version'] ?? null,
            ]);

            $tokenData = TokenManager::createPlaygroundToken($db, $clientId, $deviceId, $ipAddress, $userAgent);

            RateLimiter::recordAttempt($db, $email, $ipAddress, true, null);

            $response = [
                'success' => true,
                'cap_reached' => false,
                'data' => [
                    'token' => $tokenData['token'],
                    'expires_at' => $tokenData['expires_at'],
                    'device_id' => $deviceId,
                ],
                'auth_state' => PlaygroundAuthState::build($db, $clientId, $deviceId),
            ];

            Logger::log('secure_auth', 'POST', 'playground-verify-code', $clientId, ['email' => $email, 'device_id' => $deviceId], ['success' => true], 200);
            jsonResponse($response);
            break;

        case 'playground-evict-and-verify':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $email = $data['email'] ?? '';
            $approvalToken = $data['approval_token'] ?? '';
            $revokeDeviceId = isset($data['revoke_device_id']) ? (int)$data['revoke_device_id'] : 0;
            $deviceUniq = $data['device_uniq'] ?? '';

            if (empty($email) || empty($approvalToken) || empty($revokeDeviceId) || empty($deviceUniq)) {
                jsonResponse(['error' => 'email, approval_token, revoke_device_id and device_uniq are required'], 400);
            }

            $approvalCheck = OTPManager::validateCode($db, $email, $approvalToken);
            if (!$approvalCheck['valid']) {
                Logger::log('secure_auth', 'POST', 'playground-evict-and-verify', null, ['email' => $email], ['error' => 'Invalid approval token'], 401);
                jsonResponse(['error' => 'Approval expired. Please log in again.'], 401);
            }

            $client = $db->fetch(
                'SELECT id, max_devices FROM clients WHERE email = ?',
                [$email]
            );

            if (!$client) {
                jsonResponse(['error' => 'No account for this email.'], 404);
            }

            $clientId = (int)$client['id'];

            $deviceToRevoke = $db->fetch(
                'SELECT id FROM devices WHERE id = ? AND client_id = ?',
                [$revokeDeviceId, $clientId]
            );

            if (!$deviceToRevoke) {
                jsonResponse(['error' => 'Device to revoke not found.'], 404);
            }

            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                $db->execute('DELETE FROM devices WHERE id = ?', [$revokeDeviceId]);

                $newDeviceId = DeviceManager::findOrCreate($db, $clientId, $deviceUniq, [
                    'device_label' => $data['device_label'] ?? null,
                    'os' => $data['os'] ?? null,
                    'os_version' => $data['os_version'] ?? null,
                    'app_version' => $data['app_version'] ?? null,
                ]);

                $tokenData = TokenManager::createPlaygroundToken($db, $clientId, $newDeviceId, $ipAddress, $userAgent);

                $pdo->commit();
            } catch (Exception $e) {
                $pdo->rollBack();
                Logger::log('secure_auth', 'POST', 'playground-evict-and-verify', $clientId, ['email' => $email], ['error' => $e->getMessage()], 500);
                jsonResponse(['error' => 'Eviction failed: ' . $e->getMessage()], 500);
            }

            RateLimiter::recordAttempt($db, $email, $ipAddress, true, null);

            $response = [
                'success' => true,
                'data' => [
                    'token' => $tokenData['token'],
                    'expires_at' => $tokenData['expires_at'],
                    'device_id' => $newDeviceId,
                ],
                'auth_state' => PlaygroundAuthState::build($db, $clientId, $newDeviceId),
            ];

            Logger::log('secure_auth', 'POST', 'playground-evict-and-verify', $clientId, ['email' => $email, 'evicted' => $revokeDeviceId, 'new_device' => $newDeviceId], ['success' => true], 200);
            jsonResponse($response);
            break;

        case 'playground-bootstrap':
            // Called on app launch when a JWT exists in Stronghold. Validates the token,
            // ensures it belongs to a client (not admin), bumps devices.last_seen_at,
            // and returns the current auth_state for the splash → home transition.
            if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $rawToken = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
            if (strpos($rawToken, 'Bearer ') === 0) {
                $rawToken = substr($rawToken, 7);
            }

            if (empty($rawToken)) {
                jsonResponse(['error' => 'Token required'], 401);
            }

            $tokenData = TokenManager::validateToken($db, $rawToken);
            if (!$tokenData || $tokenData['user_type'] !== 'client') {
                jsonResponse(['error' => 'Invalid token'], 401);
            }

            $clientId = (int)$tokenData['user_id'];
            $deviceIdForState = !empty($tokenData['device_id']) ? (int)$tokenData['device_id'] : null;
            if ($deviceIdForState !== null) {
                DeviceManager::bumpLastSeen($db, $deviceIdForState);
            }

            $authState = PlaygroundAuthState::build($db, $clientId, $deviceIdForState);
            if (!$authState) {
                jsonResponse(['error' => 'Account not found'], 404);
            }

            jsonResponse([
                'success' => true,
                'auth_state' => $authState,
                'device_id' => $tokenData['device_id'] ?? null,
            ]);
            break;

        case 'playground-list-devices':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $rawToken = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
            if (strpos($rawToken, 'Bearer ') === 0) {
                $rawToken = substr($rawToken, 7);
            }

            if (empty($rawToken)) {
                jsonResponse(['error' => 'Token required'], 401);
            }

            $tokenData = TokenManager::validateToken($db, $rawToken);
            if (!$tokenData || $tokenData['user_type'] !== 'client') {
                jsonResponse(['error' => 'Invalid token'], 401);
            }

            $clientId = (int)$tokenData['user_id'];
            $devices = DeviceManager::listForClient($db, $clientId);

            jsonResponse([
                'success' => true,
                'devices' => $devices,
                'current_device_id' => $tokenData['device_id'] ?? null,
            ]);
            break;

        case 'playground-revoke-device':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $rawToken = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
            if (strpos($rawToken, 'Bearer ') === 0) {
                $rawToken = substr($rawToken, 7);
            }

            if (empty($rawToken)) {
                jsonResponse(['error' => 'Token required'], 401);
            }

            $tokenData = TokenManager::validateToken($db, $rawToken);
            if (!$tokenData || $tokenData['user_type'] !== 'client') {
                jsonResponse(['error' => 'Invalid token'], 401);
            }

            $clientId = (int)$tokenData['user_id'];
            $data = getRequestData();
            $deviceId = isset($data['device_id']) ? (int)$data['device_id'] : 0;

            if ($deviceId <= 0) {
                jsonResponse(['error' => 'device_id is required'], 400);
            }

            $ok = DeviceManager::revoke($db, $clientId, $deviceId);
            if (!$ok) {
                jsonResponse(['error' => 'Device not found'], 404);
            }

            Logger::log('secure_auth', 'POST', 'playground-revoke-device', $clientId, ['device_id' => $deviceId], ['success' => true], 200);
            jsonResponse(['success' => true]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    Logger::log('secure_auth', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
