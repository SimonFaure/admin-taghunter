<?php
/**
 * Who may order (Commandes). Stored in order_settings under 'access' as
 * {"all": bool, "client_ids": [int]}: "all" = every licensee; when off, only the
 * listed licensees. The list is kept while "all" is on so switching back restores it.
 * No row (or no orders tables yet) = open to all, the behaviour before this switch.
 *
 * Kept free of dependencies: secure_auth.php reads it on login / token validation.
 * Memory: project_studio_commandes_equipment_orders.
 */
class OrdersAccess {
    /** @return array{all: bool, client_ids: int[]} */
    public static function settings($db): array {
        try {
            $row = $db->fetch("SELECT value FROM order_settings WHERE name = 'access'");
        } catch (Throwable $e) {
            return ['all' => true, 'client_ids' => []];
        }
        $v = json_decode($row['value'] ?? '', true);
        if (!is_array($v)) return ['all' => true, 'client_ids' => []];
        $ids = array_values(array_unique(array_filter(array_map('intval', is_array($v['client_ids'] ?? null) ? $v['client_ids'] : []), fn($i) => $i > 0)));
        sort($ids);
        return ['all' => ($v['all'] ?? true) !== false, 'client_ids' => $ids];
    }

    public static function save($db, bool $all, array $clientIds, ?int $adminId): array {
        $ids = array_values(array_unique(array_filter(array_map('intval', $clientIds), fn($i) => $i > 0)));
        if ($ids) {
            // Drop ids that are not licensees.
            $in = implode(',', array_fill(0, count($ids), '?'));
            $ids = array_map(fn($r) => (int)$r['id'], $db->fetchAll("SELECT id FROM clients WHERE id IN ($in)", $ids));
        }
        sort($ids);
        $value = ['all' => $all, 'client_ids' => $ids];
        $db->execute(
            "INSERT INTO order_settings (name, value, updated_by) VALUES ('access', ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)",
            [json_encode($value), $adminId]
        );
        return $value;
    }

    public static function clientEnabled($db, int $clientId): bool {
        $s = self::settings($db);
        return $s['all'] || in_array($clientId, $s['client_ids'], true);
    }

    /** Past requests stay reachable ("Mes demandes") even when ordering is off. */
    public static function clientHasRequests($db, int $clientId): bool {
        try {
            return (bool)$db->fetch('SELECT 1 FROM order_requests WHERE client_id = ? LIMIT 1', [$clientId]);
        } catch (Throwable $e) {
            return false;
        }
    }

    /** Flags for the licensee auth payload. */
    public static function forClient($db, int $clientId): array {
        return [
            'orders_enabled' => self::clientEnabled($db, $clientId),
            'orders_history' => self::clientHasRequests($db, $clientId),
        ];
    }
}
