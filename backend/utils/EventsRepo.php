<?php
/**
 * Events data access shared by the Studio editor (api/events.php), the public
 * site (api/events_public.php), bookings and emails.
 *
 * "Taken" places = confirmed bookings + pending bookings whose hold has not
 * expired (manual bookings are confirmed too). Correctness never depends on
 * the cron: an expired hold simply stops counting.
 */
require_once __DIR__ . '/PaymentsConfig.php';

class EventsRepo {
    const LANGS = ['fr', 'en', 'es'];
    const ROLES = ['player', 'individual'];
    const AUDIENCES = ['all', 'kids', 'family', 'adults'];

    /** SQL fragment: booking still occupies its places. Alias b. */
    const TAKEN_SQL = "(b.status = 'confirmed' OR (b.status = 'pending' AND b.expires_at > UTC_TIMESTAMP()))";

    /** Pin the DB session to UTC (DEFAULT CURRENT_TIMESTAMP / NOW() then match UTC_TIMESTAMP()). */
    public static function utcSession($db): void {
        $db->query("SET time_zone = '+00:00'");
    }

    public static function uuid(): string {
        $d = random_bytes(16);
        $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
        $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
        $h = bin2hex($d);
        return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
    }

    /** Pick a translation from {"fr": "...", "en": "..."}: lang, then fallback, then any. */
    public static function tr($i18n, string $lang, string $fallback = 'fr'): string {
        if (is_string($i18n)) {
            $d = json_decode($i18n, true);
            $i18n = is_array($d) ? $d : [];
        }
        if (!is_array($i18n)) return '';
        foreach ([$lang, $fallback] as $l) {
            if (isset($i18n[$l]) && trim((string)$i18n[$l]) !== '') return (string)$i18n[$l];
        }
        foreach ($i18n as $v) {
            if (is_string($v) && trim($v) !== '') return $v;
        }
        return '';
    }

    /** Keep only known languages, trimmed strings, max length. */
    public static function cleanI18n($in, int $max = 190): array {
        $out = [];
        if (!is_array($in)) return $out;
        foreach (self::LANGS as $l) {
            if (isset($in[$l])) {
                $v = trim((string)$in[$l]);
                if ($v !== '') $out[$l] = mb_substr($v, 0, $max);
            }
        }
        return $out;
    }

    public static function json($v) {
        if ($v === null || $v === '') return null;
        if (is_array($v)) return $v;
        $d = json_decode((string)$v, true);
        return is_array($d) ? $d : null;
    }

    // ── Loading ──────────────────────────────────────────────────────────

    public static function eventById($db, int $id): ?array {
        return $db->fetch('SELECT * FROM events WHERE id = ?', [$id]) ?: null;
    }

    public static function eventBySlug($db, string $slug): ?array {
        return $db->fetch('SELECT * FROM events WHERE slug = ?', [$slug]) ?: null;
    }

    public static function languages(array $event): array {
        $langs = self::json($event['languages']) ?: [];
        $langs = array_values(array_intersect(self::LANGS, array_unique(array_merge([$event['main_language']], $langs))));
        return $langs ?: [$event['main_language']];
    }

    /** lang => content array */
    public static function contents($db, int $eventId): array {
        $out = [];
        foreach ($db->fetchAll('SELECT lang, content FROM event_contents WHERE event_id = ?', [$eventId]) as $r) {
            $out[$r['lang']] = self::json($r['content']) ?: [];
        }
        return $out;
    }

    /** Content in $lang, falling back field by field to the main language. */
    public static function content(array $contents, string $lang, string $main): array {
        $base = $contents[$main] ?? [];
        $own = $contents[$lang] ?? [];
        foreach ($own as $k => $v) {
            if ($v === '' || $v === null || $v === []) continue;
            $base[$k] = $v;
        }
        return $base;
    }

    /** Ticket types (+ steps), ordered. id => type. */
    public static function ticketTypes($db, int $eventId, bool $activeOnly = false): array {
        $rows = $db->fetchAll(
            'SELECT * FROM event_ticket_types WHERE event_id = ?' . ($activeOnly ? ' AND active = 1' : '') . ' ORDER BY position, id',
            [$eventId]
        );
        $types = [];
        foreach ($rows as $r) {
            $r['id'] = (int)$r['id'];
            $r['base_price_cents'] = (int)$r['base_price_cents'];
            $r['label_i18n'] = self::json($r['label_i18n']) ?: [];
            $r['description_i18n'] = self::json($r['description_i18n']) ?: [];
            $r['steps'] = [];
            $types[$r['id']] = $r;
        }
        if ($types) {
            $in = implode(',', array_keys($types));
            foreach ($db->fetchAll("SELECT * FROM event_price_steps WHERE ticket_type_id IN ($in) ORDER BY position, id") as $s) {
                $types[(int)$s['ticket_type_id']]['steps'][] = [
                    'id' => (int)$s['id'],
                    'price_cents' => (int)$s['price_cents'],
                    'ends_at' => $s['ends_at'] ? strtotime($s['ends_at'] . ' UTC') : null,
                    'ends_at_raw' => $s['ends_at'],
                    'ends_after_sold' => $s['ends_after_sold'] !== null ? (int)$s['ends_after_sold'] : null,
                    'label_i18n' => self::json($s['label_i18n']) ?: [],
                ];
            }
        }
        return $types;
    }

    /** Slots with the ticket types they sell. id => slot. */
    public static function slots($db, int $eventId): array {
        $slots = [];
        foreach ($db->fetchAll('SELECT * FROM event_slots WHERE event_id = ? ORDER BY starts_at, id', [$eventId]) as $s) {
            $s['id'] = (int)$s['id'];
            $s['capacity'] = (int)$s['capacity'];
            $s['duration_minutes'] = (int)$s['duration_minutes'];
            $s['label_i18n'] = self::json($s['label_i18n']) ?: [];
            $s['types'] = [];
            $slots[$s['id']] = $s;
        }
        if ($slots) {
            $in = implode(',', array_keys($slots));
            foreach ($db->fetchAll("SELECT * FROM event_slot_ticket_types WHERE slot_id IN ($in)") as $r) {
                $slots[(int)$r['slot_id']]['types'][(int)$r['ticket_type_id']] = $r['cap'] !== null ? (int)$r['cap'] : null;
            }
        }
        return $slots;
    }

    public static function questions($db, int $eventId, bool $activeOnly = true): array {
        $out = [];
        foreach ($db->fetchAll('SELECT * FROM event_questions WHERE event_id = ?' . ($activeOnly ? ' AND active = 1' : '') . ' ORDER BY position, id', [$eventId]) as $q) {
            $q['id'] = (int)$q['id'];
            $q['required'] = (int)$q['required'] === 1;
            $q['label_i18n'] = self::json($q['label_i18n']) ?: [];
            $q['options_i18n'] = self::json($q['options_i18n']) ?: [];
            $out[] = $q;
        }
        return $out;
    }

    // ── Availability ─────────────────────────────────────────────────────

    /** Tickets taken per slot: slot_id => ['total' => n, 'by_type' => [type_id => n]]. */
    public static function takenBySlot($db, int $eventId): array {
        $out = [];
        $rows = $db->fetchAll(
            'SELECT b.slot_id, bt.ticket_type_id, COUNT(*) AS n
               FROM bookings b JOIN booking_tickets bt ON bt.booking_id = b.id
              WHERE b.event_id = ? AND ' . self::TAKEN_SQL . '
              GROUP BY b.slot_id, bt.ticket_type_id',
            [$eventId]
        );
        foreach ($rows as $r) {
            $sid = (int)$r['slot_id'];
            $out[$sid] ??= ['total' => 0, 'by_type' => []];
            $out[$sid]['total'] += (int)$r['n'];
            $out[$sid]['by_type'][(int)$r['ticket_type_id']] = (int)$r['n'];
        }
        return $out;
    }

    /** Tickets taken per type across the whole event (drives fill-level price tiers). */
    public static function takenByType($db, int $eventId): array {
        $out = [];
        $rows = $db->fetchAll(
            'SELECT bt.ticket_type_id, COUNT(*) AS n
               FROM bookings b JOIN booking_tickets bt ON bt.booking_id = b.id
              WHERE b.event_id = ? AND ' . self::TAKEN_SQL . '
              GROUP BY bt.ticket_type_id',
            [$eventId]
        );
        foreach ($rows as $r) $out[(int)$r['ticket_type_id']] = (int)$r['n'];
        return $out;
    }

    // ── Add-ons & promo codes (phase 3) ──────────────────────────────────

    /** Add-ons with their variants. id => addon (variants keyed by id). Fail-soft before migration p3. */
    public static function addons($db, int $eventId, bool $activeOnly = false): array {
        try {
            $rows = $db->fetchAll('SELECT * FROM event_addons WHERE event_id = ?' . ($activeOnly ? ' AND active = 1' : '') . ' ORDER BY position, id', [$eventId]);
        } catch (Throwable $e) {
            return [];
        }
        $out = [];
        foreach ($rows as $a) {
            $a['id'] = (int)$a['id'];
            $a['price_cents'] = (int)$a['price_cents'];
            $a['label_i18n'] = self::json($a['label_i18n']) ?: [];
            $a['description_i18n'] = self::json($a['description_i18n']) ?: [];
            $a['variants'] = [];
            $out[$a['id']] = $a;
        }
        if ($out) {
            $in = implode(',', array_keys($out));
            foreach ($db->fetchAll("SELECT * FROM event_addon_variants WHERE addon_id IN ($in)" . ($activeOnly ? ' AND active = 1' : '') . ' ORDER BY position, id') as $v) {
                $v['id'] = (int)$v['id'];
                $v['label_i18n'] = self::json($v['label_i18n']) ?: [];
                $v['unit_price_cents'] = $v['price_cents'] !== null ? (int)$v['price_cents'] : $out[(int)$v['addon_id']]['price_cents'];
                $out[(int)$v['addon_id']]['variants'][$v['id']] = $v;
            }
        }
        return $out;
    }

    /** Add-on units taken per variant (confirmed + live holds). */
    public static function addonTaken($db, int $eventId): array {
        try {
            $rows = $db->fetchAll(
                'SELECT ba.variant_id, SUM(ba.qty) AS n FROM bookings b JOIN booking_addons ba ON ba.booking_id = b.id
                  WHERE b.event_id = ? AND ' . self::TAKEN_SQL . ' GROUP BY ba.variant_id',
                [$eventId]
            );
        } catch (Throwable $e) {
            return [];
        }
        $out = [];
        foreach ($rows as $r) $out[(int)$r['variant_id']] = (int)$r['n'];
        return $out;
    }

    /** Active promo code row by code (case-insensitive), or null. */
    public static function promoByCode($db, int $eventId, string $code, bool $forUpdate = false): ?array {
        $code = strtoupper(trim($code));
        if ($code === '') return null;
        try {
            $r = $db->fetch('SELECT * FROM event_promo_codes WHERE event_id = ? AND code = ? AND active = 1' . ($forUpdate ? ' FOR UPDATE' : ''), [$eventId, $code]);
        } catch (Throwable $e) {
            return null;
        }
        return $r ?: null;
    }

    /** Bookings currently using a promo code (confirmed + live holds). */
    public static function promoUses($db, int $promoId, ?int $exceptBookingId = null): int {
        $r = $db->fetch('SELECT COUNT(*) n FROM bookings b WHERE b.promo_code_id = ? AND ' . self::TAKEN_SQL . ($exceptBookingId ? ' AND b.id <> ' . (int)$exceptBookingId : ''), [$promoId]);
        return (int)($r['n'] ?? 0);
    }

    /** Why a promo can't be used now, or null. */
    public static function promoError($db, ?array $promo): ?string {
        if (!$promo) return 'promo_invalid';
        $now = time();
        if ($promo['valid_from'] && $now < strtotime($promo['valid_from'] . ' UTC')) return 'promo_not_started';
        if ($promo['valid_until'] && $now > strtotime($promo['valid_until'] . ' UTC')) return 'promo_expired';
        if ($promo['max_uses'] !== null && self::promoUses($db, (int)$promo['id']) >= (int)$promo['max_uses']) return 'promo_used_up';
        return null;
    }

    /** Effective per-slot cap of a type (slot override, then type default), null = only slot capacity. */
    public static function typeCap(array $slot, array $type): ?int {
        $id = (int)$type['id'];
        if (array_key_exists($id, $slot['types']) && $slot['types'][$id] !== null) return (int)$slot['types'][$id];
        return $type['cap_per_slot'] !== null ? (int)$type['cap_per_slot'] : null;
    }

    /** Sales open for this slot right now? (event-level checks done by the caller) */
    public static function slotOnSale(array $event, array $slot, int $now): bool {
        if ($slot['status'] !== 'open') return false;
        $start = strtotime($slot['starts_at'] . ' UTC');
        return $now < $start - (int)$event['sales_cutoff_minutes'] * 60;
    }

    /** Recompute events.first_slot_at / last_slot_end_at (directory + anonymisation). */
    public static function refreshSlotCache($db, int $eventId): void {
        $db->query(
            "UPDATE events e SET
                first_slot_at = (SELECT MIN(starts_at) FROM event_slots s WHERE s.event_id = e.id AND s.status <> 'cancelled'),
                last_slot_end_at = (SELECT MAX(starts_at + INTERVAL duration_minutes MINUTE) FROM event_slots s WHERE s.event_id = e.id AND s.status <> 'cancelled')
             WHERE e.id = ?",
            [$eventId]
        );
    }

    /** Media files of an event live in media/evt_<uniqid>/ (served directly, CORS *). */
    public static function mediaUrl(array $event, ?string $file): ?string {
        if (!$file) return null;
        if (preg_match('#^https?://#', $file)) return $file;
        return PaymentsConfig::studioBase() . '/media/evt_' . $event['uniqid'] . '/' . rawurlencode(basename($file));
    }

    public static function mediaDir(array $event): string {
        return __DIR__ . '/../../media/evt_' . $event['uniqid'];
    }
}
