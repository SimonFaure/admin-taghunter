<?php

class DeviceManager {
    public static function findOrCreate(
        object $db,
        int $clientId,
        string $deviceUniq,
        array $metadata = []
    ): int {
        $existing = $db->fetch(
            'SELECT id FROM devices WHERE device_uniq = ? AND client_id = ?',
            [$deviceUniq, $clientId]
        );

        if ($existing) {
            $deviceId = (int)$existing['id'];
            self::updateMetadata($db, $deviceId, $metadata);
            return $deviceId;
        }

        $db->execute(
            'INSERT INTO devices (client_id, device_uniq, device_label, os, os_version, playground_version, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [
                $clientId,
                $deviceUniq,
                $metadata['device_label'] ?? null,
                $metadata['os'] ?? null,
                $metadata['os_version'] ?? null,
                $metadata['app_version'] ?? '',
            ]
        );

        return (int)$db->lastInsertId();
    }

    public static function updateMetadata(object $db, int $deviceId, array $metadata): void {
        $fields = [];
        $params = [];

        foreach (['device_label', 'os', 'os_version'] as $col) {
            if (array_key_exists($col, $metadata) && $metadata[$col] !== null) {
                $fields[] = "$col = ?";
                $params[] = $metadata[$col];
            }
        }

        if (!empty($metadata['app_version'])) {
            $fields[] = 'playground_version = ?';
            $params[] = $metadata['app_version'];
        }

        $fields[] = 'last_seen_at = NOW()';
        $fields[] = 'updated_at = NOW()';

        $params[] = $deviceId;

        $db->execute(
            'UPDATE devices SET ' . implode(', ', $fields) . ' WHERE id = ?',
            $params
        );
    }

    public static function bumpLastSeen(object $db, int $deviceId): void {
        $db->execute('UPDATE devices SET last_seen_at = NOW() WHERE id = ?', [$deviceId]);
    }

    public static function listForClient(object $db, int $clientId): array {
        return $db->fetchAll(
            'SELECT d.id, d.device_uniq, d.device_label, d.os, d.os_version,
                    d.playground_version AS app_version,
                    d.created_at, d.updated_at, d.last_seen_at,
                    (SELECT COUNT(*) FROM auth_tokens t
                       WHERE t.device_id = d.id
                         AND t.revoked = 0
                         AND t.expires_at > NOW()) AS active_sessions
             FROM devices d
             WHERE d.client_id = ?
             ORDER BY d.last_seen_at DESC, d.created_at DESC',
            [$clientId]
        );
    }

    public static function listActiveForClient(object $db, int $clientId): array {
        return $db->fetchAll(
            'SELECT DISTINCT d.id, d.device_uniq, d.device_label, d.os, d.os_version,
                    d.playground_version AS app_version,
                    d.last_seen_at
             FROM devices d
             INNER JOIN auth_tokens t ON t.device_id = d.id
             WHERE d.client_id = ?
               AND t.revoked = 0
               AND t.expires_at > NOW()
             ORDER BY d.last_seen_at DESC',
            [$clientId]
        );
    }

    public static function countActiveDevicesForClient(object $db, int $clientId): int {
        $row = $db->fetch(
            'SELECT COUNT(DISTINCT d.id) AS n
             FROM devices d
             INNER JOIN auth_tokens t ON t.device_id = d.id
             WHERE d.client_id = ?
               AND t.revoked = 0
               AND t.expires_at > NOW()',
            [$clientId]
        );

        return (int)($row['n'] ?? 0);
    }

    public static function revoke(object $db, int $clientId, int $deviceId): bool {
        $existing = $db->fetch(
            'SELECT id FROM devices WHERE id = ? AND client_id = ?',
            [$deviceId, $clientId]
        );

        if (!$existing) {
            return false;
        }

        $db->execute('DELETE FROM devices WHERE id = ?', [$deviceId]);
        return true;
    }

    public static function findIdForToken(object $db, string $tokenHash): ?int {
        $row = $db->fetch(
            'SELECT device_id FROM auth_tokens WHERE token = ?',
            [$tokenHash]
        );

        if (!$row || $row['device_id'] === null) {
            return null;
        }

        return (int)$row['device_id'];
    }
}
