<?php
// Licensee customers ("Clients" in the FR UI): the licensee's OWN customers.
// NOT `clients` (= the licensee). Shared by customers.php (CRUD), telemetry.php
// (playground quick-creates + game assignments), playground.php (device sync)
// and statistics.php. Schema: database/add_licensee_customers.sql.
//
// Ids are UUID v4 (playgrounds create customers offline). Game assignments
// live on game_summaries.customer_*; customer_assigned_at (UTC, ms) decides
// between a studio edit and a playground edit: strictly newest wins.

require_once __DIR__ . '/TokenManager.php';

class LicenseeCustomers {
    const MAX_MERGE_HOPS = 5;

    // Guard for a studio whose DB predates add_licensee_customers.sql: every
    // caller falls back to its pre-customers behaviour.
    public static function migrated(): bool {
        static $migrated = null;
        if ($migrated === null) {
            try {
                Database::getInstance()->fetch('SELECT customer_id, customer_assigned_at FROM game_summaries LIMIT 1');
                Database::getInstance()->fetch('SELECT id FROM licensee_customers LIMIT 1');
                $migrated = true;
            } catch (Exception $e) {
                $migrated = false;
            }
        }
        return $migrated;
    }

    public static function uuidV4(): string {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    public static function isUuid($s): bool {
        return is_string($s)
            && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $s) === 1;
    }

    // Comparison key for type codes / labels: lowercase, no accents, single spaces.
    private static function typeKey(string $s): string {
        $s = mb_strtolower(trim(preg_replace('/\s+/u', ' ', $s)));
        return strtr($s, [
            'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e', 'à' => 'a', 'â' => 'a', 'á' => 'a', 'î' => 'i',
            'ï' => 'i', 'í' => 'i', 'ô' => 'o', 'ó' => 'o', 'ù' => 'u', 'û' => 'u', 'ú' => 'u', 'ü' => 'u',
            'ç' => 'c', 'ñ' => 'n',
        ]);
    }

    // The admin-managed types (customer_types), cached per request.
    public static function types(): array {
        static $types = null;
        if ($types === null) {
            try {
                $types = Database::getInstance()->fetchAll(
                    'SELECT code, label_fr, label_en, label_es, sort_order, active FROM customer_types ORDER BY sort_order, label_fr'
                );
            } catch (Exception $e) {
                $types = [];
            }
        }
        return $types;
    }

    // Free text -> a type code, or null: the code itself or any of its labels
    // (FR/EN/ES, any case / accents) - an import column says "École" or "school".
    // A few common synonyms of the default types are accepted too.
    public static function normalizeType($raw): ?string {
        if ($raw === null) return null;
        $k = self::typeKey((string)$raw);
        if ($k === '') return null;
        $codes = [];
        foreach (self::types() as $t) {
            $codes[$t['code']] = true;
            foreach (['code', 'label_fr', 'label_en', 'label_es'] as $f) {
                if ($t[$f] !== null && self::typeKey($t[$f]) === $k) return $t['code'];
            }
        }
        $synonyms = [
            'societe' => 'company', 'asso' => 'association', 'colegio' => 'school', 'individual' => 'private',
        ];
        $code = $synonyms[$k] ?? null;
        return $code !== null && isset($codes[$code]) ? $code : null;
    }

    // Slug for a new type code from its label ("Comité d'entreprise" -> comite_d_entreprise).
    public static function typeCodeFromLabel(string $label): string {
        $s = preg_replace('/[^a-z0-9]+/', '_', self::typeKey($label));
        $s = trim($s, '_');
        return substr($s !== '' ? $s : 'type', 0, 32);
    }

    // Trimmed, bounded string or null.
    public static function str($v, int $max): ?string {
        if ($v === null) return null;
        $s = trim((string)$v);
        if ($s === '') return null;
        return mb_substr($s, 0, $max);
    }

    // "Y-m-d H:i:s.v" in UTC (DATETIME(3) column, written explicitly - never
    // NOW(3), whose session timezone may not be UTC).
    public static function utcNowMs(): string {
        return (new DateTime('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.v');
    }

    // ISO-8601 from a device -> UTC DATETIME(3), clamped to "now" (a device
    // clock running ahead must not win every future conflict). Null if unparsable.
    public static function isoToUtc($iso): ?string {
        if (!is_string($iso) || trim($iso) === '') return null;
        try {
            $dt = new DateTime($iso);
        } catch (Exception $e) {
            return null;
        }
        $dt->setTimezone(new DateTimeZone('UTC'));
        $now = new DateTime('now', new DateTimeZone('UTC'));
        if ($dt > $now) $dt = $now;
        return $dt->format('Y-m-d H:i:s.v');
    }

    // UTC DATETIME(3) from the DB -> "2026-10-15T09:12:00.123Z" (string-comparable
    // on the playground side).
    public static function utcToIso($dt): ?string {
        if ($dt === null || $dt === '') return null;
        try {
            $d = new DateTime((string)$dt, new DateTimeZone('UTC'));
        } catch (Exception $e) {
            return null;
        }
        return $d->format('Y-m-d\TH:i:s.v\Z');
    }

    public static function bumpVersion($db, int $clientId): void {
        $db->execute(
            'INSERT INTO licensee_customers_meta (client_id, current_version) VALUES (?, 1)
             ON DUPLICATE KEY UPDATE current_version = current_version + 1',
            [$clientId]
        );
    }

    public static function version($db, int $clientId): int {
        try {
            $row = $db->fetch('SELECT current_version FROM licensee_customers_meta WHERE client_id = ?', [$clientId]);
            return $row ? (int)$row['current_version'] : 0;
        } catch (Exception $e) {
            return 0;
        }
    }

    // The row for $id (any state), or null when unknown / another licensee's.
    public static function find($db, int $clientId, string $id): ?array {
        $row = $db->fetch('SELECT * FROM licensee_customers WHERE id = ? AND client_id = ?', [$id, $clientId]);
        return $row ?: null;
    }

    // Follow merge tombstones to the final row. Null when unknown.
    public static function resolve($db, int $clientId, string $id): ?array {
        $row = self::find($db, $clientId, $id);
        for ($i = 0; $row && !empty($row['merged_into_id']) && $i < self::MAX_MERGE_HOPS; $i++) {
            $row = self::find($db, $clientId, $row['merged_into_id']);
        }
        return $row;
    }

    // Customer id a playground-pushed game should be stored under:
    //   merged  -> its final target
    //   deleted -> restored (it has a game now)
    //   unknown -> placeholder from the snapshot name the game carries (the
    //              `customer_upsert` event may still be queued behind it)
    //   another licensee's id -> null (customer dropped, game still stored)
    public static function resolveForIngest($db, int $clientId, string $id, ?string $snapshotName): ?string {
        if (!self::isUuid($id)) return null;
        $row = self::resolve($db, $clientId, $id);
        if ($row) {
            if (!empty($row['deleted_at'])) {
                $db->execute('UPDATE licensee_customers SET deleted_at = NULL WHERE id = ?', [$row['id']]);
                self::bumpVersion($db, $clientId);
            }
            return $row['id'];
        }
        $foreign = $db->fetch('SELECT client_id FROM licensee_customers WHERE id = ?', [$id]);
        if ($foreign) {
            error_log('[customers] game for client ' . $clientId . ' references customer ' . $id . ' of client ' . $foreign['client_id']);
            return null;
        }
        $name = self::str($snapshotName, 190) ?? '?';
        $db->execute(
            'INSERT IGNORE INTO licensee_customers (id, client_id, name, created_source) VALUES (?, ?, ?, ?)',
            [$id, $clientId, $name, 'playground']
        );
        self::bumpVersion($db, $clientId);
        return $id;
    }

    // Auth for customers.php: a licensee token (scoped to itself, any
    // client_id param ignored) or an admin token/session (client_id required).
    public static function requireAuth($db): array {
        $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
        $type = null;
        $actorId = null;
        if (!empty($token)) {
            $tokenData = TokenManager::validateToken($db, $token);
            if ($tokenData) {
                $type = ($tokenData['user_type'] ?? '') === 'admin' ? 'admin' : 'client';
                $actorId = (int)$tokenData['user_id'];
            }
        }
        if ($type === null && isset($_SESSION['user_id'])) {
            $type = 'admin';
            $actorId = (int)$_SESSION['user_id'];
        }
        if ($type === null) {
            jsonResponse(['error' => 'Unauthorized'], 401);
        }
        if ($type === 'client') {
            return ['clientId' => $actorId, 'actor' => 'client', 'actorId' => $actorId];
        }
        $clientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : 0;
        if ($clientId <= 0 || !$db->fetch('SELECT id FROM clients WHERE id = ?', [$clientId])) {
            jsonResponse(['error' => 'client_id is required'], 400);
        }
        return ['clientId' => $clientId, 'actor' => 'admin', 'actorId' => $actorId];
    }
}
