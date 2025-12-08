<?php

class RateLimiter {
    private const MAX_ATTEMPTS_PER_EMAIL = 5;
    private const MAX_ATTEMPTS_PER_IP = 10;
    private const EMAIL_WINDOW_MINUTES = 60;
    private const IP_WINDOW_MINUTES = 15;
    private const LOCKOUT_MINUTES = 15;

    public static function checkRateLimit(
        object $db,
        string $email,
        string $ipAddress
    ): array {
        $emailLimited = self::isEmailRateLimited($db, $email);
        $ipLimited = self::isIpRateLimited($db, $ipAddress);

        if ($emailLimited || $ipLimited) {
            return [
                'allowed' => false,
                'reason' => $emailLimited ? 'email' : 'ip',
                'retry_after' => self::LOCKOUT_MINUTES * 60
            ];
        }

        return ['allowed' => true];
    }

    private static function isEmailRateLimited(object $db, string $email): bool {
        $windowStart = date('Y-m-d H:i:s', strtotime("-" . self::EMAIL_WINDOW_MINUTES . " minutes"));

        $result = $db->fetch(
            'SELECT COUNT(*) as attempt_count
             FROM login_attempts
             WHERE email = ?
             AND attempted_at > ?
             AND success = false',
            [$email, $windowStart]
        );

        return ($result['attempt_count'] ?? 0) >= self::MAX_ATTEMPTS_PER_EMAIL;
    }

    private static function isIpRateLimited(object $db, string $ipAddress): bool {
        $windowStart = date('Y-m-d H:i:s', strtotime("-" . self::IP_WINDOW_MINUTES . " minutes"));

        $result = $db->fetch(
            'SELECT COUNT(*) as attempt_count
             FROM login_attempts
             WHERE ip_address = ?
             AND attempted_at > ?
             AND success = false',
            [$ipAddress, $windowStart]
        );

        return ($result['attempt_count'] ?? 0) >= self::MAX_ATTEMPTS_PER_IP;
    }

    public static function recordAttempt(
        object $db,
        string $email,
        string $ipAddress,
        bool $success,
        ?string $failureReason = null
    ): void {
        $db->execute(
            'INSERT INTO login_attempts (email, ip_address, success, failure_reason)
             VALUES (?, ?, ?, ?)',
            [$email, $ipAddress, $success, $failureReason]
        );
    }

    public static function cleanupOldAttempts(object $db): void {
        $cutoffTime = date('Y-m-d H:i:s', strtotime('-24 hours'));
        $db->execute('DELETE FROM login_attempts WHERE attempted_at < ?', [$cutoffTime]);
    }

    public static function getFailedAttempts(object $db, string $email): int {
        $windowStart = date('Y-m-d H:i:s', strtotime("-" . self::EMAIL_WINDOW_MINUTES . " minutes"));

        $result = $db->fetch(
            'SELECT COUNT(*) as attempt_count
             FROM login_attempts
             WHERE email = ?
             AND attempted_at > ?
             AND success = false',
            [$email, $windowStart]
        );

        return (int)($result['attempt_count'] ?? 0);
    }
}
