<?php
/**
 * Events feature: platform settings (events_platform_settings), per-licensee
 * switch + commission, and the "can this licensee sell right now" gate.
 * Migration: database/add_events_p1_payments.sql. Everything here fails CLOSED
 * when the migration has not run yet (feature hidden, no sales).
 */
class EventsSettings {
    const DEFAULT_COMMISSION_BP = 300;      // 3 %
    const DEFAULT_COMMISSION_FIXED = 50;    // 0.50 EUR per paid ticket

    /**
     * Eurozone countries a licensee can sell from in v1 (EUR only, Stripe
     * Connect supported). Bulgaria uses the euro since 2026-01-01.
     */
    const COUNTRIES = ['AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE',
                       'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];

    private static ?bool $migrated = null;

    public static function migrated($db): bool {
        if (self::$migrated === null) {
            try {
                $row = $db->fetch(
                    "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'events_enabled'"
                );
                self::$migrated = $row && (int)$row['n'] > 0;
            } catch (Throwable $e) {
                self::$migrated = false;
            }
        }
        return self::$migrated;
    }

    /** Admin switch for one licensee. False before the migration. */
    public static function clientEnabled($db, int $clientId): bool {
        if (!self::migrated($db)) return false;
        try {
            $row = $db->fetch('SELECT events_enabled FROM clients WHERE id = ?', [$clientId]);
            return $row && (int)$row['events_enabled'] === 1;
        } catch (Throwable $e) {
            return false;
        }
    }

    // ── Platform settings ────────────────────────────────────────────────

    public static function all($db): array {
        $out = [];
        try {
            foreach ($db->fetchAll('SELECT name, value FROM events_platform_settings') as $r) {
                $out[$r['name']] = $r['value'];
            }
        } catch (Throwable $e) {
            // Table missing: callers get defaults.
        }
        return $out;
    }

    public static function get($db, string $name, ?string $default = null): ?string {
        $all = self::all($db);
        return array_key_exists($name, $all) ? $all[$name] : $default;
    }

    public static function set($db, string $name, ?string $value, ?int $userId): void {
        $db->query(
            'INSERT INTO events_platform_settings (name, value, updated_by) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)',
            [$name, $value, $userId]
        );
    }

    /** Platform default commission [bp, fixed_cents]. */
    public static function defaultCommission($db): array {
        $all = self::all($db);
        return [
            isset($all['commission_bp_default']) ? (int)$all['commission_bp_default'] : self::DEFAULT_COMMISSION_BP,
            isset($all['commission_fixed_cents_default']) ? (int)$all['commission_fixed_cents_default'] : self::DEFAULT_COMMISSION_FIXED,
        ];
    }

    /**
     * Effective commission for a licensee row (needs events_commission_bp and
     * events_commission_fixed_cents). NULL columns fall back to the default.
     * Returns ['bp' =>, 'fixed_cents' =>, 'custom' => bool].
     */
    public static function commissionFor($db, array $client): array {
        [$bp, $fixed] = self::defaultCommission($db);
        $customBp = $client['events_commission_bp'] ?? null;
        $customFixed = $client['events_commission_fixed_cents'] ?? null;
        return [
            'bp' => $customBp !== null ? (int)$customBp : $bp,
            'fixed_cents' => $customFixed !== null ? (int)$customFixed : $fixed,
            'custom' => $customBp !== null || $customFixed !== null,
        ];
    }

    // ── Sales gate ───────────────────────────────────────────────────────

    /**
     * Why this licensee cannot take NEW bookings right now, or null when it
     * can. Existing bookings are never affected. $paid = false skips the Stripe
     * check (free events / manual bookings).
     *
     * Billing lock (decision 27): the Playground licence clock
     * (billing_overdue_since + billing_grace_days); for a licensee without
     * Playground, the GO clock. Same arithmetic as goClientGateReason().
     */
    public static function salesGateReason($db, int $clientId, bool $paid = true): ?string {
        if (!self::migrated($db)) return 'events_unavailable';
        $c = $db->fetch(
            'SELECT id, events_enabled, playground_enabled, billing_overdue_since, billing_grace_days,
                    go_enabled, go_billing_overdue_since, go_billing_grace_days
             FROM clients WHERE id = ?',
            [$clientId]
        );
        if (!$c) return 'unknown_client';
        if ((int)$c['events_enabled'] !== 1) return 'events_disabled';

        if ((int)($c['playground_enabled'] ?? 1) === 1) {
            $since = $c['billing_overdue_since'] ?? null;
            $grace = (int)($c['billing_grace_days'] ?? 30);
        } elseif ((int)($c['go_enabled'] ?? 0) === 1) {
            $since = $c['go_billing_overdue_since'] ?? null;
            $grace = (int)($c['go_billing_grace_days'] ?? 30);
        } else {
            $since = null;
            $grace = 0;
        }
        if (!empty($since)) {
            $ts = strtotime($since);
            if ($ts !== false && time() > $ts + $grace * 86400) return 'subscription_inactive';
        }

        if ($paid) {
            $acct = $db->fetch(
                'SELECT charges_enabled, disconnected_at FROM stripe_connected_accounts WHERE client_id = ?',
                [$clientId]
            );
            if (!$acct || (int)$acct['charges_enabled'] !== 1 || !empty($acct['disconnected_at'])) {
                return 'payments_unavailable';
            }
        }
        return null;
    }
}
