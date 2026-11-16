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

    // Tag Hunter brand: black + red (#c30017), Playground logo (public/email/).
    private const TH_RED = '#c30017';
    private const TH_LOGO = 'https://studio.taghunter.fr/email/taghunter-playground-logo.png';

    /** Shared Tag Hunter layout: white card, Playground logo, red accent bar, black footer. */
    private static function brandedEmail(string $title, string $intro, string $body): string {
        $red = self::TH_RED;
        $logo = self::TH_LOGO;
        return <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{$title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f2f2f2; color: #000000;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f2f2f2; padding: 32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e0e0e0;">
                    <tr>
                        <td style="padding: 32px 40px 24px; text-align: center; background-color: #ffffff;">
                            <img src="{$logo}" alt="Tag Hunter Playground" width="170" height="150" style="display: block; margin: 0 auto; width: 170px; height: auto; border: 0;">
                        </td>
                    </tr>
                    <tr><td style="height: 4px; line-height: 4px; font-size: 0; background-color: {$red};">&nbsp;</td></tr>
                    <tr>
                        <td style="padding: 36px 40px 40px; text-align: center;">
                            <h1 style="color: #000000; font-size: 26px; font-weight: 700; margin: 0 0 10px 0; letter-spacing: 0.5px;">{$title}</h1>
                            <p style="color: #444444; font-size: 16px; margin: 0 0 32px 0; line-height: 1.5;">{$intro}</p>
                            {$body}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 22px 40px; text-align: center; background-color: #000000;">
                            <p style="color: #bdbdbd; font-size: 12px; margin: 0; line-height: 1.6;">
                                This is an automated message from <span style="color: #ffffff; font-weight: 700;">TAG HUNTER</span>.<br>
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

    private static function getOTPEmailHTML(string $code): string {
        $expiryMinutes = self::CODE_EXPIRY_MINUTES;
        $red = self::TH_RED;
        $body = <<<HTML
<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto 28px auto;">
    <tr>
        <td style="background-color: #000000; border-radius: 10px; border-bottom: 4px solid {$red}; padding: 22px 36px;">
            <div style="color: #ffffff; font-size: 44px; font-weight: 700; letter-spacing: 12px; font-family: 'Courier New', Courier, monospace;">{$code}</div>
        </td>
    </tr>
</table>
<p style="color: #222222; font-size: 15px; margin: 0 0 8px 0; line-height: 1.6;">This code will expire in <strong style="color: {$red};">{$expiryMinutes} minutes</strong></p>
<p style="color: #777777; font-size: 14px; margin: 0; line-height: 1.6;">If you didn't request this code, please ignore this email.</p>
HTML;
        return self::brandedEmail('Your Login Code', 'Enter this code to access your Tag Hunter dashboard', $body);
    }

    private static function getMagicLinkEmailHTML(string $magicLink): string {
        $expiryMinutes = self::CODE_EXPIRY_MINUTES;
        $red = self::TH_RED;
        $body = <<<HTML
<a href="{$magicLink}" style="display: inline-block; background-color: {$red}; color: #ffffff; text-decoration: none; padding: 16px 44px; border-radius: 8px; font-size: 16px; font-weight: 700; margin: 0 0 28px 0;">Login to Tag Hunter</a>
<p style="color: #222222; font-size: 15px; margin: 0 0 8px 0; line-height: 1.6;">This link will expire in <strong style="color: {$red};">{$expiryMinutes} minutes</strong></p>
<p style="color: #777777; font-size: 14px; margin: 0; line-height: 1.6;">If you didn't request this link, please ignore this email.</p>
HTML;
        return self::brandedEmail('Your Magic Login Link', 'Click the button below to access your Tag Hunter dashboard', $body);
    }
}
