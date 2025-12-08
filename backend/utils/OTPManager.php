<?php

class OTPManager {
    private const CODE_LENGTH = 6;
    private const CODE_EXPIRY_MINUTES = 15;
    private const MAX_CODES_PER_EMAIL = 3;
    private const CODE_WINDOW_MINUTES = 60;

    public static function generateCode(): string {
        return str_pad((string)random_int(0, 999999), self::CODE_LENGTH, '0', STR_PAD_LEFT);
    }

    public static function generateMagicLinkToken(): string {
        return bin2hex(random_bytes(32));
    }

    public static function canRequestCode(object $db, string $email): array {
        $windowStart = date('Y-m-d H:i:s', strtotime("-" . self::CODE_WINDOW_MINUTES . " minutes"));

        $result = $db->fetch(
            'SELECT COUNT(*) as code_count
             FROM one_time_codes
             WHERE email = ?
             AND created_at > ?',
            [$email, $windowStart]
        );

        $codeCount = (int)($result['code_count'] ?? 0);

        if ($codeCount >= self::MAX_CODES_PER_EMAIL) {
            return [
                'allowed' => false,
                'reason' => 'Too many code requests. Please try again later.'
            ];
        }

        return ['allowed' => true];
    }

    public static function createCode(
        object $db,
        string $email,
        string $ipAddress,
        string $type = 'otp'
    ): array {
        $code = $type === 'magic_link' ? self::generateMagicLinkToken() : self::generateCode();
        $expiresAt = date('Y-m-d H:i:s', strtotime("+" . self::CODE_EXPIRY_MINUTES . " minutes"));

        $db->execute(
            'INSERT INTO one_time_codes (email, code, expires_at, ip_address)
             VALUES (?, ?, ?, ?)',
            [$email, $code, $expiresAt, $ipAddress]
        );

        return [
            'code' => $code,
            'expires_at' => $expiresAt,
            'type' => $type
        ];
    }

    public static function validateCode(
        object $db,
        string $email,
        string $code
    ): array {
        $result = $db->fetch(
            'SELECT * FROM one_time_codes
             WHERE email = ?
             AND code = ?
             AND expires_at > NOW()
             AND used = false',
            [$email, $code]
        );

        if (!$result) {
            return [
                'valid' => false,
                'reason' => 'Invalid or expired code'
            ];
        }

        $db->execute(
            'UPDATE one_time_codes SET used = true WHERE id = ?',
            [$result['id']]
        );

        return ['valid' => true];
    }

    public static function cleanupExpiredCodes(object $db): void {
        $db->execute('DELETE FROM one_time_codes WHERE expires_at < NOW() OR used = true');
    }

    public static function sendCodeEmail(string $email, string $code, string $type = 'otp'): bool {
        if ($type === 'otp') {
            $subject = 'Your Login Code';
            $message = "Your one-time login code is: {$code}\n\nThis code will expire in " . self::CODE_EXPIRY_MINUTES . " minutes.\n\nIf you didn't request this code, please ignore this email.";
        } else {
            $appUrl = $_ENV['APP_URL'] ?? 'http://localhost:5173';
            $magicLink = "{$appUrl}/auth/verify?code={$code}&email=" . urlencode($email);
            $subject = 'Your Magic Login Link';
            $message = "Click the link below to log in:\n\n{$magicLink}\n\nThis link will expire in " . self::CODE_EXPIRY_MINUTES . " minutes.\n\nIf you didn't request this link, please ignore this email.";
        }

        $headers = "From: noreply@yourdomain.com\r\n";
        $headers .= "Reply-To: noreply@yourdomain.com\r\n";
        $headers .= "X-Mailer: PHP/" . phpversion();

        return mail($email, $subject, $message, $headers);
    }
}
