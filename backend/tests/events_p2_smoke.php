<?php
// LOCAL ONLY smoke test of the Events phase-2 APIs against http://studio.taghunter.test.
// Creates a throwaway event for licensee #1 with temporary auth tokens, books
// through the public API, then deletes everything it created.
// Run: php backend/tests/events_p2_smoke.php
if (stripos(PHP_OS, 'WIN') !== 0) die("local only\n");

require __DIR__ . '/../database/Database.php';
$db = Database::getInstance();
$db->query("SET time_zone = '+00:00'");
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
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $json = json_decode((string)$res, true);
    return [$code, $json ?? $res];
}

// ── Setup: licensee #1 with Events on, legal info + terms, temp token ──
$client = $db->fetch('SELECT * FROM clients WHERE id = 1');
$backup = $db->fetch('SELECT events_enabled, legal_name, siret, vat_regime, vat_default_bp, address_line1, postal_code, city, country, legal_email, events_terms_version, events_terms_accepted_at, slug FROM clients WHERE id = 1');
$terms = $db->fetch("SELECT value FROM events_platform_settings WHERE name = 'platform_terms_version'")['value'];
$db->query("UPDATE clients SET events_enabled = 1, legal_name = 'Zombie Quest SAS', siret = '73282932000074', vat_regime = 'subject', vat_default_bp = 2000,
    vat_number = 'FR44732829320', address_line1 = '1 rue des Lacs', postal_code = '77450', city = 'Jablines', country = 'FR',
    legal_email = 'contact@zq.example', events_terms_version = ?, events_terms_accepted_at = UTC_TIMESTAMP() WHERE id = 1", [$terms]);
$token = 'smoke_' . bin2hex(random_bytes(8));
// expires_at is server-local time (TokenManager compares with NOW()); this session is UTC,
// so add a margin larger than any UTC offset.
$db->query("INSERT INTO auth_tokens (user_id, user_type, token, expires_at) VALUES (1, 'client', ?, UTC_TIMESTAMP() + INTERVAL 3 HOUR)", [hash('sha256', $token)]);
$auth = ["X-Auth-Token: $token"];
$eventId = null;

try {
    // ── Editor ──
    [$c, $r] = call('POST', "$B/events.php?action=create", ['title' => 'Zombie Quest Test', 'main_language' => 'fr'], $auth);
    check('create event', $c === 200 && !empty($r['event']['id']), $r);
    $eventId = $r['event']['id'];
    $slug = $r['event']['slug'];
    check('slug generated', (bool)preg_match('/^zombie-quest-test-\d{4}$/', $slug), $slug);
    check('checklist lists missing items', in_array('ticket_types', $r['checklist'], true) && in_array('slots', $r['checklist'], true), $r['checklist']);

    [$c, $r] = call('POST', "$B/events.php?action=update", ['id' => $eventId, 'venue_name' => 'Île de Loisirs', 'venue_city' => 'Jablines', 'venue_postal_code' => '77450',
        'team_size_min' => 2, 'team_size_max' => 6, 'require_player_details' => true, 'minor_age_threshold' => 13, 'licensee_alert_email' => 'alerts@zq.example',
        'languages' => ['fr', 'en'], 'theme' => ['primary' => '#7f1d1d', 'heading_font' => 'zombie']], $auth);
    check('update settings', $c === 200 && $r['event']['team_size_min'] === 2 && $r['event']['theme']['heading_font'] === 'Zombie', $r['event'] ?? $r);

    [$c, $r] = call('POST', "$B/events.php?action=content_save", ['id' => $eventId, 'lang' => 'fr', 'content' => [
        'title' => 'Zombie Quest Test', 'subtitle' => 'Survivrez-vous ?', 'description_md' => "Une **chasse au trésor** en zone infestée.",
        'faq' => [['q' => 'Âge minimum ?', 'a' => '8 ans']], 'terms_text_md' => 'Règlement : soyez prudents.']], $auth);
    check('content fr', $c === 200 && $r['contents']['fr']['subtitle'] === 'Survivrez-vous ?', $r);
    [$c, $r] = call('POST', "$B/events.php?action=content_save", ['id' => $eventId, 'lang' => 'de', 'content' => ['title' => 'x']], $auth);
    check('content in a non-event language refused', $c === 422, $r);

    [$c, $r] = call('POST', "$B/events.php?action=ticket_types_save", ['id' => $eventId, 'types' => [
        ['role' => 'player', 'label_i18n' => ['fr' => 'Survivant', 'en' => 'Survivor'], 'base_price_cents' => 0, 'min_age' => 8],
        ['role' => 'individual', 'label_i18n' => ['fr' => 'Zombie'], 'base_price_cents' => 0, 'min_age' => 18, 'cap_per_slot' => 2],
        ['role' => 'player', 'label_i18n' => ['fr' => 'Survivant soirée'], 'base_price_cents' => 2700,
            'steps' => [['price_cents' => 1800, 'ends_after_sold' => 2], ['price_cents' => 2200, 'ends_at' => '2099-01-01T00:00']]],
    ]], $auth);
    check('ticket types', $c === 200 && count($r['ticket_types']) === 3 && count($r['ticket_types'][2]['steps']) === 2, $r);
    [$free, $zombie, $paid] = array_column($r['ticket_types'], 'id');

    $day = gmdate('Y-m-d', strtotime('+10 days'));
    [$c, $r] = call('POST', "$B/events.php?action=slots_generate", ['id' => $eventId, 'date' => $day, 'from' => '14:00', 'to' => '15:00', 'every_minutes' => 30,
        'duration_minutes' => 90, 'capacity' => 6, 'ticket_type_ids' => [$free, $zombie, $paid]], $auth);
    check('generate 3 slots', $c === 200 && ($r['created'] ?? 0) === 3 && $r['slots'][0]['starts_at'] === $day . 'T14:00', $r['slots'] ?? $r);
    $slotId = $r['slots'][0]['id'];
    check('slot stored in UTC (Paris = UTC+1/2)', in_array(substr($r['slots'][0]['starts_at_utc'], 11, 5), ['12:00', '13:00'], true), $r['slots'][0]);

    [$c, $r] = call('POST', "$B/events.php?action=publish", ['id' => $eventId], $auth);
    check('publish blocked while paid type and no Stripe', $c === 409 && in_array('stripe', $r['missing'] ?? [], true), $r);
    // Pilot without Stripe: make the paid type inactive, then publish.
    [$c, $r] = call('GET', "$B/events.php?action=get&id=$eventId", null, $auth);
    $types = $r['ticket_types'];
    $types[2]['active'] = false;
    call('POST', "$B/events.php?action=ticket_types_save", ['id' => $eventId, 'types' => $types], $auth);
    [$c, $r] = call('POST', "$B/events.php?action=publish", ['id' => $eventId], $auth);
    check('publish free event', $c === 200 && $r['event']['status'] === 'published', $r);

    // ── Public ──
    [$c, $r] = call('GET', "$B/events_public.php?action=event&slug=$slug&lang=en");
    check('public event (en falls back to fr fields)', $c === 200 && $r['event']['lang'] === 'en' && $r['event']['content']['subtitle'] === 'Survivrez-vous ?', $r);
    check('public type label translated', ($r['ticket_types'][0]['label'] ?? '') === 'Survivor', $r['ticket_types'] ?? null);
    check('inactive type hidden', count($r['ticket_types']) === 2, $r['ticket_types']);
    check('heading font faces resolved', ($r['event']['theme']['font_faces'][0]['family'] ?? '') === 'Zombie', $r['event']['theme']);
    check('no personal data in public payload', strpos(json_encode($r), 'contact@zq.example') === false || $r['organizer']['email'] === 'contact@zq.example', null);
    check('3 slots available', count($r['slots']) === 3 && $r['slots'][0]['status'] === 'available', $r['slots']);

    [$c, $r] = call('GET', "$B/events_public.php?action=directory");
    check('directory lists event', $c === 200 && in_array($slug, array_column($r['events'], 'slug'), true), $r);
    [$c, $r] = call('GET', "$B/events_public.php?action=meta&slug=$slug");
    check('meta', $c === 200 && $r['title'] === 'Zombie Quest Test' && $r['available'] === true, $r);

    $buyer = ['first_name' => 'Claire', 'last_name' => 'Martin', 'email' => 'claire@example.test', 'phone' => '06 12 34 56 78'];
    $consents = ['terms' => true, 'platform' => true];
    [$c, $r] = call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotId, 'lang' => 'fr',
        'tickets' => [['ticket_type_id' => $free, 'first_name' => 'Léa', 'age' => 9]], 'team_name' => '', 'buyer' => $buyer, 'consents' => []]);
    check('validation errors', $c === 422 && isset($r['details']['tickets'], $r['details']['team_name'], $r['details']['consents.terms']), $r);
    check('team too small reported', ($r['details']['tickets'] ?? '') === 'team_too_small' || ($r['details']['tickets'] ?? '') === 'minor_needs_adult', $r['details'] ?? null);

    [$c, $r] = call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotId, 'lang' => 'fr',
        'tickets' => [['ticket_type_id' => $free, 'first_name' => 'Léa', 'age' => 9], ['ticket_type_id' => $free, 'first_name' => 'Tom', 'age' => 11]],
        'team_name' => 'Les Survivants', 'buyer' => $buyer, 'consents' => $consents]);
    check('minor without adult refused', $c === 422 && ($r['details']['tickets'] ?? '') === 'minor_needs_adult', $r);

    [$c, $r] = call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotId, 'lang' => 'fr',
        'tickets' => [['ticket_type_id' => $free, 'first_name' => 'Léa', 'age' => 9], ['ticket_type_id' => $free, 'first_name' => 'Claire', 'age' => 41]],
        'team_name' => 'Les Survivants', 'buyer' => $buyer, 'consents' => $consents, 'answers' => []]);
    check('free booking confirmed', $c === 200 && !empty($r['confirmed']) && !empty($r['return_token']), $r);
    $ret = $r['return_token'] ?? '';

    [$c, $r] = call('GET', "$B/events_public.php?action=booking_return&b=" . rawurlencode($ret));
    check('return page payload', $c === 200 && $r['status'] === 'confirmed' && count($r['tickets']) === 2 && !empty($r['manage_token']), $r);
    $manage = $r['manage_token'] ?? '';
    $qr = $r['qr_token'] ?? '';
    [$c, $r] = call('GET', "$B/events_public.php?action=booking&t=" . rawurlencode($manage));
    check('manage page', $c === 200 && $r['team_name'] === 'Les Survivants', $r);
    [$c, $r] = call('GET', "$B/events_public.php?action=booking&t=" . rawurlencode($qr));
    check('QR token cannot open manage page', $c === 404, $r);
    [$c, $r] = call('GET', "$B/events_public.php?action=ticket&q=" . rawurlencode($qr));
    check('ticket page via QR', $c === 200 && $r['reference'] !== '' && !isset($r['buyer']), $r);
    [$c, $r] = call('GET', "$B/events_public.php?action=ics&t=" . rawurlencode($manage));
    check('ics', $c === 200 && is_string($r) && str_contains($r, 'BEGIN:VEVENT'), substr((string)$r, 0, 80));

    // Individual-role cap (2 zombies per slot) and capacity race on the last places.
    [$c, $r] = call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotId, 'lang' => 'fr',
        'tickets' => [['ticket_type_id' => $zombie, 'first_name' => 'Z1', 'age' => 30], ['ticket_type_id' => $zombie, 'first_name' => 'Z2', 'age' => 30], ['ticket_type_id' => $zombie, 'first_name' => 'Z3', 'age' => 30]],
        'buyer' => $buyer + ['email' => 'z@example.test'], 'consents' => $consents]);
    check('zombie cap per slot', $c === 409 && $r['error'] === 'type_sold_out', $r);

    // 4 places left on the slot; fire 4 parallel bookings of 2 -> exactly 2 succeed.
    $db->query('DELETE FROM public_rate_limits');
    $mh = curl_multi_init();
    $hs = [];
    for ($i = 0; $i < 4; $i++) {
        $ch = curl_init("$B/events_public.php?action=book");
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => json_encode(['slug' => $slug, 'slot_id' => $slotId, 'lang' => 'fr', 'team_name' => "Race $i",
                'tickets' => [['ticket_type_id' => $free, 'first_name' => 'A', 'age' => 30], ['ticket_type_id' => $free, 'first_name' => 'B', 'age' => 30]],
                'buyer' => $buyer + ['email' => "race$i@example.test"], 'consents' => $consents])]);
        curl_multi_add_handle($mh, $ch);
        $hs[] = $ch;
    }
    do { curl_multi_exec($mh, $running); curl_multi_select($mh); } while ($running);
    $codes = array_map(fn($h) => (int)curl_getinfo($h, CURLINFO_HTTP_CODE), $hs);
    sort($codes);
    check('race: 2 succeed, 2 sold out', $codes === [200, 200, 409, 409], $codes);
    $taken = (int)$db->fetch("SELECT COUNT(*) n FROM bookings b JOIN booking_tickets t ON t.booking_id = b.id WHERE b.slot_id = ? AND b.status = 'confirmed'", [$slotId])['n'];
    check('slot never oversold', $taken === 6, $taken);
    [$c, $r] = call('GET', "$B/events_public.php?action=availability&slug=$slug");
    check('slot now full', $r['slots'][0]['status'] === 'full', $r['slots'][0] ?? $r);

    // Paid type: quote uses the tiers (2 sold at 18 -> next at 22) and the commission.
    $db->query('UPDATE event_ticket_types SET active = 1 WHERE id = ?', [$paid]);
    [$c, $r] = call('POST', "$B/events_public.php?action=quote", ['slug' => $slug, 'slot_id' => $r['slots'][1]['id'], 'tickets' => [$paid, $paid, $paid], 'lang' => 'fr']);
    check('quote tiers 18+18+22', $c === 200 && array_column($r['lines'], 'unit_price_cents') === [1800, 2200] && $r['subtotal_cents'] === 5800, $r);
    check('quote fee 3% + 0.50 x3', $r['booking_fee_cents'] === 174 + 150 && $r['total_cents'] === 5800 + 324, $r);
    $db->query('DELETE FROM public_rate_limits');
    [$c, $r] = call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotId + 1, 'lang' => 'fr', 'team_name' => 'Payeurs',
        'tickets' => [['ticket_type_id' => $paid, 'first_name' => 'P', 'age' => 30], ['ticket_type_id' => $paid, 'first_name' => 'Q', 'age' => 30]],
        'buyer' => $buyer + ['email' => 'pay@example.test'], 'consents' => $consents]);
    check('paid booking refused without Stripe account', $c === 409 && $r['error'] === 'payments_unavailable', $r);

    // Emails: confirmation + licensee alert queued per confirmed booking.
    $mails = $db->fetchAll('SELECT kind, to_email, status, last_error FROM email_outbox WHERE event_id = ? ORDER BY id', [$eventId]);
    check('emails queued (3 bookings x 2)', count($mails) === 6, $mails);
    check('email kinds', array_count_values(array_column($mails, 'kind')) === ['booking_confirmation' => 3, 'licensee_new_booking' => 3], array_column($mails, 'kind'));
    check('email rendered (only fails on missing Mailjet keys)', $mails && $mails[0]['last_error'] === 'mailjet_not_configured', $mails[0] ?? null);
} finally {
    if ($eventId) {
        $db->query('DELETE FROM email_outbox WHERE event_id = ?', [$eventId]);
        $db->query('DELETE b FROM bookings b WHERE b.event_id = ?', [$eventId]);
        $db->query('DELETE FROM events WHERE id = ?', [$eventId]);
        $dir = __DIR__ . '/../../media/evt_' . ($db->fetch('SELECT 1') ? '' : '');
    }
    $db->query('DELETE FROM auth_tokens WHERE token = ?', [hash('sha256', $token)]);
    $db->query('DELETE FROM public_rate_limits');
    $db->query('UPDATE clients SET events_enabled = ?, legal_name = ?, siret = ?, vat_regime = ?, vat_default_bp = ?, vat_number = NULL, address_line1 = ?, postal_code = ?,
        city = ?, country = ?, legal_email = ?, events_terms_version = ?, events_terms_accepted_at = ?, slug = ? WHERE id = 1', array_values($backup));
}
echo $fails ? "\n$fails FAILED\n" : "\nALL PASSED\n";
exit($fails ? 1 : 0);
