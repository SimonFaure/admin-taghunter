<?php
// Shared helpers for per-client offline PIN-recovery codes. One place so the
// admin API (recovery_codes.php), client creation (clients.php), and the
// backfill seed (database/recovery_codes_seed.php) all generate identically.
//
// A pool is 10 distinct 8-digit codes. The version is a plain integer bumped
// +1 per regenerate; devices re-sync when it changes. Codes are plaintext here
// (the admin reads one aloud); the device stores only salted hashes.

class RecoveryCodes {
    const POOL_SIZE = 10;
    const CODE_DIGITS = 8;

    public static function ensureTables($db): void {
        $db->query('
            CREATE TABLE IF NOT EXISTS recovery_codes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                client_id INT NOT NULL,
                code_index INT NOT NULL,
                code VARCHAR(16) NOT NULL,
                used_at DATETIME NULL DEFAULT NULL,
                used_device_label VARCHAR(255) NULL DEFAULT NULL,
                used_context VARCHAR(16) NULL DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_client_index (client_id, code_index),
                INDEX idx_client (client_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
        $db->query('
            CREATE TABLE IF NOT EXISTS recovery_codes_meta (
                client_id INT PRIMARY KEY,
                current_version INT NOT NULL DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
    }

    public static function currentVersion($db, int $clientId): int {
        $row = $db->fetch('SELECT current_version FROM recovery_codes_meta WHERE client_id = ?', [$clientId]);
        return (int)($row['current_version'] ?? 0);
    }

    public static function generateDistinct(int $count, int $digits): array {
        $max = (int)str_repeat('9', $digits); // 99999999 for 8 digits
        $codes = [];
        $seen = [];
        while (count($codes) < $count) {
            $n = random_int(0, $max);
            $code = str_pad((string)$n, $digits, '0', STR_PAD_LEFT);
            if (isset($seen[$code])) continue;
            $seen[$code] = true;
            $codes[] = $code;
        }
        return $codes;
    }

    // Replace the whole pool for a client with a fresh set and bump the version.
    // Returns the new pool as [['code_index'=>int,'code'=>string], ...].
    public static function regenerate($db, int $clientId): array {
        self::ensureTables($db);
        $newCodes = self::generateDistinct(self::POOL_SIZE, self::CODE_DIGITS);

        $conn = $db->getConnection();
        $conn->beginTransaction();
        try {
            $db->query('DELETE FROM recovery_codes WHERE client_id = ?', [$clientId]);
            foreach ($newCodes as $i => $code) {
                $db->query(
                    'INSERT INTO recovery_codes (client_id, code_index, code) VALUES (?, ?, ?)',
                    [$clientId, $i + 1, $code]
                );
            }
            $db->query(
                'INSERT INTO recovery_codes_meta (client_id, current_version) VALUES (?, 1)
                 ON DUPLICATE KEY UPDATE current_version = current_version + 1, updated_at = NOW()',
                [$clientId]
            );
            $conn->commit();
        } catch (Exception $e) {
            $conn->rollBack();
            throw $e;
        }

        $out = [];
        foreach ($newCodes as $i => $code) {
            $out[] = ['code_index' => $i + 1, 'code' => $code];
        }
        return $out;
    }

    // Idempotent: generate a pool only if the client has none. Returns true if
    // it generated one, false if codes already existed.
    public static function ensureForClient($db, int $clientId): bool {
        self::ensureTables($db);
        $row = $db->fetch('SELECT COUNT(*) AS n FROM recovery_codes WHERE client_id = ?', [$clientId]);
        if ((int)($row['n'] ?? 0) > 0) {
            return false;
        }
        self::regenerate($db, $clientId);
        return true;
    }
}
