<?php

class TokenManager {
    private const TOKEN_LENGTH = 64;
    private const TOKEN_EXPIRY_HOURS = 24;
    private const LONG_LIVED_TOKEN_EXPIRY_DAYS = 30;

    public static function generateSecureToken(): string {
        return bin2hex(random_bytes(self::TOKEN_LENGTH));
    }

    public static function hashToken(string $token): string {
        return hash('sha256', $token);
    }

    public static function getExpiryTime(int $hours = self::TOKEN_EXPIRY_HOURS): string {
        return date('Y-m-d H:i:s', strtotime("+{$hours} hours"));
    }

    public static function getLongLivedExpiryTime(): string {
        return date('Y-m-d H:i:s', strtotime("+" . self::LONG_LIVED_TOKEN_EXPIRY_DAYS . " days"));
    }

    public static function createToken(
        object $db,
        string $userId,
        string $ipAddress,
        string $userAgent,
        string $userType = 'client',
        bool $longLived = false
    ): array {
        $token = self::generateSecureToken();
        $hashedToken = self::hashToken($token);
        $expiresAt = $longLived ? self::getLongLivedExpiryTime() : self::getExpiryTime();

        $db->execute(
            'INSERT INTO auth_tokens (user_id, user_type, token, expires_at, ip_address, user_agent, long_lived)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$userId, $userType, $hashedToken, $expiresAt, $ipAddress, $userAgent, $longLived ? 1 : 0]
        );

        return [
            'token' => $token,
            'expires_at' => $expiresAt,
            'long_lived' => $longLived
        ];
    }

    public static function validateToken(object $db, string $token): ?array {
        $hashedToken = self::hashToken($token);

        $tokenData = $db->fetch(
            'SELECT at.*
             FROM auth_tokens at
             WHERE at.token = ?
             AND at.expires_at > NOW()
             AND at.revoked = false',
            [$hashedToken]
        );

        if (!$tokenData) {
            return null;
        }

        if ($tokenData['user_type'] === 'admin') {
            $user = $db->fetch(
                'SELECT id, email, name FROM admin_users WHERE id = ?',
                [$tokenData['user_id']]
            );
        } else {
            $user = $db->fetch(
                'SELECT id, email, name, license_type, billing_up_to_date FROM clients WHERE id = ?',
                [$tokenData['user_id']]
            );
        }

        if (!$user) {
            return null;
        }

        $result = array_merge($tokenData, [
            'email' => $user['email'],
            'name' => $user['name']
        ]);

        if ($tokenData['user_type'] === 'client') {
            $result['license_type'] = $user['license_type'];
            $result['billing_up_to_date'] = $user['billing_up_to_date'];
        }

        return $result;
    }

    public static function revokeToken(object $db, string $token): bool {
        $hashedToken = self::hashToken($token);

        $result = $db->execute(
            'UPDATE auth_tokens SET revoked = true WHERE token = ?',
            [$hashedToken]
        );

        return $result !== false;
    }

    public static function revokeAllUserTokens(object $db, string $userId, string $userType = 'client'): bool {
        $result = $db->execute(
            'UPDATE auth_tokens SET revoked = true WHERE user_id = ? AND user_type = ?',
            [$userId, $userType]
        );

        return $result !== false;
    }

    public static function revokeAllClientTokens(object $db, string $clientId): bool {
        return self::revokeAllUserTokens($db, $clientId, 'client');
    }

    public static function cleanupExpiredTokens(object $db): void {
        $db->execute('DELETE FROM auth_tokens WHERE expires_at < NOW()');
    }

    public static function refreshToken(
        object $db,
        string $oldToken,
        string $ipAddress,
        string $userAgent
    ): ?array {
        $tokenData = self::validateToken($db, $oldToken);

        if (!$tokenData) {
            return null;
        }

        self::revokeToken($db, $oldToken);

        return self::createToken($db, $tokenData['user_id'], $ipAddress, $userAgent, $tokenData['user_type']);
    }

    public static function hasValidLongLivedToken(object $db, string $userId, string $userType = 'client'): ?string {
        $tokenData = $db->fetch(
            'SELECT token FROM auth_tokens
             WHERE user_id = ?
             AND user_type = ?
             AND long_lived = true
             AND expires_at > NOW()
             AND revoked = false
             ORDER BY expires_at DESC
             LIMIT 1',
            [$userId, $userType]
        );

        return $tokenData ? $tokenData['token'] : null;
    }
}
