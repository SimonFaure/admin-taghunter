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
        case 'request-code':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $email = $data['email'] ?? '';
            $type = $data['type'] ?? 'otp';

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

            $client = $db->fetch('SELECT id FROM clients WHERE email = ?', [$email]);

            if (!$client) {
                RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Email not found');
                Logger::log('secure_auth', 'POST', 'request-code', null, ['email' => $email], ['error' => 'Email not found'], 404);
                jsonResponse(['error' => 'Email not registered'], 404);
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

            Logger::log('secure_auth', 'POST', 'request-code', null, ['email' => $email], $response, 200);
            jsonResponse($response);
            break;

        case 'verify-code':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $email = $data['email'] ?? '';
            $code = $data['code'] ?? '';

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

            $client = $db->fetch('SELECT id, email, name FROM clients WHERE email = ?', [$email]);

            if (!$client) {
                RateLimiter::recordAttempt($db, $email, $ipAddress, false, 'Client not found');
                Logger::log('secure_auth', 'POST', 'verify-code', null, ['email' => $email], ['error' => 'Client not found'], 404);
                jsonResponse(['error' => 'Client not found'], 404);
            }

            $tokenData = TokenManager::createToken($db, $client['id'], $ipAddress, $userAgent);

            RateLimiter::recordAttempt($db, $email, $ipAddress, true, null);

            $response = [
                'success' => true,
                'data' => [
                    'token' => $tokenData['token'],
                    'expires_at' => $tokenData['expires_at'],
                    'client_id' => $client['id'],
                    'email' => $client['email'],
                    'name' => $client['name']
                ]
            ];

            Logger::log('secure_auth', 'POST', 'verify-code', $client['id'], ['email' => $email], ['success' => true], 200);
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
                'client_id' => $tokenData['client_id'],
                'email' => $tokenData['email'],
                'name' => $tokenData['name'],
                'expires_at' => $tokenData['expires_at']
            ];

            Logger::log('secure_auth', 'POST', 'validate', $tokenData['client_id'], [], $response, 200);
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
                Logger::log('secure_auth', 'POST', 'logout', $tokenData['client_id'], [], ['success' => true], 200);
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

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    Logger::log('secure_auth', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
