<?php
// Shared helpers for a client's studio-authored Wi-Fi hotspot credentials.
// One place so client creation (clients.php), the admin edit endpoint, and the
// backfill seed (database/client_hotspot_seed.php) all derive + validate
// identically.
//
// Design: plans/studio-authoritative-hotspot-creds.md (grill-me 2026-06-30).
// Studio is the SOLE author of each client's hotspot SSID/password; playground
// pulls them on sync (get_lan_networks) and never auto-generates its own.
//
// The creds live in the existing `lan_networks` table (UNIQUE(client_id, ssid),
// is_default = the client's primary, version bumped on every edit so the
// playground manifest's lan_networks_version advances and devices re-pull).
//
// SSID/password constraints MUST match the playground validator in
// src-tauri/src/hotspot.rs (validate_creds): SSID 1-32 chars, password 8-63
// chars, neither may contain ; , " : \ (the WIFI: QR separators/escapes).

class ClientHotspot {
    const SSID_PREFIX = 'TagHunter-';
    const SSID_MAX = 32;
    const PASSWORD_LEN = 12;
    // Password alphabet matches playground lanCredentials.ts defaultPassword():
    // excludes ambiguous I/O/l/0/1 and every QR-unsafe char.
    const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const FORBIDDEN = [';', ',', '"', ':', '\\'];

    /** Derive a QR-safe SSID slug from a free-text client name. */
    public static function slugFromName(?string $name): string {
        $name = (string)$name;
        // Best-effort accent fold (é -> e). //TRANSLIT can emit ?/'' on failure,
        // so we strip anything non-[A-Za-z0-9] afterwards anyway.
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
        if ($ascii === false) $ascii = $name;
        // Collapse any run of non-alphanumerics to a single dash.
        $slug = preg_replace('/[^A-Za-z0-9]+/', '-', $ascii);
        $slug = trim((string)$slug, '-');
        // Leave room for the prefix inside the 32-char SSID ceiling.
        $maxSlug = self::SSID_MAX - strlen(self::SSID_PREFIX);
        if (strlen($slug) > $maxSlug) {
            $slug = rtrim(substr($slug, 0, $maxSlug), '-');
        }
        return $slug !== '' ? $slug : 'Hotspot';
    }

    /** The default SSID seeded at client creation: TagHunter-<slug>. */
    public static function defaultSsid(?string $name): string {
        return self::SSID_PREFIX . self::slugFromName($name);
    }

    /** A random 12-char WPA2 password from the QR-safe alphabet. */
    public static function randomPassword(): string {
        $alphabet = self::PASSWORD_ALPHABET;
        $n = strlen($alphabet) - 1;
        $out = '';
        for ($i = 0; $i < self::PASSWORD_LEN; $i++) {
            $out .= $alphabet[random_int(0, $n)];
        }
        return $out;
    }

    /** Validate an SSID against the playground rules. Returns an error string or null. */
    public static function validateSsid(string $ssid): ?string {
        $len = strlen($ssid);
        if ($len < 1 || $len > self::SSID_MAX) {
            return 'SSID must be 1-32 characters';
        }
        foreach (self::FORBIDDEN as $c) {
            if (strpos($ssid, $c) !== false) {
                return 'SSID must not contain ; , " : \\';
            }
        }
        return null;
    }

    /** Validate a WPA2 password against the playground rules. Returns an error string or null. */
    public static function validatePassword(string $password): ?string {
        $len = strlen($password);
        if ($len < 8 || $len > 63) {
            return 'Password must be 8-63 characters';
        }
        foreach (self::FORBIDDEN as $c) {
            if (strpos($password, $c) !== false) {
                return 'Password must not contain ; , " : \\';
            }
        }
        return null;
    }

    /** The next version for a client's hotspot rows (monotonic per client). */
    public static function nextVersion($db, int $clientId): int {
        $row = $db->fetch(
            'SELECT COALESCE(MAX(version), 0) AS v FROM lan_networks WHERE client_id = ?',
            [$clientId]
        );
        return (int)($row['v'] ?? 0) + 1;
    }

    /** True if the client already has at least one hotspot row. */
    public static function hasAny($db, int $clientId): bool {
        $row = $db->fetch('SELECT id FROM lan_networks WHERE client_id = ? LIMIT 1', [$clientId]);
        return !empty($row);
    }

    /**
     * Seed a client's primary hotspot if they have none. Returns true if a row
     * was created, false if the client already had one (idempotent). The SSID is
     * derived from the client name ONCE here and is frozen afterwards (a later
     * client rename does NOT re-derive it - admins edit the SSID explicitly).
     */
    public static function ensureForClient($db, int $clientId, ?string $name): bool {
        if (self::hasAny($db, $clientId)) {
            return false;
        }
        $ssid = self::defaultSsid($name);
        // Guard against a pathological name that somehow violates the rules.
        if (self::validateSsid($ssid) !== null) {
            $ssid = self::SSID_PREFIX . 'Hotspot';
        }
        $password = self::randomPassword();
        $db->query(
            'INSERT INTO lan_networks (client_id, ssid, password, source, is_default, version)
             VALUES (?, ?, ?, "hotspot", 1, 1)',
            [$clientId, $ssid, $password]
        );
        return true;
    }
}
