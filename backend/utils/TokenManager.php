<?php

class TokenManager {
    private const TOKEN_LENGTH = 64;
    private const TOKEN_EXPIRY_HOURS = 24;

    public static function generateSecureToken(): string {
        return bin2hex(random_bytes(self::TOKEN_LENGTH));
    }

    public static function hashToken(string $token): string {
        return hash('sha256', $token);
    }

    public static function getExpiryTime(int $hours = self::TOKEN_EXPIRY_HOURS): string {
        return date('Y-m-d H:i:s', strtotime("+{$hours} hours"));
    }

    public static function createToken(
        object $db,
        string $clientId,
        string $ipAddress,
        string $userAgent
    ): array {
        $token = self::generateSecureToken();
        $hashedToken = self::hashToken($token);
        $expiresAt = self::getExpiryTime();

        $db->execute(
            'INSERT INTO auth_tokens (client_id, token, expires_at, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?)',
            [$clientId, $hashedToken, $expiresAt, $ipAddress, $userAgent]
        );

        return [
            'token' => $token,
            'expires_at' => $expiresAt
        ];
    }

    public static function validateToken(object $db, string $token): ?array {
        $hashedToken = self::hashToken($token);

        $result = $db->fetch(
            'SELECT at.*, c.email, c.name
             FROM auth_tokens at
             JOIN clients c ON at.client_id = c.id
             WHERE at.token = ?
             AND at.expires_at > NOW()
             AND at.revoked = false',
            [$hashedToken]
        );

        return $result ?: null;
    }

    public static function revokeToken(object $db, string $token): bool {
        $hashedToken = self::hashToken($token);

        $result = $db->execute(
            'UPDATE auth_tokens SET revoked = true WHERE token = ?',
            [$hashedToken]
        );

        return $result !== false;
    }

    public static function revokeAllClientTokens(object $db, string $clientId): bool {
        $result = $db->execute(
            'UPDATE auth_tokens SET revoked = true WHERE client_id = ?',
            [$clientId]
        );

        return $result !== false;
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

        return self::createToken($db, $tokenData['client_id'], $ipAddress, $userAgent);
    }
}
