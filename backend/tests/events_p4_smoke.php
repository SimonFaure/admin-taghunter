<?php
// LOCAL ONLY end-to-end test of Events phase 4 (event day): staff link + PIN,
// lockout, day list, QR / reference scan, check-in idempotency + "latest wins",
// Playground feed + manifest version, device check-ins and team results through
// telemetry, results email. Uses licensee #1 on http://studio.taghunter.test and
// restores it. Run: php backend/tests/events_p4_smoke.php
if (stripos(PHP_OS, 'WIN') !== 0) die("local only\n");

require __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/EventsCheckin.php';
$db = Database::getInstance();
$B = 'http://studio.taghunter.test/backend/api';
$fails = 0;

function check(string $name, bool $ok, $info = null): void {
    global $fails;
    if (!$ok) $fails++;
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . ($ok || $info === null ? '' : '  -> ' . json_encode($info, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) . "\n";
}

function call(string $method, string $url, $body = null, array $headers = []): array {
    $ch = curl_init($url);
    $h = $headers;
    if ($body !== null) {
        $h[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $h, CURLOPT_TIMEOUT => 30]);
    $res = curl_exec($ch);
    return [(int)curl_getinfo($ch, CURLINFO_HTTP_CODE), json_decode((string)$res, true) ?? $res];
}

function uuid(): string {
    $h = bin2hex(random_bytes(16));
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-4' . substr($h, 13, 3) . '-a' . substr($h, 17, 3) . '-' . substr($h, 20, 12);
}

// Setup (tokens use server-local NOW(): auth compares expires_at with NOW()).
$backup = $db->fetch('SELECT events_enabled, legal_name, siret, vat_regime, address_line1, postal_code, city, country, legal_email, events_terms_version, events_terms_accepted_at FROM clients WHERE id = 1');
$terms = $db->fetch("SELECT value FROM events_platform_settings WHERE name = 'platform_terms_version'")['value'];
$db->query("UPDATE clients SET events_enabled = 1, legal_name = 'Zombie Quest SAS', siret = '73282932000074', vat_regime = 'exempt', address_line1 = '1 rue des Lacs',
    postal_code = '77450', city = 'Jablines', country = 'FR', legal_email = 'contact@zq.example', events_terms_version = ?, events_terms_accepted_at = NOW() WHERE id = 1", [$terms]);
$token = 'smoke_' . bin2hex(random_bytes(8));
$db->query("INSERT INTO auth_tokens (user_id, user_type, token, expires_at) VALUES (1, 'client', ?, NOW() + INTERVAL 2 HOUR)", [hash('sha256', $token)]);
$lic = ["X-Auth-Token: $token"];
$dev = ["Authorization: Bearer $token"];
$eventId = null;
$db->query("SET time_zone = '+00:00'");

try {
    // Event: free player ticket, one session in 2 hours (inside the device feed window).
    [$c, $r] = call('POST', "$B/events.php?action=create", ['title' => 'P4 Smoke', 'main_language' => 'fr'], $lic);
    $eventId = $r['event']['id'];
    $slug = $r['event']['slug'];
    call('POST', "$B/events.php?action=update", ['id' => $eventId, 'venue_city' => 'Jablines', 'team_size_min' => 1, 'require_player_details' => true, 'sales_cutoff_minutes' => 0], $lic);
    call('POST', "$B/events.php?action=content_save", ['id' => $eventId, 'lang' => 'fr', 'content' => ['title' => 'P4 Smoke', 'terms_text_md' => 'R.']], $lic);
    [$c, $r] = call('POST', "$B/events.php?action=ticket_types_save", ['id' => $eventId, 'types' => [['role' => 'player', 'label_i18n' => ['fr' => 'Survivant'], 'base_price_cents' => 0]]], $lic);
    $type = $r['ticket_types'][0]['id'];
    $start = (new DateTime('+2 hours', new DateTimeZone('Europe/Paris')))->format('Y-m-d\TH:i');
    [$c, $r] = call('POST', "$B/events.php?action=slots_save", ['id' => $eventId, 'slots' => [['starts_at' => $start, 'duration_minutes' => 90, 'capacity' => 20]]], $lic);
    check('session saved', $c === 200 && isset($r['slots'][0]['id']), [$c, $r]);
    $slotId = $r['slots'][0]['id'] ?? 0;
    [$c, $r] = call('POST', "$B/events.php?action=publish", ['id' => $eventId], $lic);
    check('event published', $c === 200, $r);

    $v0 = EventsCheckin::version($db, 1);
    $book = function (string $team, array $players) use ($B, $slug, $slotId, $type) {
        return call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotId, 'lang' => 'fr', 'team_name' => $team,
            'tickets' => array_map(fn($p) => ['ticket_type_id' => $type, 'first_name' => $p[0], 'age' => $p[1]], $players),
            'buyer' => ['first_name' => 'Claire', 'last_name' => 'Martin', 'email' => strtolower($team) . '@example.test', 'phone' => '0612345678'],
            'consents' => ['terms' => true, 'platform' => true]]);
    };
    [$c, $r1] = $book('Alpha', [['Léa', 30], ['Tom', 31], ['Zoé', 29]]);
    [$c, $r2] = $book('Beta', [['Max', 40]]);
    check('two bookings', !empty($r1['confirmed']) && !empty($r2['confirmed']), [$r1, $r2]);
    check('feed version bumped by bookings', EventsCheckin::version($db, 1) > $v0, [$v0, EventsCheckin::version($db, 1)]);
    $alpha = $db->fetch("SELECT * FROM bookings WHERE event_id = ? AND team_name = 'Alpha'", [$eventId]);
    $beta = $db->fetch("SELECT * FROM bookings WHERE event_id = ? AND team_name = 'Beta'", [$eventId]);
    $qrAlpha = EventsTokens::make(EventsTokens::QR, $alpha['uuid'], $alpha['token_nonce']);

    // ── Staff link + PIN ──
    [$c, $r] = call('POST', "$B/events.php?action=staff_link_create", ['id' => $eventId, 'label' => 'Accueil'], $lic);
    check('staff link created with 4-digit PIN', $c === 200 && preg_match('/^\d{4}$/', $r['pin'] ?? '') && str_contains($r['link']['url'] ?? '', '/checkin/'), $r);
    $linkId = $r['link']['id'];
    $pin = $r['pin'];
    $linkToken = substr($r['link']['url'], strrpos($r['link']['url'], '/') + 1);
    $wrong = $pin === '0000' ? '1111' : '0000';
    [$c, $r] = call('POST', "$B/events_checkin.php?action=staff_login", ['token' => $linkToken, 'pin' => $wrong]);
    check('wrong PIN refused', $c === 401 && $r['error'] === 'wrong_pin', [$c, $r]);
    for ($i = 0; $i < 4; $i++) [$c, $r] = call('POST', "$B/events_checkin.php?action=staff_login", ['token' => $linkToken, 'pin' => $wrong]);
    check('locked after 5 wrong PINs', $c === 423 && $r['error'] === 'locked', [$c, $r]);
    [$c, $r] = call('POST', "$B/events_checkin.php?action=staff_login", ['token' => $linkToken, 'pin' => $pin]);
    check('right PIN refused while locked', $c === 423, [$c, $r]);
    [$c, $r] = call('POST', "$B/events.php?action=staff_link_pin", ['id' => $eventId, 'link_id' => $linkId], $lic);
    $pin = $r['pin'] ?? '';
    [$c, $r] = call('POST', "$B/events_checkin.php?action=staff_login", ['token' => $linkToken, 'pin' => $pin]);
    check('new PIN unlocks and logs in', $c === 200 && strlen($r['session'] ?? '') === 64 && $r['event']['title'] === 'P4 Smoke', [$c, $r]);
    $staff = ['Authorization: Bearer ' . ($r['session'] ?? '')];
    [$c, $r] = call('POST', "$B/events_checkin.php?action=staff_login", ['token' => substr($linkToken, 0, -2) . 'xx', 'pin' => $pin]);
    check('tampered link refused', $c === 404, [$c, $r]);

    // ── Day list (staff: no contact details) ──
    [$c, $day] = call('GET', "$B/events_checkin.php?action=day", null, $staff);
    $bks = $day['slots'][0]['bookings'] ?? [];
    check('staff day: 1 session, 2 bookings', $c === 200 && count($day['slots'] ?? []) === 1 && count($bks) === 2 && $day['staff'] === true, $day);
    check('staff sees no email / phone / amounts', !isset($bks[0]['buyer_email']) && !isset($bks[0]['buyer_phone']) && !isset($bks[0]['total_cents']), $bks[0] ?? null);
    [$c, $dl] = call('GET', "$B/events_checkin.php?action=day&event_id=$eventId", null, $lic);
    check('licensee day includes contacts', $c === 200 && isset($dl['slots'][0]['bookings'][0]['buyer_email']), $dl['slots'][0]['bookings'][0] ?? $dl);

    // ── Scan ──
    [$c, $r] = call('POST', "$B/events_checkin.php?action=scan", ['code' => 'https://events.taghunter.fr/t/' . $qrAlpha], $staff);
    check('scan QR URL', $c === 200 && $r['booking']['team_name'] === 'Alpha' && count($r['booking']['tickets']) === 3, $r);
    [$c, $r] = call('POST', "$B/events_checkin.php?action=scan", ['code' => substr($beta['reference'], 3)], $staff);
    check('scan by typed reference (without TH-)', $c === 200 && $r['booking']['team_name'] === 'Beta', $r);
    [$c, $r] = call('POST', "$B/events_checkin.php?action=scan", ['code' => substr($qrAlpha, 0, -3) . 'AAA'], $staff);
    check('forged QR refused', $c === 404, $r);

    // ── Check-in: whole team, replay, latest wins ──
    $u1 = uuid();
    [$c, $r] = call('POST', "$B/events_checkin.php?action=checkin", ['client_uuid' => $u1, 'booking_id' => (int)$alpha['id'], 'ticket_ids' => null, 'action' => 'in'], $staff);
    check('whole team checked in', $c === 200 && count(array_filter($r['tickets'], fn($t) => $t['checked_in_at'])) === 3, $r);
    [$c, $r] = call('POST', "$B/events_checkin.php?action=checkin", ['client_uuid' => $u1, 'booking_id' => (int)$alpha['id'], 'ticket_ids' => null, 'action' => 'in'], $staff);
    check('replay is a no-op', $c === 200 && (int)$db->fetch('SELECT COUNT(*) n FROM checkins WHERE client_uuid = ?', [$u1])['n'] === 3, null);
    $tid = (int)$db->fetch('SELECT id FROM booking_tickets WHERE booking_id = ? ORDER BY position LIMIT 1', [$alpha['id']])['id'];
    call('POST', "$B/events_checkin.php?action=checkin", ['client_uuid' => uuid(), 'booking_id' => (int)$alpha['id'], 'ticket_ids' => [$tid], 'action' => 'undo', 'occurred_at' => gmdate('c', time() - 3600)], $staff);
    check('older offline undo does not override a newer check-in', $db->fetch('SELECT checked_in_at FROM booking_tickets WHERE id = ?', [$tid])['checked_in_at'] !== null, null);
    call('POST', "$B/events_checkin.php?action=checkin", ['client_uuid' => uuid(), 'booking_id' => (int)$alpha['id'], 'ticket_ids' => [$tid], 'action' => 'undo'], $staff);
    check('newer undo unchecks the ticket', $db->fetch('SELECT checked_in_at FROM booking_tickets WHERE id = ?', [$tid])['checked_in_at'] === null, null);
    [$c, $r] = call('GET', "$B/events.php?action=get&id=$eventId", null, $lic);
    check('editor counts arrivals', ($r['checkin_counts'] ?? null) === ['expected' => 4, 'arrived' => 2] && count($r['staff_links']) === 1, $r['checkin_counts'] ?? $r);

    // ── Playground feed ──
    [$c, $m] = call('GET', "$B/playground.php?action=get_user_data_update", null, $dev);
    check('manifest exposes event_bookings_version', $c === 200 && isset($m['event_bookings_version']), array_keys(is_array($m) ? $m : []));
    [$c, $feed] = call('GET', "$B/playground.php?action=get_event_bookings", null, $dev);
    $fa = array_values(array_filter($feed['bookings'] ?? [], fn($b) => $b['booking_uuid'] === $alpha['uuid']))[0] ?? null;
    check('feed has the bookings', $c === 200 && $fa && count($fa['players']) === 3 && $fa['team_name'] === 'Alpha', $feed);
    check('feed QR hash matches the ticket token', $fa && $fa['qr_hash'] === hash('sha256', $qrAlpha), $fa['qr_hash'] ?? null);
    check('feed carries no contact details', $fa && !isset($fa['buyer_email']) && !str_contains(json_encode($feed), '@example.test'), null);

    // ── Device check-in + results via telemetry ──
    $vBefore = EventsCheckin::version($db, 1);
    $betaTicket = (int)$db->fetch('SELECT id FROM booking_tickets WHERE booking_id = ?', [$beta['id']])['id'];
    [$c, $r] = call('POST', "$B/telemetry.php?action=ingest", ['events' => [
        ['event_uuid' => uuid(), 'event_type' => 'event_checkin', 'occurred_at' => gmdate('c'), 'payload' => ['client_uuid' => uuid(), 'booking_uuid' => $beta['uuid'], 'ticket_ids' => null, 'action' => 'in', 'occurred_at' => gmdate('c')]],
        ['event_uuid' => uuid(), 'event_type' => 'event_team_results', 'occurred_at' => gmdate('c'), 'payload' => ['summary_uuid' => uuid(), 'game_type' => 'mystery', 'played_at' => gmdate('c'),
            'teams' => [['booking_uuid' => $alpha['uuid'], 'team_name' => 'Alpha', 'score' => 870, 'rank' => 1, 'of_teams' => 2, 'elapsed_seconds' => 4980],
                        ['booking_uuid' => $beta['uuid'], 'team_name' => 'Beta', 'score' => 610, 'rank' => 2, 'of_teams' => 2, 'elapsed_seconds' => 5400],
                        ['booking_uuid' => uuid(), 'team_name' => 'Walk-in', 'score' => 1, 'rank' => 3, 'of_teams' => 3]]]],
    ]], $dev);
    check('telemetry accepts both event types', $c === 200 && array_column($r['results'] ?? [], 'status') === ['ok', 'ok'], $r);
    check('device check-in applied', $db->fetch('SELECT checked_in_at FROM booking_tickets WHERE id = ?', [$betaTicket])['checked_in_at'] !== null
        && $db->fetch("SELECT source FROM checkins WHERE booking_ticket_id = ? ORDER BY id DESC LIMIT 1", [$betaTicket])['source'] === 'playground', null);
    check('device check-in bumps feed version', EventsCheckin::version($db, 1) > $vBefore, null);
    check('results stored for booked teams only', (int)$db->fetch('SELECT COUNT(*) n FROM booking_results WHERE booking_id IN (?, ?)', [$alpha['id'], $beta['id']])['n'] === 2
        && (int)$db->fetch('SELECT score FROM booking_results WHERE booking_id = ?', [$alpha['id']])['score'] === 870, null);

    // ── Results email: only 15 min after the last update, once ──
    $n0 = EventsCheckin::sendResults($db);
    $db->query('UPDATE booking_results SET updated_at = UTC_TIMESTAMP() - INTERVAL 20 MINUTE WHERE booking_id IN (?, ?)', [$alpha['id'], $beta['id']]);
    $n1 = EventsCheckin::sendResults($db);
    $n2 = EventsCheckin::sendResults($db);
    check('results emails: wait 15 min, then once each', $n0 === 0 && $n1 === 2 && $n2 === 0, [$n0, $n1, $n2]);
    require_once __DIR__ . '/../utils/EventsEmails.php';
    $o = $db->fetch("SELECT id FROM email_outbox WHERE booking_id = ? AND kind = 'game_results'", [$alpha['id']]);
    EventsEmails::sendOne($db, (int)$o['id']);
    check('results email renders', $db->fetch('SELECT last_error FROM email_outbox WHERE id = ?', [$o['id']])['last_error'] === 'mailjet_not_configured', null);

    // ── Revoke ──
    call('POST', "$B/events.php?action=staff_link_revoke", ['id' => $eventId, 'link_id' => $linkId], $lic);
    [$c] = call('GET', "$B/events_checkin.php?action=day", null, $staff);
    check('revoked link ends staff sessions', $c === 401, $c);
} finally {
    if ($eventId) {
        $db->query('DELETE FROM email_outbox WHERE event_id = ?', [$eventId]);
        $db->query('DELETE FROM bookings WHERE event_id = ?', [$eventId]);
        $db->query('DELETE FROM events WHERE id = ?', [$eventId]);
    }
    $db->query('DELETE FROM auth_tokens WHERE token = ?', [hash('sha256', $token)]);
    $db->query('DELETE FROM public_rate_limits');
    $db->query('UPDATE clients SET events_enabled = ?, legal_name = ?, siret = ?, vat_regime = ?, address_line1 = ?, postal_code = ?, city = ?, country = ?, legal_email = ?,
        events_terms_version = ?, events_terms_accepted_at = ? WHERE id = 1', array_values($backup));
    @array_map('unlink', glob(__DIR__ . '/../storage/mail_preview/*') ?: []);
}
echo $fails ? "\n$fails FAILED\n" : "\nALL PASSED\n";
exit($fails ? 1 : 0);
