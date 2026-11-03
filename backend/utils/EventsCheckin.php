<?php
/**
 * Events phase 4 - event day: staff check-in links (+ PIN), check-ins from
 * any source (Studio, staff phone, Playground offline), the "today's bookings"
 * feed Playground caches, and booked teams' game results (results email).
 *
 * Check-in state = booking_tickets.checked_in_at. Every action is logged in
 * `checkins` with a client_uuid (an offline device can replay safely) and the
 * action with the latest occurred_at wins for a ticket.
 */
require_once __DIR__ . '/EventsRepo.php';
require_once __DIR__ . '/EventsTokens.php';
require_once __DIR__ . '/PublicRateLimit.php';

class EventsCheckin {
    const PIN_MAX_FAILS = 5;
    const PIN_LOCK_MINUTES = 15;
    const SESSION_HOURS = 18;
    const FEED_PAST_HOURS = 12;
    const FEED_AHEAD_HOURS = 36;

    // ── Feed version (Playground manifest) ───────────────────────────────

    public static function migrated($db): bool {
        static $m = null;
        if ($m === null) {
            try {
                $db->fetch('SELECT 1 FROM event_bookings_meta LIMIT 1');
                $m = true;
            } catch (Throwable $e) {
                $m = false;
            }
        }
        return $m;
    }

    public static function bumpForBooking($db, int $bookingId): void {
        try {
            $db->query(
                'INSERT INTO event_bookings_meta (client_id, current_version) SELECT client_id, 1 FROM bookings WHERE id = ?
                 ON DUPLICATE KEY UPDATE current_version = current_version + 1',
                [$bookingId]
            );
        } catch (Throwable $e) {
            // Before migration p4: nothing to bump.
        }
    }

    public static function version($db, int $clientId): int {
        $r = $db->fetch('SELECT current_version FROM event_bookings_meta WHERE client_id = ?', [$clientId]);
        return (int)($r['current_version'] ?? 0);
    }

    // ── Staff links ──────────────────────────────────────────────────────

    /** Create a link; returns [row, pin]. The PIN is only ever shown here. */
    public static function createLink($db, int $eventId, ?string $label): array {
        $pin = str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        $db->query(
            'INSERT INTO event_staff_links (event_id, label, link_nonce, pin_hash) VALUES (?, ?, ?, ?)',
            [$eventId, $label !== null && $label !== '' ? mb_substr($label, 0, 80) : null, EventsTokens::nonce(), password_hash($pin, PASSWORD_DEFAULT)]
        );
        return [$db->fetch('SELECT * FROM event_staff_links WHERE id = ?', [(int)$db->lastInsertId()]), $pin];
    }

    /** New PIN for an existing link (unlocks it); returns the PIN. */
    public static function resetPin($db, int $linkId): string {
        $pin = str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
        $db->query('UPDATE event_staff_links SET pin_hash = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?', [password_hash($pin, PASSWORD_DEFAULT), $linkId]);
        $db->query('DELETE FROM event_staff_sessions WHERE link_id = ?', [$linkId]);
        return $pin;
    }

    public static function revokeLink($db, int $linkId): void {
        $db->query('UPDATE event_staff_links SET revoked_at = UTC_TIMESTAMP() WHERE id = ?', [$linkId]);
        $db->query('DELETE FROM event_staff_sessions WHERE link_id = ?', [$linkId]);
    }

    public static function linkUrl(array $link): string {
        $token = EventsTokens::make(EventsTokens::STAFF, (string)$link['id'], $link['link_nonce']);
        return PaymentsConfig::studioBase() . '/checkin/' . $token;
    }

    public static function linkFromToken($db, string $token): ?array {
        $id = EventsTokens::idOf($token);
        if ($id === null || !ctype_digit($id)) return null;
        $l = $db->fetch('SELECT * FROM event_staff_links WHERE id = ?', [(int)$id]);
        if (!$l || !EventsTokens::verify(EventsTokens::STAFF, $token, (string)$l['id'], $l['link_nonce'])) return null;
        return $l;
    }

    /**
     * Link + PIN -> session token. Throws RuntimeException(code):
     * invalid_link | revoked | locked | wrong_pin | rate_limited.
     */
    public static function login($db, string $token, string $pin): array {
        $ip = PublicRateLimit::clientIp();
        if (!PublicRateLimit::hit($db, "staff-pin:$ip", 20, 900)) throw new RuntimeException('rate_limited');
        $link = self::linkFromToken($db, $token);
        if (!$link) throw new RuntimeException('invalid_link');
        if ($link['revoked_at']) throw new RuntimeException('revoked');
        if ($link['locked_until'] && strtotime($link['locked_until'] . ' UTC') > time()) throw new RuntimeException('locked');
        if (!preg_match('/^\d{4}$/', $pin) || !password_verify($pin, $link['pin_hash'])) {
            $fails = (int)$link['failed_attempts'] + 1;
            $lock = $fails >= self::PIN_MAX_FAILS;
            $db->query(
                'UPDATE event_staff_links SET failed_attempts = ?, locked_until = ' . ($lock ? 'UTC_TIMESTAMP() + INTERVAL ' . self::PIN_LOCK_MINUTES . ' MINUTE' : 'locked_until') . ' WHERE id = ?',
                [$lock ? 0 : $fails, $link['id']]
            );
            throw new RuntimeException($lock ? 'locked' : 'wrong_pin');
        }
        $session = bin2hex(random_bytes(32));
        $db->query(
            'INSERT INTO event_staff_sessions (token_hash, link_id, expires_at, ip) VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ' . self::SESSION_HOURS . ' HOUR, ?)',
            [hash('sha256', $session), $link['id'], $ip]
        );
        $db->query('UPDATE event_staff_links SET failed_attempts = 0, locked_until = NULL, last_used_at = UTC_TIMESTAMP() WHERE id = ?', [$link['id']]);
        return ['session' => $session, 'link' => $link];
    }

    /** Valid staff session -> its link row, else null. */
    public static function sessionLink($db, string $session): ?array {
        if (!preg_match('/^[0-9a-f]{64}$/', $session)) return null;
        $r = $db->fetch(
            'SELECT l.* FROM event_staff_sessions s JOIN event_staff_links l ON l.id = s.link_id
              WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP() AND l.revoked_at IS NULL',
            [hash('sha256', $session)]
        );
        return $r ?: null;
    }

    public static function purgeSessions($db): int {
        return $db->query('DELETE FROM event_staff_sessions WHERE expires_at < UTC_TIMESTAMP()')->rowCount();
    }

    // ── Check-in ─────────────────────────────────────────────────────────

    /**
     * Apply a check-in or undo to some tickets (null = all tickets) of a booking.
     * Idempotent per (client_uuid, ticket). Returns the booking's tickets after.
     */
    public static function apply($db, array $b, ?array $ticketIds, string $action, string $source, ?string $occurredAt, string $clientUuid, ?int $staffLinkId = null, ?int $deviceId = null): array {
        if (!in_array($action, ['in', 'undo'], true)) throw new InvalidArgumentException('invalid_action');
        if ($b['status'] !== 'confirmed') throw new InvalidArgumentException('not_confirmed');
        $at = $occurredAt && strtotime($occurredAt) ? gmdate('Y-m-d H:i:s', strtotime($occurredAt)) : gmdate('Y-m-d H:i:s');
        $tickets = $db->fetchAll('SELECT id FROM booking_tickets WHERE booking_id = ? ORDER BY position', [$b['id']]);
        $ids = array_map(fn($t) => (int)$t['id'], $tickets);
        if ($ticketIds !== null) $ids = array_values(array_intersect($ids, array_map('intval', $ticketIds)));
        foreach ($ids as $tid) {
            $n = $db->query(
                'INSERT IGNORE INTO checkins (client_uuid, booking_id, booking_ticket_id, event_id, slot_id, action, source, staff_link_id, device_id, occurred_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$clientUuid, $b['id'], $tid, $b['event_id'], $b['slot_id'], $action, $source, $staffLinkId, $deviceId, $at]
            )->rowCount();
            if (!$n) continue; // replay
            // Latest action wins (an older offline "in" can't override a newer "undo").
            $latest = $db->fetch('SELECT action, occurred_at FROM checkins WHERE booking_ticket_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1', [$tid]);
            $db->query('UPDATE booking_tickets SET checked_in_at = ? WHERE id = ?', [$latest['action'] === 'in' ? $latest['occurred_at'] : null, $tid]);
        }
        if ($ids) {
            EventsBooking::log($db, (int)$b['id'], $action === 'in' ? 'checked_in' : 'checkin_undone', $source, $staffLinkId ?? $deviceId, ['tickets' => count($ids)]);
        }
        return self::ticketsOf($db, (int)$b['id']);
    }

    public static function ticketsOf($db, int $bookingId): array {
        return array_map(fn($t) => [
            'id' => (int)$t['id'], 'label' => $t['label_snapshot'], 'role' => $t['role'],
            'first_name' => $t['participant_first_name'], 'age' => $t['participant_age'] !== null ? (int)$t['participant_age'] : null,
            'checked_in_at' => $t['checked_in_at'] ? str_replace(' ', 'T', substr($t['checked_in_at'], 0, 19)) . 'Z' : null,
        ], $db->fetchAll('SELECT * FROM booking_tickets WHERE booking_id = ? ORDER BY position', [$bookingId]));
    }

    /**
     * The check-in screen's data for an event: slots of the window (or one
     * day), with every confirmed booking. $staff = true hides money and
     * contact details (volunteers see names only).
     */
    public static function day($db, array $event, ?string $date, bool $staff): array {
        $tz = new DateTimeZone($event['timezone']);
        if ($date && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            $from = (new DateTime("$date 00:00:00", $tz))->setTimezone(new DateTimeZone('UTC'));
            $to = (clone $from)->modify('+1 day');
        } else {
            // Default: the next day that has sessions, from "now - 12 h".
            $next = $db->fetch(
                "SELECT MIN(starts_at) s FROM event_slots WHERE event_id = ? AND status <> 'cancelled' AND starts_at > UTC_TIMESTAMP() - INTERVAL 12 HOUR",
                [$event['id']]
            );
            $start = $next['s'] ? new DateTime($next['s'], new DateTimeZone('UTC')) : new DateTime('now', new DateTimeZone('UTC'));
            $localDay = (clone $start)->setTimezone($tz)->format('Y-m-d');
            $from = (new DateTime("$localDay 00:00:00", $tz))->setTimezone(new DateTimeZone('UTC'));
            $to = (clone $from)->modify('+1 day');
        }
        $slots = $db->fetchAll(
            "SELECT * FROM event_slots WHERE event_id = ? AND status <> 'cancelled' AND starts_at >= ? AND starts_at < ? ORDER BY starts_at",
            [$event['id'], $from->format('Y-m-d H:i:s'), $to->format('Y-m-d H:i:s')]
        );
        $days = array_map(fn($r) => (new DateTime($r['s'], new DateTimeZone('UTC')))->setTimezone($tz)->format('Y-m-d'), $db->fetchAll(
            "SELECT DISTINCT DATE_FORMAT(starts_at, '%Y-%m-%d %H:00:00') s FROM event_slots WHERE event_id = ? AND status <> 'cancelled' ORDER BY s",
            [$event['id']]
        ));
        $out = [];
        foreach ($slots as $s) {
            $bookings = [];
            foreach ($db->fetchAll("SELECT * FROM bookings WHERE slot_id = ? AND status = 'confirmed' ORDER BY team_name, buyer_last_name", [$s['id']]) as $b) {
                $row = [
                    'id' => (int)$b['id'],
                    'reference' => $b['reference'],
                    'team_name' => $b['team_name'],
                    'buyer_name' => trim(($b['buyer_first_name'] ?? '') . ' ' . ($b['buyer_last_name'] ?? '')),
                    'source' => $b['source'],
                    'payment_due' => $b['payment_status'] === 'offline_due',
                    'tickets' => self::ticketsOf($db, (int)$b['id']),
                ];
                if (!$staff) {
                    $row['buyer_email'] = $b['buyer_email'];
                    $row['buyer_phone'] = $b['buyer_phone'];
                    $row['total_cents'] = (int)$b['total_cents'];
                }
                $bookings[] = $row;
            }
            $start = strtotime($s['starts_at'] . ' UTC');
            $out[] = [
                'id' => (int)$s['id'],
                'starts_at' => gmdate('c', $start),
                'ends_at' => gmdate('c', $start + (int)$s['duration_minutes'] * 60),
                'label' => EventsRepo::tr($s['label_i18n'], $event['main_language']),
                'capacity' => (int)$s['capacity'],
                'bookings' => $bookings,
            ];
        }
        $content = EventsRepo::content(EventsRepo::contents($db, (int)$event['id']), $event['main_language'], $event['main_language']);
        return [
            'event' => ['id' => (int)$event['id'], 'title' => $content['title'] ?? $event['slug'], 'timezone' => $event['timezone'], 'slug' => $event['slug']],
            'date' => (clone $from)->setTimezone($tz)->format('Y-m-d'),
            'days' => array_values(array_unique($days)),
            'slots' => $out,
        ];
    }

    /** Booking of $eventId from a QR token / URL / reference typed by hand. */
    public static function findByCode($db, int $eventId, string $code): ?array {
        $code = trim($code);
        if (preg_match('#/t/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)#', $code, $m)) $code = $m[1];
        if (str_contains($code, '.')) {
            $uuid = EventsTokens::idOf($code);
            $b = $uuid ? $db->fetch('SELECT * FROM bookings WHERE uuid = ? AND event_id = ?', [$uuid, $eventId]) : null;
            return $b && EventsTokens::verify(EventsTokens::QR, $code, $b['uuid'], $b['token_nonce']) ? $b : null;
        }
        $ref = strtoupper(preg_replace('/[^A-Za-z0-9-]/', '', $code));
        if ($ref !== '' && !str_starts_with($ref, 'TH-')) $ref = 'TH-' . $ref;
        return $db->fetch('SELECT * FROM bookings WHERE reference = ? AND event_id = ?', [$ref, $eventId]) ?: null;
    }

    // ── Playground feed ──────────────────────────────────────────────────

    /** Confirmed bookings of slots in [now - 12 h, now + 36 h] for every event of a licensee. No email, phone or money. */
    public static function feed($db, int $clientId): array {
        $rows = $db->fetchAll(
            "SELECT b.*, s.starts_at, s.duration_minutes, s.label_i18n AS slot_label, s.scenario_id, sc.uniqid AS scenario_uniqid,
                    e.id AS eid, e.main_language, e.slug, e.timezone
               FROM bookings b
               JOIN event_slots s ON s.id = b.slot_id
               JOIN events e ON e.id = b.event_id
               LEFT JOIN scenarios sc ON sc.id = s.scenario_id
              WHERE b.client_id = ? AND b.status = 'confirmed' AND s.status <> 'cancelled'
                AND s.starts_at > UTC_TIMESTAMP() - INTERVAL " . self::FEED_PAST_HOURS . " HOUR
                AND s.starts_at < UTC_TIMESTAMP() + INTERVAL " . self::FEED_AHEAD_HOURS . " HOUR
              ORDER BY s.starts_at, b.team_name",
            [$clientId]
        );
        $titles = [];
        $out = [];
        foreach ($rows as $r) {
            $eid = (int)$r['eid'];
            if (!isset($titles[$eid])) {
                $c = EventsRepo::content(EventsRepo::contents($db, $eid), $r['main_language'], $r['main_language']);
                $titles[$eid] = $c['title'] ?? $r['slug'];
            }
            $start = strtotime($r['starts_at'] . ' UTC');
            $out[] = [
                'booking_uuid' => $r['uuid'],
                'reference' => $r['reference'],
                'event' => ['id' => $eid, 'title' => $titles[$eid], 'timezone' => $r['timezone']],
                'slot' => [
                    'id' => (int)$r['slot_id'],
                    'starts_at' => gmdate('c', $start),
                    'duration_minutes' => (int)$r['duration_minutes'],
                    'label' => EventsRepo::tr($r['slot_label'], $r['main_language']),
                    'scenario_uniqid' => $r['scenario_uniqid'],
                ],
                'team_name' => $r['team_name'],
                'language' => $r['language'],
                'buyer_name' => trim(($r['buyer_first_name'] ?? '') . ' ' . ($r['buyer_last_name'] ?? '')),
                'payment_due' => $r['payment_status'] === 'offline_due',
                'players' => self::ticketsOf($db, (int)$r['id']),
                // The QR code holds .../t/<token>; devices match sha256(token) offline.
                'qr_hash' => hash('sha256', EventsTokens::make(EventsTokens::QR, $r['uuid'], $r['token_nonce'])),
            ];
        }
        return ['version' => self::version($db, $clientId), 'generated_at' => gmdate('c'), 'bookings' => $out];
    }

    // ── Results (Playground -> Studio -> email) ──────────────────────────

    /** Upsert per-team results of one finished game. Teams without a known booking are ignored. */
    public static function ingestResults($db, int $clientId, array $p): int {
        $n = 0;
        foreach (is_array($p['teams'] ?? null) ? array_slice($p['teams'], 0, 500) : [] as $t) {
            $uuid = (string)($t['booking_uuid'] ?? '');
            if (!preg_match(EventsTokens::UUID_RE, $uuid)) continue;
            $b = $db->fetch('SELECT id FROM bookings WHERE uuid = ? AND client_id = ?', [$uuid, $clientId]);
            if (!$b) continue;
            $playedAt = !empty($p['played_at']) && strtotime($p['played_at']) ? gmdate('Y-m-d H:i:s', strtotime($p['played_at'])) : null;
            $db->query(
                'INSERT INTO booking_results (booking_id, summary_uuid, game_type, scenario_uniqid, score, `rank`, teams_count, elapsed_seconds, played_at, data)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE summary_uuid = VALUES(summary_uuid), game_type = VALUES(game_type), scenario_uniqid = VALUES(scenario_uniqid),
                    score = VALUES(score), `rank` = VALUES(`rank`), teams_count = VALUES(teams_count), elapsed_seconds = VALUES(elapsed_seconds),
                    played_at = VALUES(played_at), data = VALUES(data)',
                [
                    $b['id'], mb_substr((string)($p['summary_uuid'] ?? ''), 0, 64) ?: null, mb_substr((string)($p['game_type'] ?? ''), 0, 32) ?: null,
                    mb_substr((string)($p['scenario_uniqid'] ?? ''), 0, 64) ?: null,
                    isset($t['score']) ? (int)$t['score'] : null, isset($t['rank']) ? (int)$t['rank'] : null,
                    isset($t['of_teams']) ? (int)$t['of_teams'] : null, isset($t['elapsed_seconds']) ? (int)$t['elapsed_seconds'] : null,
                    $playedAt, json_encode(['team_name' => $t['team_name'] ?? null], JSON_UNESCAPED_UNICODE),
                ]
            );
            $n++;
        }
        return $n;
    }

    /** Cron: results email 15 min after the last update (late score edits settle first), once. */
    public static function sendResults($db): int {
        $rows = $db->fetchAll(
            "SELECT r.booking_id FROM booking_results r JOIN bookings b ON b.id = r.booking_id
              WHERE r.sent_at IS NULL AND r.updated_at < UTC_TIMESTAMP() - INTERVAL 15 MINUTE
                AND b.status = 'confirmed' AND b.buyer_email IS NOT NULL AND b.anonymised_at IS NULL
              LIMIT 200"
        );
        foreach ($rows as $r) {
            $n = $db->query('UPDATE booking_results SET sent_at = UTC_TIMESTAMP() WHERE booking_id = ? AND sent_at IS NULL', [$r['booking_id']])->rowCount();
            if ($n) EventsEmails::queue($db, 'game_results', (int)$r['booking_id']);
        }
        return count($rows);
    }
}

require_once __DIR__ . '/EventsBooking.php';
require_once __DIR__ . '/EventsEmails.php';
