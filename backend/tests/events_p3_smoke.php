<?php
// LOCAL ONLY end-to-end test of Events phase 3 (add-ons, promo codes, paid
// checkout, webhook fulfilment, refunds, manual bookings, buyer edits, slot
// cancellation job, disputes, reminders, invoices, anonymisation) against
// http://studio.taghunter.test and the fake Stripe (tests/stripe_mock.php on
// 127.0.0.1:12111). Temporarily swaps config/payments.php; restores everything.
// Run: php backend/tests/events_p3_smoke.php
if (stripos(PHP_OS, 'WIN') !== 0) die("local only\n");

$cfgFile = __DIR__ . '/../config/payments.php';
$cfgBackup = file_get_contents($cfgFile);
$cfg = require $cfgFile;
$cfg['stripe_secret_key'] = 'sk_test_mock';
$cfg['stripe_api_base'] = 'http://127.0.0.1:12111';
$cfg['stripe_webhook_secrets'] = ['whsec_smoke'];
file_put_contents($cfgFile, '<?php return ' . var_export($cfg, true) . ";\n");

require __DIR__ . '/../database/Database.php';
$db = Database::getInstance();
$db->query("SET time_zone = '+00:00'");
$B = 'http://studio.taghunter.test/backend/api';
$MOCK = 'http://127.0.0.1:12111';
$mockLog = sys_get_temp_dir() . '/stripe_mock_log.jsonl';
@unlink($mockLog);
@unlink(sys_get_temp_dir() . '/stripe_mock_state.json');
$fails = 0;

function check(string $name, bool $ok, $info = null): void {
    global $fails;
    if (!$ok) $fails++;
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . ($ok || $info === null ? '' : '  -> ' . json_encode($info, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) . "\n";
}

function call(string $method, string $url, $body = null, array $headers = [], bool $raw = false): array {
    $ch = curl_init($url);
    $h = $headers;
    if ($body !== null && !$raw) {
        $h[] = 'Content-Type: application/json';
        $body = json_encode($body);
    }
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    curl_setopt_array($ch, [CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $h, CURLOPT_TIMEOUT => 30]);
    $res = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $json = json_decode((string)$res, true);
    return [$code, $json ?? $res];
}

function mockCalls(string $path): array {
    global $mockLog;
    $out = [];
    foreach (file($mockLog, FILE_IGNORE_NEW_LINES) ?: [] as $l) {
        $r = json_decode($l, true);
        if ($r['path'] === $path) $out[] = $r;
    }
    return $out;
}

/** Signed Stripe webhook with the smoke secret. */
function webhook(string $type, array $object, string $account = 'acct_smoke'): array {
    global $B;
    $payload = json_encode(['id' => 'evt_' . bin2hex(random_bytes(6)), 'object' => 'event', 'type' => $type, 'account' => $account, 'livemode' => false, 'data' => ['object' => $object]]);
    $t = time();
    return call('POST', "$B/stripe_webhook.php", $payload, ['Stripe-Signature: t=' . $t . ',v1=' . hash_hmac('sha256', "$t.$payload", 'whsec_smoke')], true);
}

function row($table, $id) {
    global $db;
    return $db->fetch("SELECT * FROM $table WHERE id = ?", [$id]);
}

// ── Setup ──
$backup = $db->fetch('SELECT events_enabled, legal_name, siret, vat_regime, vat_default_bp, vat_number, vat_valid, address_line1, postal_code, city, country, legal_email, events_terms_version, events_terms_accepted_at, slug FROM clients WHERE id = 1');
$terms = $db->fetch("SELECT value FROM events_platform_settings WHERE name = 'platform_terms_version'")['value'];
$db->query("UPDATE clients SET events_enabled = 1, legal_name = 'Zombie Quest SAS', siret = '73282932000074', vat_regime = 'subject', vat_default_bp = 2000,
    vat_number = 'FR44732829320', address_line1 = '1 rue des Lacs', postal_code = '77450', city = 'Jablines', country = 'FR',
    legal_email = 'contact@zq.example', events_terms_version = ?, events_terms_accepted_at = UTC_TIMESTAMP() WHERE id = 1", [$terms]);
$hadAcct = $db->fetch('SELECT * FROM stripe_connected_accounts WHERE client_id = 1');
$db->query("INSERT INTO stripe_connected_accounts (client_id, stripe_account_id, country, charges_enabled, payouts_enabled, details_submitted)
    VALUES (1, 'acct_smoke', 'FR', 1, 1, 1) ON DUPLICATE KEY UPDATE stripe_account_id = 'acct_smoke', charges_enabled = 1, disconnected_at = NULL");
$token = 'smoke_' . bin2hex(random_bytes(8));
$db->query("INSERT INTO auth_tokens (user_id, user_type, token, expires_at) VALUES (1, 'client', ?, UTC_TIMESTAMP() + INTERVAL 3 HOUR)", [hash('sha256', $token)]);
$auth = ["X-Auth-Token: $token"];
$eventId = null;
$seqBefore = $db->fetch('SELECT last_number FROM invoice_sequences WHERE series = ?', ['TH-COM-' . gmdate('Y')]);

try {
    // ── Event with paid type, add-on, promo, question ──
    [$c, $r] = call('POST', "$B/events.php?action=create", ['title' => 'P3 Smoke', 'main_language' => 'fr'], $auth);
    $eventId = $r['event']['id'];
    $slug = $r['event']['slug'];
    call('POST', "$B/events.php?action=update", ['id' => $eventId, 'venue_city' => 'Jablines', 'team_size_min' => 1, 'team_size_max' => 6, 'require_player_details' => true, 'licensee_alert_email' => 'alerts@zq.example'], $auth);
    call('POST', "$B/events.php?action=content_save", ['id' => $eventId, 'lang' => 'fr', 'content' => ['title' => 'P3 Smoke', 'terms_text_md' => 'Règlement.']], $auth);
    [$c, $r] = call('POST', "$B/events.php?action=ticket_types_save", ['id' => $eventId, 'types' => [
        ['role' => 'player', 'label_i18n' => ['fr' => 'Survivant'], 'base_price_cents' => 2000, 'min_age' => 8],
    ]], $auth);
    $paid = $r['ticket_types'][0]['id'];
    [$c, $r] = call('POST', "$B/events.php?action=addons_save", ['id' => $eventId, 'addons' => [
        ['label_i18n' => ['fr' => 'T-shirt'], 'price_cents' => 1500, 'max_per_booking' => 4, 'variants' => [
            ['label_i18n' => ['fr' => 'S'], 'stock' => 1], ['label_i18n' => ['fr' => 'M']]]],
    ]], $auth);
    check('add-on saved with 2 variants', $c === 200 && count($r['addons'][0]['variants'] ?? []) === 2, $r['addons'] ?? $r);
    [$vS, $vM] = array_column($r['addons'][0]['variants'], 'id');
    [$c, $r] = call('POST', "$B/events.php?action=promo_save", ['id' => $eventId, 'codes' => [
        ['code' => 'zq10', 'kind' => 'percent', 'value' => 1000, 'max_uses' => 1],
        ['code' => 'x', 'kind' => 'percent', 'value' => 1000],
    ]], $auth);
    check('promo validation (too short)', $c === 422 && isset($r['errors']['codes.1.code']), $r);
    [$c, $r] = call('POST', "$B/events.php?action=promo_save", ['id' => $eventId, 'codes' => [['code' => 'zq10', 'kind' => 'percent', 'value' => 1000, 'max_uses' => 1]]], $auth);
    check('promo saved upper-case', $c === 200 && $r['promo_codes'][0]['code'] === 'ZQ10', $r['promo_codes'] ?? $r);
    $day = gmdate('Y-m-d', strtotime('+10 days'));
    [$c, $r] = call('POST', "$B/events.php?action=slots_generate", ['id' => $eventId, 'date' => $day, 'from' => '14:00', 'to' => '15:00', 'every_minutes' => 60, 'duration_minutes' => 60, 'capacity' => 10], $auth);
    [$slotA, $slotB] = array_column($r['slots'], 'id');
    [$c, $r] = call('POST', "$B/events.php?action=publish", ['id' => $eventId], $auth);
    check('publish paid event (Stripe connected)', $c === 200 && $r['event']['status'] === 'published', $r);

    // ── Public: add-ons + promo in quote ──
    [$c, $r] = call('GET', "$B/events_public.php?action=event&slug=$slug");
    check('public add-ons listed with S stock', ($r['addons'][0]['variants'][0]['remaining'] ?? null) === 1 && $r['has_promo_codes'] === true, $r['addons'] ?? $r);
    [$c, $q] = call('POST', "$B/events_public.php?action=quote", ['slug' => $slug, 'slot_id' => $slotA, 'tickets' => [$paid, $paid], 'addons' => [['variant_id' => $vS, 'qty' => 1]], 'promo_code' => 'zq10', 'lang' => 'fr']);
    // 2 x 20 + 15 = 55 ; -10 % = 49.50 ; fee 3 % of 49.50 = 1.485 -> 1.49 + 2 x 0.50 = 2.49 ; total 51.99
    check('quote with add-on + promo', $c === 200 && $q['subtotal_cents'] === 5500 && $q['discount_cents'] === 550 && $q['booking_fee_cents'] === 249 && $q['total_cents'] === 5199, $q);
    [$c, $q] = call('POST', "$B/events_public.php?action=quote", ['slug' => $slug, 'slot_id' => $slotA, 'tickets' => [$paid], 'promo_code' => 'NOPE', 'lang' => 'fr']);
    check('quote with unknown promo -> error, no discount', ($q['promo']['error'] ?? '') === 'promo_invalid' && $q['discount_cents'] === 0, $q);

    // ── Paid booking -> fake Stripe Checkout ──
    $buyer = ['first_name' => 'Claire', 'last_name' => 'Martin', 'email' => 'claire@example.test', 'phone' => '0612345678'];
    $consents = ['terms' => true, 'platform' => true];
    [$c, $r] = call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotA, 'lang' => 'fr', 'team_name' => 'Les Payeurs',
        'tickets' => [['ticket_type_id' => $paid, 'first_name' => 'Léa', 'age' => 30], ['ticket_type_id' => $paid, 'first_name' => 'Tom', 'age' => 32]],
        'addons' => [['variant_id' => $vS, 'qty' => 1]], 'promo_code' => 'ZQ10', 'buyer' => $buyer, 'consents' => $consents]);
    check('paid booking -> checkout url', $c === 200 && str_contains($r['checkout_url'] ?? '', 'checkout.stripe.test'), $r);
    $ret1 = $r['return_token'] ?? '';
    $cs = mockCalls('/v1/checkout/sessions');
    $sent = $cs[0]['params'] ?? [];
    $lineSum = 0;
    foreach ($sent['line_items'] ?? [] as $l) $lineSum += (int)$l['price_data']['unit_amount'] * (int)$l['quantity'];
    check('Stripe: direct charge on licensee account', ($cs[0]['account'] ?? '') === 'acct_smoke', $cs[0] ?? null);
    check('Stripe: lines sum to total (discount spread, no negative line)', $lineSum === 5199, [$lineSum, $sent['line_items'] ?? null]);
    check('Stripe: application fee = booking fee', (int)($sent['payment_intent_data']['application_fee_amount'] ?? -1) === 249, $sent['payment_intent_data'] ?? null);
    $b1 = $db->fetch('SELECT * FROM bookings WHERE event_id = ? ORDER BY id LIMIT 1', [$eventId]);
    check('booking pending with promo + add-on', $b1['status'] === 'pending' && (int)$b1['discount_cents'] === 550
        && (int)$db->fetch('SELECT COUNT(*) n FROM booking_addons WHERE booking_id = ?', [$b1['id']])['n'] === 1, $b1);

    // Promo max 1 use and add-on S stock 1 are held by the pending booking.
    [$c, $r] = call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotA, 'lang' => 'fr', 'team_name' => 'Deux',
        'tickets' => [['ticket_type_id' => $paid, 'first_name' => 'A', 'age' => 30]], 'promo_code' => 'ZQ10', 'buyer' => $buyer + ['email' => 'b2@example.test'], 'consents' => $consents]);
    check('promo used up by the hold', $c === 422 && ($r['details']['promo_code'] ?? '') === 'promo_used_up', $r);
    [$c, $r] = call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotA, 'lang' => 'fr', 'team_name' => 'Deux',
        'tickets' => [['ticket_type_id' => $paid, 'first_name' => 'A', 'age' => 30]], 'addons' => [['variant_id' => $vS, 'qty' => 1]], 'buyer' => $buyer + ['email' => 'b3@example.test'], 'consents' => $consents]);
    check('add-on S sold out (stock 1)', $c === 409 && $r['error'] === 'addon_sold_out', $r);

    // ── Payment completes: webhook fulfils ──
    $sessionId = $b1['stripe_checkout_session_id'];
    $pay = call('POST', "$MOCK/_test/pay/$sessionId")[1];
    [$c, $r] = webhook('checkout.session.completed', ['id' => $sessionId, 'object' => 'checkout.session', 'payment_status' => 'paid', 'client_reference_id' => $b1['uuid'], 'payment_intent' => $pay['payment_intent']]);
    $b1 = row('bookings', $b1['id']);
    check('webhook fulfils booking', $c === 200 && $b1['status'] === 'confirmed' && $b1['payment_status'] === 'paid' && $b1['stripe_payment_intent_id'] === $pay['payment_intent'], [$c, $r, $b1['status']]);
    [$c, $r] = call('GET', "$B/events_public.php?action=booking_return&b=" . rawurlencode($ret1));
    check('return page shows add-on + promo', $c === 200 && ($r['addons'][0]['label'] ?? '') === 'T-shirt (S)' && $r['promo_code'] === 'ZQ10', $r);
    $manage = $r['manage_token'] ?? '';

    // ── Licensee refund (fee kept) ──
    [$c, $r] = call('GET', "$B/events.php?action=booking&booking_id={$b1['id']}", null, $auth);
    check('booking detail refundable = paid - fee', $c === 200 && $r['booking']['refundable_cents'] === 5199 - 249, $r['booking']['refundable_cents'] ?? $r);
    [$c, $r] = call('POST', "$B/events.php?action=booking_refund", ['booking_id' => $b1['id'], 'amount_cents' => 99999, 'reason' => 'trop'], $auth);
    check('refund above max refused', $c === 422 && $r['error'] === 'invalid_amount' && $r['max_cents'] === 4950, $r);
    [$c, $r] = call('POST', "$B/events.php?action=booking_refund", ['booking_id' => $b1['id'], 'amount_cents' => 1500, 'reason' => 'T-shirt indisponible'], $auth);
    $rf = mockCalls('/v1/refunds');
    check('partial refund done', $c === 200 && $r['booking']['payment_status'] === 'partially_refunded' && $r['booking']['refunded_cents'] === 1500, $r);
    check('Stripe: licensee refund keeps fee', ($rf[0]['params']['refund_application_fee'] ?? '') === 'false' && (int)$rf[0]['params']['amount'] === 1500, $rf[0] ?? null);

    // ── Buyer edits names until the cut-off ──
    [$c, $r] = call('POST', "$B/events_public.php?action=manage_update", ['t' => $manage, 'tickets' => [['first_name' => 'Léa', 'age' => 5], ['first_name' => 'Tom', 'age' => 32]]]);
    check('buyer edit: age below ticket minimum refused', $c === 422 && ($r['details']['tickets.0.age'] ?? '') === 'too_young', $r);
    [$c, $r] = call('POST', "$B/events_public.php?action=manage_update", ['t' => $manage, 'team_name' => 'Les Payeurs 2', 'tickets' => [['first_name' => 'Léonie', 'age' => 31], ['first_name' => 'Tom', 'age' => 32]]]);
    check('buyer edit saved', $c === 200 && $r['team_name'] === 'Les Payeurs 2' && $r['tickets'][0]['first_name'] === 'Léonie' && $r['editable'] === true, $r);

    // ── Manual booking (paid on site, no fee), then marked paid ──
    [$c, $r] = call('POST', "$B/events.php?action=booking_manual_create", ['id' => $eventId, 'slot_id' => $slotA, 'source' => 'manual_onsite', 'team_name' => 'École',
        'tickets' => [['ticket_type_id' => $paid], ['ticket_type_id' => $paid], ['ticket_type_id' => $paid]], 'buyer' => ['first_name' => 'Mme Durand'], 'send_email' => false], $auth);
    check('manual booking: confirmed, offline_due, no fee', $c === 200 && $r['booking']['status'] === 'confirmed' && $r['booking']['payment_status'] === 'offline_due'
        && $r['booking']['booking_fee_cents'] === 0 && $r['booking']['total_cents'] === 6000, $r);
    $manualId = $r['booking']['id'] ?? 0;
    [$c, $r] = call('POST', "$B/events.php?action=booking_update", ['booking_id' => $manualId, 'payment_status' => 'offline_paid', 'internal_notes' => 'Chèque reçu'], $auth);
    check('manual booking marked paid', $c === 200 && $r['booking']['payment_status'] === 'offline_paid' && $r['booking']['internal_notes'] === 'Chèque reçu', $r);
    [$c, $r] = call('GET', "$B/events_public.php?action=availability&slug=$slug");
    check('manual booking uses capacity (10 - 2 - 3 = 5 left)', ($r['slots'][0]['remaining'] ?? null) === 5, $r['slots'][0] ?? $r);

    // ── Cancel one booking with refund (fee kept) ──
    [$c, $r] = call('POST', "$B/events.php?action=booking_cancel", ['booking_id' => $b1['id'], 'refund' => true, 'reason' => 'demande client'], $auth);
    $b1 = row('bookings', $b1['id']);
    check('booking cancelled, rest refunded, fee kept', $c === 200 && $b1['status'] === 'cancelled' && (int)$b1['refunded_cents'] === 4950 && (int)$b1['fee_refunded_cents'] === 0, $b1);

    // ── Slot cancellation job refunds everything INCLUDING the fee ──
    $db->query('DELETE FROM public_rate_limits');
    [$c, $r] = call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotB, 'lang' => 'fr', 'team_name' => 'Soir',
        'tickets' => [['ticket_type_id' => $paid, 'first_name' => 'S', 'age' => 30]], 'buyer' => $buyer + ['email' => 'soir@example.test'], 'consents' => $consents]);
    $b2 = $db->fetch('SELECT * FROM bookings WHERE event_id = ? AND slot_id = ? ORDER BY id DESC LIMIT 1', [$eventId, $slotB]);
    $pay2 = call('POST', "$MOCK/_test/pay/{$b2['stripe_checkout_session_id']}")[1];
    webhook('checkout.session.completed', ['id' => $b2['stripe_checkout_session_id'], 'object' => 'checkout.session', 'payment_status' => 'paid', 'client_reference_id' => $b2['uuid'], 'payment_intent' => $pay2['payment_intent']]);
    [$c, $r] = call('POST', "$B/events.php?action=slot_cancel", ['id' => $eventId, 'slot_id' => $slotB, 'reason' => 'Orage'], $auth);
    $b2 = row('bookings', $b2['id']);
    $rf = mockCalls('/v1/refunds');
    $last = end($rf);
    check('slot cancel job done', $c === 200 && ($r['job']['status'] ?? '') === 'done' && ($r['job']['progress']['done'] ?? 0) === 1, $r['job'] ?? $r);
    check('slot cancel refunds incl. fee', $b2['status'] === 'cancelled' && (int)$b2['refunded_cents'] === (int)$b2['total_cents']
        && (int)$b2['fee_refunded_cents'] === (int)$b2['booking_fee_cents'] && ($last['params']['refund_application_fee'] ?? '') === 'true', [$b2, $last]);
    [$c, $r] = call('GET', "$B/events_public.php?action=availability&slug=$slug");
    check('cancelled slot no longer on sale', !in_array($slotB, array_column($r['slots'], 'id'), true), array_column($r['slots'], 'id'));

    // ── Refund made in the licensee's Stripe dashboard + dispute ──
    $db->query('DELETE FROM public_rate_limits');
    [$c, $r] = call('POST', "$B/events_public.php?action=book", ['slug' => $slug, 'slot_id' => $slotA, 'lang' => 'fr', 'team_name' => 'Dash',
        'tickets' => [['ticket_type_id' => $paid, 'first_name' => 'D', 'age' => 30]], 'buyer' => $buyer + ['email' => 'dash@example.test'], 'consents' => $consents]);
    $b3 = $db->fetch('SELECT * FROM bookings WHERE event_id = ? ORDER BY id DESC LIMIT 1', [$eventId]);
    $pay3 = call('POST', "$MOCK/_test/pay/{$b3['stripe_checkout_session_id']}")[1];
    webhook('checkout.session.completed', ['id' => $b3['stripe_checkout_session_id'], 'object' => 'checkout.session', 'payment_status' => 'paid', 'client_reference_id' => $b3['uuid'], 'payment_intent' => $pay3['payment_intent']]);
    [$c] = webhook('charge.refunded', ['id' => 'ch_dash', 'object' => 'charge', 'payment_intent' => $pay3['payment_intent'], 'amount_refunded' => 700]);
    $b3 = row('bookings', $b3['id']);
    check('dashboard refund synced', $c === 200 && (int)$b3['refunded_cents'] === 700 && $b3['payment_status'] === 'partially_refunded', $b3);
    webhook('charge.refunded', ['id' => 'ch_dash', 'object' => 'charge', 'payment_intent' => $pay3['payment_intent'], 'amount_refunded' => 700]);
    check('dashboard refund not double counted', (int)row('bookings', $b3['id'])['refunded_cents'] === 700, null);
    [$c] = webhook('charge.dispute.created', ['id' => 'dp_1', 'object' => 'dispute', 'payment_intent' => $pay3['payment_intent'], 'reason' => 'fraudulent']);
    check('dispute flagged + licensee alerted', $c === 200 && row('bookings', $b3['id'])['disputed_at'] !== null
        && $db->fetch("SELECT 1 FROM email_outbox WHERE booking_id = ? AND kind = 'dispute_alert'", [$b3['id']]), null);

    // ── Reminders: booked before the 48 h window, slot within 48 h ──
    $db->query('UPDATE event_slots SET starts_at = UTC_TIMESTAMP() + INTERVAL 30 HOUR WHERE id = ?', [$slotA]);
    $db->query('UPDATE bookings SET created_at = UTC_TIMESTAMP() - INTERVAL 5 DAY WHERE id = ?', [$b3['id']]);
    require_once __DIR__ . '/../utils/EventsBackoffice.php';
    $n1 = EventsBackoffice::sendReminders($db);
    $n2 = EventsBackoffice::sendReminders($db);
    check('reminder queued once', $db->fetch("SELECT COUNT(*) n FROM email_outbox WHERE booking_id = ? AND kind = 'reminder_48h'", [$b3['id']])['n'] == 1 && $n2 === 0, [$n1, $n2]);

    // ── Commission invoice for this month (run directly; the API refuses an unfinished month) ──
    require_once __DIR__ . '/../utils/EventsInvoices.php';
    $period = (new DateTime('now', new DateTimeZone('Europe/Paris')))->format('Y-m');
    [$c, $r] = call('POST', "$B/events_admin.php?action=invoices_generate", ['period' => $period], ["X-Auth-Token: $token"]);
    check('licensee cannot generate invoices', $c === 403, $r);
    $ids = EventsInvoices::generate($db, $period, 1, true);
    $inv = $ids ? row('commission_invoices', $ids[0]) : null;
    $fees = (int)$db->fetch("SELECT SUM(booking_fee_cents) s FROM bookings WHERE client_id = 1 AND event_id = ? AND source = 'online' AND paid_at IS NOT NULL", [$eventId])['s'];
    $feeBack = (int)$db->fetch('SELECT SUM(r.fee_refunded_cents) s FROM booking_refunds r JOIN bookings b ON b.id = r.booking_id WHERE b.event_id = ?', [$eventId])['s'];
    check('invoice issued = fees - fee refunds', $inv && (int)$inv['fees_ttc_cents'] === $fees - $feeBack && $inv['vat_scheme'] === 'fr', [$inv, $fees, $feeBack]);
    check('invoice HT/TVA 20 %', $inv && (int)$inv['ht_cents'] + (int)$inv['vat_cents'] === (int)$inv['fees_ttc_cents'] && abs((int)$inv['ht_cents'] * 1.2 - (int)$inv['fees_ttc_cents']) <= 1, $inv);
    check('invoice PDF + CSV written', $inv && is_file(__DIR__ . '/../storage/' . $inv['pdf_path']) && is_file(__DIR__ . '/../storage/' . $inv['csv_path'])
        && str_starts_with(file_get_contents(__DIR__ . '/../storage/' . $inv['pdf_path'], false, null, 0, 5), '%PDF'), $inv['pdf_path'] ?? null);
    check('invoice generation idempotent', EventsInvoices::generate($db, $period, 1, false) === [], null);
    [$c, $r] = call('GET', "$B/payments.php?action=invoices", null, $auth);
    check('licensee sees invoice', $c === 200 && ($r['invoices'][0]['number'] ?? '') === ($inv['number'] ?? 'x'), $r);
    $ch = curl_init("$B/payments.php?action=invoice_download&id={$inv['id']}&what=pdf");
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $auth]);
    $pdf = curl_exec($ch);
    check('licensee downloads PDF', str_starts_with((string)$pdf, '%PDF'), substr((string)$pdf, 0, 60));

    // ── Emails render for every new kind ──
    require_once __DIR__ . '/../utils/EventsEmails.php';
    $kinds = [];
    foreach ($db->fetchAll('SELECT id, kind FROM email_outbox WHERE event_id = ? OR (ref_id = ? AND kind = \'invoice_available\')', [$eventId, $inv['id'] ?? 0]) as $o) {
        $db->query("UPDATE email_outbox SET status = 'queued', attempts = 0, last_error = NULL WHERE id = ?", [$o['id']]);
        EventsEmails::sendOne($db, (int)$o['id']);
        $after = row('email_outbox', $o['id']);
        $kinds[$o['kind']] = $after['last_error'];
    }
    $bad = array_filter($kinds, fn($e) => $e !== 'mailjet_not_configured');
    check('all email kinds render (' . implode(', ', array_keys($kinds)) . ')', !$bad && isset($kinds['refund_notice'], $kinds['cancellation_notice'], $kinds['reminder_48h'], $kinds['dispute_alert'], $kinds['invoice_available']), $kinds);

    // ── Anonymisation 12 months after the event ──
    $db->query('UPDATE events SET last_slot_end_at = UTC_TIMESTAMP() - INTERVAL 13 MONTH WHERE id = ?', [$eventId]);
    EventsBackoffice::anonymise($db);
    $left = $db->fetch("SELECT COUNT(*) n FROM bookings WHERE event_id = ? AND (buyer_email IS NOT NULL OR buyer_first_name IS NOT NULL)", [$eventId])['n'];
    $names = $db->fetch("SELECT COUNT(*) n FROM booking_tickets bt JOIN bookings b ON b.id = bt.booking_id WHERE b.event_id = ? AND bt.participant_first_name IS NOT NULL", [$eventId])['n'];
    $money = $db->fetch('SELECT SUM(total_cents) s FROM bookings WHERE event_id = ?', [$eventId])['s'];
    check('anonymised: no buyer / player data left, amounts kept', $left == 0 && $names == 0 && $money > 0, [$left, $names, $money]);
    [$c] = call('GET', "$B/events_public.php?action=booking&t=" . rawurlencode($manage));
    check('anonymised booking link no longer works', $c === 404, $c);
} finally {
    file_put_contents($cfgFile, $cfgBackup);
    if ($eventId) {
        $invRows = $db->fetchAll('SELECT * FROM commission_invoices WHERE client_id = 1 AND issued_at > UTC_TIMESTAMP() - INTERVAL 1 HOUR');
        foreach ($invRows as $i) {
            foreach (['pdf_path', 'csv_path'] as $k) if ($i[$k]) @unlink(__DIR__ . '/../storage/' . $i[$k]);
            $db->query('DELETE FROM email_outbox WHERE ref_id = ? AND kind = ?', [$i['id'], 'invoice_available']);
            $db->query('DELETE FROM commission_invoices WHERE id = ?', [$i['id']]);
        }
        if ($seqBefore) $db->query('UPDATE invoice_sequences SET last_number = ? WHERE series = ?', [$seqBefore['last_number'], 'TH-COM-' . gmdate('Y')]);
        else $db->query('DELETE FROM invoice_sequences WHERE series = ?', ['TH-COM-' . gmdate('Y')]);
        $db->query('DELETE FROM event_jobs WHERE event_id = ?', [$eventId]);
        $db->query('DELETE FROM email_outbox WHERE event_id = ?', [$eventId]);
        $db->query('DELETE FROM bookings WHERE event_id = ?', [$eventId]);
        $db->query('DELETE FROM events WHERE id = ?', [$eventId]);
    }
    $db->query("DELETE FROM stripe_events WHERE account = 'acct_smoke'");
    if ($hadAcct) {
        $db->query('UPDATE stripe_connected_accounts SET stripe_account_id = ?, charges_enabled = ?, disconnected_at = ? WHERE client_id = 1', [$hadAcct['stripe_account_id'], $hadAcct['charges_enabled'], $hadAcct['disconnected_at']]);
    } else {
        $db->query('DELETE FROM stripe_connected_accounts WHERE client_id = 1');
    }
    $db->query('DELETE FROM auth_tokens WHERE token = ?', [hash('sha256', $token)]);
    $db->query('DELETE FROM public_rate_limits');
    $db->query('UPDATE clients SET events_enabled = ?, legal_name = ?, siret = ?, vat_regime = ?, vat_default_bp = ?, vat_number = ?, vat_valid = ?, address_line1 = ?, postal_code = ?,
        city = ?, country = ?, legal_email = ?, events_terms_version = ?, events_terms_accepted_at = ?, slug = ? WHERE id = 1', array_values($backup));
    @array_map('unlink', glob(__DIR__ . '/../storage/mail_preview/*') ?: []);
    @rmdir(__DIR__ . '/../storage/invoices/1');
}
echo $fails ? "\n$fails FAILED\n" : "\nALL PASSED\n";
exit($fails ? 1 : 0);
