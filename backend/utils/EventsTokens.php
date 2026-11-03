<?php
/**
 * Unguessable links for Events (booking management, QR ticket, Stripe return,
 * event preview, staff check-in). Tokens are DERIVED, never stored:
 *
 *   token = base64url(id) "." base64url(HMAC-SHA256(secret, purpose|id|nonce)[0..15])
 *
 * The id part only finds the row; the MAC proves the link was issued by us for
 * that purpose. Rotating the row's nonce revokes every link of that row; a
 * database leak exposes no working link. Secret: config events_token_secret.
 */
require_once __DIR__ . '/PaymentsConfig.php';

class EventsTokens {
    const MANAGE = 'manage';
    const QR = 'qr';
    const RETURN = 'return';
    const PREVIEW = 'preview';
    const STAFF = 'staff';

    private static function secret(): string {
        $s = (string)PaymentsConfig::get('events_token_secret', '');
        if (strlen($s) < 32) throw new RuntimeException('events_token_secret is not configured (32+ chars)');
        return $s;
    }

    public static function b64(string $raw): string {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function unb64(string $s): ?string {
        if ($s === '' || preg_match('/[^A-Za-z0-9_-]/', $s)) return null;
        $raw = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
        return $raw === false ? null : $raw;
    }

    private static function mac(string $purpose, string $id, string $nonce, int $len): string {
        return substr(hash_hmac('sha256', $purpose . '|' . $id . '|' . $nonce, self::secret(), true), 0, $len);
    }

    /** QR tokens are shorter (12-byte MAC) so the code stays easy to scan. */
    private static function macLen(string $purpose): int {
        return $purpose === self::QR ? 12 : 16;
    }

    const UUID_RE = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';

    /** UUIDs travel as their 16 raw bytes (22 chars) to keep links and QR codes short. */
    private static function packId(string $id): string {
        return preg_match(self::UUID_RE, $id) ? hex2bin(str_replace('-', '', $id)) : $id;
    }

    private static function unpackId(string $raw): string {
        if (strlen($raw) === 16 && !preg_match('/^[ -~]{16}$/', $raw)) {
            $h = bin2hex($raw);
            return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
        }
        return $raw;
    }

    public static function make(string $purpose, string $id, string $nonce): string {
        return self::b64(self::packId($id)) . '.' . self::b64(self::mac($purpose, $id, $nonce, self::macLen($purpose)));
    }

    /** The id inside a token (not yet trusted: call verify() with the row's nonce). */
    public static function idOf(string $token): ?string {
        $parts = explode('.', $token);
        if (count($parts) !== 2) return null;
        $raw = self::unb64($parts[0]);
        if ($raw === null || $raw === '' || strlen($raw) > 64) return null;
        return self::unpackId($raw);
    }

    public static function verify(string $purpose, string $token, string $id, string $nonce): bool {
        $parts = explode('.', $token);
        if (count($parts) !== 2) return false;
        $mac = self::unb64($parts[1]);
        if ($mac === null) return false;
        return hash_equals(self::mac($purpose, $id, $nonce, self::macLen($purpose)), $mac)
            && hash_equals(self::b64(self::packId($id)), $parts[0]);
    }

    public static function nonce(): string {
        return bin2hex(random_bytes(8)); // CHAR(16)
    }
}
