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
            $subject = 'Your Tag Hunter Login Code';
            $message = self::getOTPEmailHTML($code);
        } else {
            $appUrl = $_ENV['APP_URL'] ?? 'http://localhost:5173';
            $magicLink = "{$appUrl}/auth/verify?code={$code}&email=" . urlencode($email);
            $subject = 'Your Tag Hunter Magic Login Link';
            $message = self::getMagicLinkEmailHTML($magicLink);
        }

        $headers = "From: Tag Hunter <noreply@taghunter.fr>\r\n";
        $headers .= "Reply-To: noreply@taghunter.fr\r\n";
        $headers .= "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "X-Mailer: PHP/" . phpversion();

        return mail($email, $subject, $message, $headers);
    }

    private static function getOTPEmailHTML(string $code): string {
        $expiryMinutes = self::CODE_EXPIRY_MINUTES;
        return <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Login Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);">
                    <tr>
                        <td style="padding: 48px 40px; text-align: center; background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
                            <img src="https://admin.taghunter.fr/logo_tag_hunter.png" alt="Tag Hunter" style="height: 80px; width: auto; margin-bottom: 24px;">
                            <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0 0 12px 0;">Your Login Code</h1>
                            <p style="color: #94a3b8; font-size: 16px; margin: 0; line-height: 1.5;">Enter this code to access your Tag Hunter dashboard</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 48px 40px; text-align: center;">
                            <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border-radius: 12px; padding: 32px; margin: 0 0 32px 0;">
                                <div style="color: #ffffff; font-size: 48px; font-weight: 700; letter-spacing: 12px; font-family: 'Courier New', monospace;">{$code}</div>
                            </div>
                            <p style="color: #cbd5e1; font-size: 15px; margin: 0 0 8px 0; line-height: 1.6;">This code will expire in <strong style="color: #ffffff;">{$expiryMinutes} minutes</strong></p>
                            <p style="color: #64748b; font-size: 14px; margin: 0; line-height: 1.6;">If you didn't request this code, please ignore this email.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 40px; text-align: center; background-color: #0f172a; border-top: 1px solid #334155;">
                            <p style="color: #64748b; font-size: 13px; margin: 0; line-height: 1.5;">
                                This is an automated message from Tag Hunter.<br>
                                Please do not reply to this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;
    }

    private static function getMagicLinkEmailHTML(string $magicLink): string {
        $expiryMinutes = self::CODE_EXPIRY_MINUTES;
        return <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Login Link</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f172a; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);">
                    <tr>
                        <td style="padding: 48px 40px; text-align: center; background: linear-gradient(135deg, #1e293b 0%, #334155 100%);">
                            <img src="https://admin.taghunter.fr/logo_tag_hunter.png" alt="Tag Hunter" style="height: 80px; width: auto; margin-bottom: 24px;">
                            <h1 style="color: #ffffff; font-size: 28px; font-weight: 700; margin: 0 0 12px 0;">Your Magic Login Link</h1>
                            <p style="color: #94a3b8; font-size: 16px; margin: 0; line-height: 1.5;">Click the button below to access your Tag Hunter dashboard</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 48px 40px; text-align: center;">
                            <a href="{$magicLink}" style="display: inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-size: 16px; font-weight: 600; margin: 0 0 32px 0;">Login to Tag Hunter</a>
                            <p style="color: #cbd5e1; font-size: 15px; margin: 0 0 8px 0; line-height: 1.6;">This link will expire in <strong style="color: #ffffff;">{$expiryMinutes} minutes</strong></p>
                            <p style="color: #64748b; font-size: 14px; margin: 0; line-height: 1.6;">If you didn't request this link, please ignore this email.</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px 40px; text-align: center; background-color: #0f172a; border-top: 1px solid #334155;">
                            <p style="color: #64748b; font-size: 13px; margin: 0; line-height: 1.5;">
                                This is an automated message from Tag Hunter.<br>
                                Please do not reply to this email.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
HTML;
    }
}
