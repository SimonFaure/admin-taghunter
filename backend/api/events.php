<?php
// Events - Studio editor API (phase 2). Design: Claude plan "ok-i-need-a-moonlit-goose".
//
// Auth: licensee token (own events only; needs events_enabled) or admin token
// with ?client_id=N. Times sent/received by the editor are LOCAL to the event
// time zone ("YYYY-MM-DDTHH:MM"); the DB stores UTC.
//
// GET  list                          -> events + counts
// GET  get&id                        -> full editor payload (+ checklist)
// GET  bookings&id                   -> bookings of the event (read-only in phase 2)
// POST create        {title, main_language?}
// POST update        {id, ...settings, layout?, theme?}
// POST content_save  {id, lang, content}
// POST ticket_types_save {id, types: [...]}      upsert; removed types deleted, or deactivated when sold
// POST slots_save    {id, slots: [...]}          upsert; a slot with bookings can't be deleted
// POST slots_generate {id, date, from, to, every_minutes, duration_minutes, capacity, ticket_type_ids}
// POST questions_save {id, questions: [...]}     max 5
// POST upload        multipart {id, kind, file}  -> {file, url}
// POST publish | unpublish | duplicate | delete   {id}
// Phase 3 (back-office):
// POST addons_save    {id, addons: [{id?, label_i18n, description_i18n, image, price_cents, vat_bp, max_per_booking, active,
//                       variants: [{id?, label_i18n, price_cents|null, stock|null, active}]}]}
// POST promo_save     {id, codes: [{id?, code, kind: percent|fixed, value, max_uses, valid_from, valid_until, active}]}
// GET  booking&booking_id                    -> full detail (tickets, add-ons, answers, refunds, log)
// POST booking_manual_create {id, slot_id, source, paid, send_email, notes, tickets, team_name, buyer, answers, addons}
// POST booking_update {booking_id, team_name?, buyer?, tickets?, answers?, internal_notes?, payment_status?}
// POST booking_refund {booking_id, amount_cents, reason}       (fee never refunded)
// POST booking_cancel {booking_id, refund, reason, notify}
// POST booking_resend {booking_id}
// POST slot_cancel   {id, slot_id, reason}   -> {job}   refunds everyone INCLUDING the booking fee
// POST event_cancel  {id, reason}            -> {job}
// GET  job&job_id                            -> job progress (and advances it by one batch)
// Phase 4 (event day):
// POST staff_link_create {id, label}         -> {link, pin}   the PIN is shown only once
// POST staff_link_pin    {id, link_id}       -> {link, pin}   new PIN (unlocks, ends sessions)
// POST staff_link_revoke {id, link_id}

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
header('Cache-Control: no-store');
ini_set('display_errors', '0');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/EventsSettings.php';
require_once __DIR__ . '/../utils/EventsRepo.php';
require_once __DIR__ . '/../utils/EventsTokens.php';
require_once __DIR__ . '/../utils/LegalInfo.php';
require_once __DIR__ . '/../utils/StripeConnect.php';
require_once __DIR__ . '/../utils/FontCatalog.php';
require_once __DIR__ . '/../utils/Slug.php';
require_once __DIR__ . '/../utils/EventsBooking.php';
require_once __DIR__ . '/../utils/EventsBackoffice.php';
require_once __DIR__ . '/../utils/EventsCheckin.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) jsonResponse(['error' => 'invalid_json'], 400);
    return $data;
}

function fail(string $code, int $status = 422, array $extra = []): void {
    jsonResponse(['error' => $code] + $extra, $status);
}

/** ['clientId', 'actor', 'actorId'] */
function requireActor($db): array {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($header, 'Bearer ') === 0) $header = substr($header, 7);
    $tokenData = $header !== '' ? TokenManager::validateToken($db, $header) : null;
    if (!$tokenData) fail('Unauthorized', 401);
    if (($tokenData['user_type'] ?? '') === 'admin') {
        $clientId = (int)($_GET['client_id'] ?? 0);
        if ($clientId <= 0 || !$db->fetch('SELECT id FROM clients WHERE id = ?', [$clientId])) fail('client_id is required', 400);
        return ['clientId' => $clientId, 'actor' => 'admin', 'actorId' => (int)$tokenData['user_id']];
    }
    if (!empty($tokenData['device_id'])) fail('Forbidden', 403);
    $clientId = (int)$tokenData['user_id'];
    if (!EventsSettings::clientEnabled($db, $clientId)) fail('events_disabled', 403);
    return ['clientId' => $clientId, 'actor' => 'client', 'actorId' => $clientId];
}

function ownEvent($db, int $clientId, int $id): array {
    $e = $id > 0 ? EventsRepo::eventById($db, $id) : null;
    if (!$e || (int)$e['client_id'] !== $clientId) fail('not_found', 404);
    return $e;
}

// ── Time helpers (event local <-> UTC) ───────────────────────────────────

function localToUtc(?string $local, string $tz): ?string {
    if ($local === null || trim($local) === '') return null;
    $local = str_replace(' ', 'T', trim($local));
    $d = DateTime::createFromFormat('Y-m-d\TH:i', substr($local, 0, 16), new DateTimeZone($tz));
    if (!$d) return null;
    $d->setTimezone(new DateTimeZone('UTC'));
    return $d->format('Y-m-d H:i:s');
}

function utcToLocal(?string $utc, string $tz): ?string {
    if (!$utc) return null;
    $d = new DateTime($utc, new DateTimeZone('UTC'));
    $d->setTimezone(new DateTimeZone($tz));
    return $d->format('Y-m-d\TH:i');
}

function utcIso(?string $utc): ?string {
    return $utc ? str_replace(' ', 'T', $utc) . 'Z' : null;
}

function nInt($v, int $min, int $max): ?int {
    if ($v === null || $v === '') return null;
    return max($min, min($max, (int)$v));
}

function hexColor($v, string $default): string {
    return is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v) ? strtolower($v) : $default;
}

// ── Layout / theme / content sanitising ──────────────────────────────────

const SECTION_KEYS = ['hero', 'description', 'practical', 'steps', 'testimonials', 'partners', 'faq', 'sessions'];

function defaultLayout(): array {
    return [
        'sections' => array_map(fn($k) => ['key' => $k, 'enabled' => in_array($k, ['hero', 'description', 'practical', 'faq', 'sessions'], true)], SECTION_KEYS),
        'hero' => ['image' => null, 'video_url' => null, 'countdown' => true],
        'partners' => [],
    ];
}

function cleanFile($v): ?string {
    if (!is_string($v) || $v === '') return null;
    $b = basename($v);
    return preg_match('/^[A-Za-z0-9._-]{1,120}$/', $b) ? $b : null;
}

function cleanUrl($v): ?string {
    $v = is_string($v) ? trim($v) : '';
    return $v !== '' && preg_match('#^https?://#i', $v) && strlen($v) <= 500 ? $v : null;
}

function cleanLayout($in): array {
    $out = defaultLayout();
    if (!is_array($in)) return $out;
    if (is_array($in['sections'] ?? null)) {
        $seen = [];
        $sections = [];
        foreach ($in['sections'] as $s) {
            $k = $s['key'] ?? null;
            if (!in_array($k, SECTION_KEYS, true) || isset($seen[$k])) continue;
            $seen[$k] = true;
            $sections[] = ['key' => $k, 'enabled' => !empty($s['enabled'])];
        }
        foreach (SECTION_KEYS as $k) if (!isset($seen[$k])) $sections[] = ['key' => $k, 'enabled' => false];
        $out['sections'] = $sections;
    }
    $h = is_array($in['hero'] ?? null) ? $in['hero'] : [];
    $out['hero'] = [
        'image' => cleanFile($h['image'] ?? null),
        'video_url' => cleanUrl($h['video_url'] ?? null),
        'countdown' => !array_key_exists('countdown', $h) || !empty($h['countdown']),
    ];
    $out['partners'] = [];
    foreach (array_slice(is_array($in['partners'] ?? null) ? $in['partners'] : [], 0, 24) as $p) {
        $out['partners'][] = [
            'name' => mb_substr(trim((string)($p['name'] ?? '')), 0, 120),
            'logo' => cleanFile($p['logo'] ?? null),
            'url' => cleanUrl($p['url'] ?? null),
        ];
    }
    return $out;
}

function cleanTheme($in): array {
    $in = is_array($in) ? $in : [];
    return [
        'primary' => hexColor($in['primary'] ?? null, '#b91c1c'),
        'accent' => hexColor($in['accent'] ?? null, '#f59e0b'),
        'mode' => ($in['mode'] ?? 'dark') === 'light' ? 'light' : 'dark',
        'heading_font' => FontCatalog::canonical($in['heading_font'] ?? null),
        'logo' => cleanFile($in['logo'] ?? null),
    ];
}

function cleanContent($in): array {
    $in = is_array($in) ? $in : [];
    $s = fn($v, $max) => mb_substr(trim((string)($v ?? '')), 0, $max);
    $list = function ($v, array $fields, int $maxItems) use ($s) {
        $out = [];
        foreach (array_slice(is_array($v) ? $v : [], 0, $maxItems) as $item) {
            if (!is_array($item)) continue;
            $row = [];
            foreach ($fields as $f => $max) $row[$f] = $s($item[$f] ?? '', $max);
            if (implode('', $row) !== '') $out[] = $row;
        }
        return $out;
    };
    $p = is_array($in['practical'] ?? null) ? $in['practical'] : [];
    return [
        'title' => $s($in['title'] ?? '', 120),
        'subtitle' => $s($in['subtitle'] ?? '', 200),
        'date_text' => $s($in['date_text'] ?? '', 120),
        'cta_label' => $s($in['cta_label'] ?? '', 40),
        'description_md' => $s($in['description_md'] ?? '', 8000),
        'practical' => [
            'hours' => $s($p['hours'] ?? '', 200),
            'ages' => $s($p['ages'] ?? '', 200),
            'info_md' => $s($p['info_md'] ?? '', 4000),
        ],
        'steps' => $list($in['steps'] ?? [], ['title' => 80, 'text' => 600], 8),
        'testimonials' => $list($in['testimonials'] ?? [], ['quote' => 600, 'author' => 80, 'role' => 80], 12),
        'faq' => $list($in['faq'] ?? [], ['q' => 200, 'a' => 2000], 30),
        'terms_text_md' => $s($in['terms_text_md'] ?? '', 20000),
        'seo_description' => $s($in['seo_description'] ?? '', 300),
    ];
}

// ── Payload ──────────────────────────────────────────────────────────────

function eventSettings(array $e): array {
    return [
        'id' => (int)$e['id'],
        'uniqid' => $e['uniqid'],
        'slug' => $e['slug'],
        'status' => $e['status'],
        'listed' => (int)$e['listed'] === 1,
        'sales_paused' => (int)$e['sales_paused'] === 1,
        'main_language' => $e['main_language'],
        'languages' => EventsRepo::languages($e),
        'timezone' => $e['timezone'],
        'currency' => $e['currency'],
        'venue_name' => $e['venue_name'],
        'venue_address' => $e['venue_address'],
        'venue_postal_code' => $e['venue_postal_code'],
        'venue_city' => $e['venue_city'],
        'venue_country' => $e['venue_country'],
        'lat' => $e['lat'] !== null ? (float)$e['lat'] : null,
        'lng' => $e['lng'] !== null ? (float)$e['lng'] : null,
        'region' => $e['region'],
        'audience' => $e['audience'],
        'team_size_min' => (int)$e['team_size_min'],
        'team_size_max' => (int)$e['team_size_max'],
        'require_player_details' => (int)$e['require_player_details'] === 1,
        'minor_age_threshold' => $e['minor_age_threshold'] !== null ? (int)$e['minor_age_threshold'] : null,
        'adult_age' => (int)$e['adult_age'],
        'sales_cutoff_minutes' => (int)$e['sales_cutoff_minutes'],
        'refund_policy' => $e['refund_policy'],
        'refund_days_before' => $e['refund_days_before'] !== null ? (int)$e['refund_days_before'] : null,
        'refund_retention_bp' => $e['refund_retention_bp'] !== null ? (int)$e['refund_retention_bp'] : null,
        'terms_pdf' => $e['terms_pdf'],
        'image_rights_enabled' => (int)$e['image_rights_enabled'] === 1,
        'newsletter_enabled' => (int)$e['newsletter_enabled'] === 1,
        'licensee_alert_email' => $e['licensee_alert_email'],
        'availability_display' => $e['availability_display'],
        'few_left_bp' => (int)$e['few_left_bp'],
        'last_tickets_banner' => (int)$e['last_tickets_banner'] === 1,
        'layout' => cleanLayout(EventsRepo::json($e['layout'])),
        'theme' => cleanTheme(EventsRepo::json($e['theme'])),
        'first_slot_at' => utcIso($e['first_slot_at']),
        'last_slot_end_at' => utcIso($e['last_slot_end_at']),
        'published_at' => utcIso($e['published_at']),
    ];
}

function typesPayload(array $types, string $tz): array {
    $out = [];
    foreach ($types as $t) {
        $out[] = [
            'id' => $t['id'],
            'role' => $t['role'],
            'label_i18n' => (object)$t['label_i18n'],
            'description_i18n' => (object)$t['description_i18n'],
            'base_price_cents' => $t['base_price_cents'],
            'vat_bp' => $t['vat_bp'] !== null ? (int)$t['vat_bp'] : null,
            'min_age' => $t['min_age'] !== null ? (int)$t['min_age'] : null,
            'cap_per_slot' => $t['cap_per_slot'] !== null ? (int)$t['cap_per_slot'] : null,
            'max_per_booking' => $t['max_per_booking'] !== null ? (int)$t['max_per_booking'] : null,
            'active' => (int)$t['active'] === 1,
            'steps' => array_map(fn($s) => [
                'id' => $s['id'],
                'price_cents' => $s['price_cents'],
                'ends_at' => utcToLocal($s['ends_at_raw'], $tz),
                'ends_after_sold' => $s['ends_after_sold'],
                'label_i18n' => (object)$s['label_i18n'],
            ], $t['steps']),
        ];
    }
    return $out;
}

function slotsPayload($db, array $e): array {
    $taken = EventsRepo::takenBySlot($db, (int)$e['id']);
    $out = [];
    foreach (EventsRepo::slots($db, (int)$e['id']) as $s) {
        $types = [];
        foreach ($s['types'] as $tid => $cap) $types[(string)$tid] = $cap;
        $out[] = [
            'id' => $s['id'],
            'starts_at' => utcToLocal($s['starts_at'], $e['timezone']),
            'starts_at_utc' => utcIso($s['starts_at']),
            'duration_minutes' => $s['duration_minutes'],
            'capacity' => $s['capacity'],
            'status' => $s['status'],
            'scenario_id' => $s['scenario_id'] !== null ? (int)$s['scenario_id'] : null,
            'label_i18n' => (object)$s['label_i18n'],
            'types' => (object)$types,
            'taken' => $taken[$s['id']]['total'] ?? 0,
        ];
    }
    return $out;
}

/** What still blocks publishing. Empty = can publish. */
function checklist($db, array $e): array {
    $missing = [];
    $contents = EventsRepo::contents($db, (int)$e['id']);
    $main = $contents[$e['main_language']] ?? [];
    if (trim($main['title'] ?? '') === '') $missing[] = 'title';
    if (trim($main['terms_text_md'] ?? '') === '' && empty($e['terms_pdf'])) $missing[] = 'terms';
    if (trim((string)$e['venue_city']) === '') $missing[] = 'venue';

    $types = EventsRepo::ticketTypes($db, (int)$e['id'], true);
    if (!$types) $missing[] = 'ticket_types';
    $paid = false;
    foreach ($types as $t) {
        if ($t['base_price_cents'] > 0) $paid = true;
        foreach ($t['steps'] as $s) if ($s['price_cents'] > 0) $paid = true;
    }
    $futureSlot = false;
    foreach (EventsRepo::slots($db, (int)$e['id']) as $s) {
        if ($s['status'] === 'open' && strtotime($s['starts_at'] . ' UTC') > time() && array_intersect(array_keys($s['types']), array_keys($types))) {
            $futureSlot = true;
            break;
        }
    }
    if (!$futureSlot) $missing[] = 'slots';

    $client = $db->fetch('SELECT * FROM clients WHERE id = ?', [$e['client_id']]);
    if (LegalInfo::missing($client)) $missing[] = 'legal_info';
    $termsVersion = EventsSettings::get($db, 'platform_terms_version', '');
    if (($client['events_terms_version'] ?? null) !== $termsVersion) $missing[] = 'platform_terms';
    if ($paid && EventsSettings::salesGateReason($db, (int)$e['client_id'], true) === 'payments_unavailable') $missing[] = 'stripe';
    return $missing;
}

function editorPayload($db, array $e): array {
    $contents = EventsRepo::contents($db, (int)$e['id']);
    $previewToken = EventsTokens::make(EventsTokens::PREVIEW, $e['uniqid'], $e['preview_nonce']);
    $base = PaymentsConfig::eventsPublicBase();
    $settings = eventSettings($e);
    $media = [];
    foreach (['logo' => $settings['theme']['logo'], 'hero' => $settings['layout']['hero']['image'], 'terms_pdf' => $settings['terms_pdf']] as $k => $f) {
        $media[$k] = EventsRepo::mediaUrl($e, $f);
    }
    return [
        'event' => $settings,
        'contents' => (object)array_map(fn($c) => cleanContent($c), $contents),
        'ticket_types' => typesPayload(EventsRepo::ticketTypes($db, (int)$e['id']), $e['timezone']),
        'slots' => slotsPayload($db, $e),
        'questions' => array_map(fn($q) => [
            'id' => $q['id'], 'kind' => $q['kind'], 'label_i18n' => (object)$q['label_i18n'],
            'options_i18n' => $q['options_i18n'], 'required' => $q['required'],
        ], EventsRepo::questions($db, (int)$e['id'])),
        'media_base' => PaymentsConfig::studioBase() . '/media/evt_' . $e['uniqid'] . '/',
        'media' => $media,
        'fonts' => FontCatalog::families(),
        'public_url' => $base . '/' . $e['slug'],
        'preview_url' => $base . '/' . $e['slug'] . '?preview=' . rawurlencode($previewToken),
        'checklist' => checklist($db, $e),
        'bookings_count' => (int)($db->fetch("SELECT COUNT(*) n FROM bookings WHERE event_id = ? AND status IN ('confirmed','pending')", [$e['id']])['n'] ?? 0),
        'addons' => addonsPayload($db, $e),
        'promo_codes' => promoPayload($db, $e),
        'jobs' => jobsPayload($db, (int)$e['id']),
        'cancelled_at' => utcIso($e['cancelled_at']),
        'staff_links' => staffLinksPayload($db, (int)$e['id']),
        'checkin_counts' => checkinCounts($db, (int)$e['id']),
    ];
}

function addonsPayload($db, array $e): array {
    $taken = EventsRepo::addonTaken($db, (int)$e['id']);
    $out = [];
    foreach (EventsRepo::addons($db, (int)$e['id']) as $a) {
        $out[] = [
            'id' => $a['id'],
            'label_i18n' => (object)$a['label_i18n'],
            'description_i18n' => (object)$a['description_i18n'],
            'image' => $a['image'],
            'image_url' => EventsRepo::mediaUrl($e, $a['image']),
            'price_cents' => $a['price_cents'],
            'vat_bp' => $a['vat_bp'] !== null ? (int)$a['vat_bp'] : null,
            'max_per_booking' => $a['max_per_booking'] !== null ? (int)$a['max_per_booking'] : null,
            'active' => (int)$a['active'] === 1,
            'variants' => array_values(array_map(fn($v) => [
                'id' => $v['id'],
                'label_i18n' => (object)$v['label_i18n'],
                'price_cents' => $v['price_cents'] !== null ? (int)$v['price_cents'] : null,
                'stock' => $v['stock'] !== null ? (int)$v['stock'] : null,
                'sold' => $taken[$v['id']] ?? 0,
                'active' => (int)$v['active'] === 1,
            ], $a['variants'])),
        ];
    }
    return $out;
}

function promoPayload($db, array $e): array {
    try {
        $rows = $db->fetchAll('SELECT * FROM event_promo_codes WHERE event_id = ? ORDER BY created_at, id', [$e['id']]);
    } catch (Throwable $ex) {
        return [];
    }
    return array_map(fn($r) => [
        'id' => (int)$r['id'], 'code' => $r['code'], 'kind' => $r['kind'], 'value' => (int)$r['value'],
        'max_uses' => $r['max_uses'] !== null ? (int)$r['max_uses'] : null,
        'valid_from' => utcToLocal($r['valid_from'], $e['timezone']), 'valid_until' => utcToLocal($r['valid_until'], $e['timezone']),
        'active' => (int)$r['active'] === 1, 'uses' => EventsRepo::promoUses($db, (int)$r['id']),
    ], $rows);
}

function jobPayload(?array $j): ?array {
    if (!$j) return null;
    $p = json_decode($j['progress'] ?? '{}', true) ?: [];
    unset($p['failed_ids']);
    return ['id' => (int)$j['id'], 'kind' => $j['kind'], 'slot_id' => $j['ref_id'] !== null ? (int)$j['ref_id'] : null,
            'status' => $j['status'], 'progress' => $p, 'reason' => $j['reason'], 'created_at' => utcIso($j['created_at'])];
}

function jobsPayload($db, int $eventId): array {
    try {
        return array_map('jobPayload', $db->fetchAll('SELECT * FROM event_jobs WHERE event_id = ? ORDER BY id DESC LIMIT 10', [$eventId]));
    } catch (Throwable $ex) {
        return [];
    }
}

/** Booking of one of the actor's events, or 404. */
function ownBooking($db, int $clientId, int $bookingId): array {
    $b = $bookingId > 0 ? $db->fetch('SELECT * FROM bookings WHERE id = ?', [$bookingId]) : null;
    if (!$b || (int)$b['client_id'] !== $clientId) fail('not_found', 404);
    return $b;
}

/** Studio row for a booking (list + detail). */
function bookingRow($db, array $e, array $r, bool $detail = false): array {
    $tickets = $db->fetchAll('SELECT id, ticket_type_id, label_snapshot, unit_price_cents, participant_first_name, participant_age, role, checked_in_at FROM booking_tickets WHERE booking_id = ? ORDER BY position', [$r['id']]);
    try {
        $addons = $db->fetchAll('SELECT addon_id, variant_id, qty, unit_price_cents, label_snapshot FROM booking_addons WHERE booking_id = ? ORDER BY id', [$r['id']]);
    } catch (Throwable $ex) {
        $addons = [];
    }
    $slotStart = $r['starts_at'] ?? ($db->fetch('SELECT starts_at FROM event_slots WHERE id = ?', [$r['slot_id']])['starts_at'] ?? null);
    $out = [
        'id' => (int)$r['id'],
        'reference' => $r['reference'],
        'status' => $r['status'],
        'payment_status' => $r['payment_status'],
        'source' => $r['source'],
        'slot_id' => (int)$r['slot_id'],
        'slot_starts_at' => utcToLocal($slotStart, $e['timezone']),
        'team_name' => $r['team_name'],
        'buyer_first_name' => $r['buyer_first_name'],
        'buyer_last_name' => $r['buyer_last_name'],
        'buyer_name' => trim(($r['buyer_first_name'] ?? '') . ' ' . ($r['buyer_last_name'] ?? '')),
        'buyer_email' => $r['buyer_email'],
        'buyer_phone' => $r['buyer_phone'],
        'language' => $r['language'],
        'tickets' => array_map(fn($t) => [
            'id' => (int)$t['id'], 'ticket_type_id' => (int)$t['ticket_type_id'], 'label' => $t['label_snapshot'],
            'unit_price_cents' => (int)$t['unit_price_cents'], 'first_name' => $t['participant_first_name'],
            'age' => $t['participant_age'] !== null ? (int)$t['participant_age'] : null, 'role' => $t['role'],
            'checked_in_at' => utcIso($t['checked_in_at']),
        ], $tickets),
        'addons' => array_map(fn($a) => ['variant_id' => (int)$a['variant_id'], 'qty' => (int)$a['qty'], 'unit_price_cents' => (int)$a['unit_price_cents'], 'label' => $a['label_snapshot']], $addons),
        'subtotal_cents' => (int)$r['subtotal_cents'],
        'discount_cents' => (int)$r['discount_cents'],
        'booking_fee_cents' => (int)$r['booking_fee_cents'],
        'total_cents' => (int)$r['total_cents'],
        'refunded_cents' => (int)$r['refunded_cents'],
        'fee_refunded_cents' => (int)$r['fee_refunded_cents'],
        'refundable_cents' => EventsBackoffice::licenseeRefundable($r),
        'disputed' => !empty($r['disputed_at']),
        'internal_notes' => $r['internal_notes'],
        'cancel_reason' => $r['cancel_reason'],
        'created_at' => utcIso($r['created_at']),
        'paid_at' => utcIso($r['paid_at']),
        'cancelled_at' => utcIso($r['cancelled_at']),
        'expires_at' => utcIso($r['expires_at']),
        'anonymised' => !empty($r['anonymised_at']),
    ];
    if ($detail) {
        $qs = [];
        foreach (EventsRepo::questions($db, (int)$e['id'], false) as $q) $qs[$q['id']] = $q;
        $out['answers'] = array_map(function ($a) use ($qs, $e) {
            $q = $qs[(int)$a['question_id']] ?? null;
            return [
                'question_id' => (int)$a['question_id'],
                'label' => $q ? EventsRepo::tr($q['label_i18n'], $e['main_language']) : '',
                'kind' => $q['kind'] ?? 'text',
                'value' => $a['value'],
                'display' => !$q ? $a['value'] : ($q['kind'] === 'checkbox' ? '✓' : ($q['kind'] === 'choice' ? EventsRepo::tr($q['options_i18n'][(int)$a['value']] ?? [], $e['main_language']) : $a['value'])),
            ];
        }, $db->fetchAll('SELECT question_id, value FROM booking_answers WHERE booking_id = ?', [$r['id']]));
        try {
            $out['refunds'] = array_map(fn($x) => [
                'amount_cents' => (int)$x['amount_cents'], 'fee_refunded_cents' => (int)$x['fee_refunded_cents'], 'reason' => $x['reason'],
                'initiated_by' => $x['initiated_by'], 'created_at' => utcIso($x['created_at']),
            ], $db->fetchAll('SELECT * FROM booking_refunds WHERE booking_id = ? ORDER BY id', [$r['id']]));
        } catch (Throwable $ex) {
            $out['refunds'] = [];
        }
        $out['consents'] = json_decode($r['consents'] ?? 'null', true);
        $out['log'] = array_map(fn($l) => ['type' => $l['type'], 'actor_type' => $l['actor_type'], 'data' => json_decode($l['data'] ?? 'null', true), 'created_at' => utcIso($l['created_at'])],
            $db->fetchAll('SELECT * FROM booking_log WHERE booking_id = ? ORDER BY id', [$r['id']]));
        $out['promo_code'] = $r['promo_code_id'] ? ($db->fetch('SELECT code FROM event_promo_codes WHERE id = ?', [$r['promo_code_id']])['code'] ?? null) : null;
        $out['manage_url'] = PaymentsConfig::eventsPublicBase() . '/booking/' . EventsTokens::make(EventsTokens::MANAGE, $r['uuid'], $r['token_nonce']);
    }
    return $out;
}

function staffLinkPayload(array $l): array {
    return [
        'id' => (int)$l['id'], 'label' => $l['label'], 'url' => EventsCheckin::linkUrl($l),
        'revoked' => !empty($l['revoked_at']),
        'locked' => !empty($l['locked_until']) && strtotime($l['locked_until'] . ' UTC') > time(),
        'last_used_at' => utcIso($l['last_used_at']), 'created_at' => utcIso($l['created_at']),
    ];
}

function staffLinksPayload($db, int $eventId): array {
    try {
        return array_map('staffLinkPayload', $db->fetchAll('SELECT * FROM event_staff_links WHERE event_id = ? AND revoked_at IS NULL ORDER BY id', [$eventId]));
    } catch (Throwable $ex) {
        return [];
    }
}

/** Arrived / expected people of the event (confirmed bookings). */
function checkinCounts($db, int $eventId): array {
    $r = $db->fetch(
        "SELECT COUNT(*) AS expected, SUM(bt.checked_in_at IS NOT NULL) AS arrived
           FROM booking_tickets bt JOIN bookings b ON b.id = bt.booking_id WHERE b.event_id = ? AND b.status = 'confirmed'",
        [$eventId]
    );
    return ['expected' => (int)($r['expected'] ?? 0), 'arrived' => (int)($r['arrived'] ?? 0)];
}

function bookingErrorResponse(BookingError $err): void {
    jsonResponse(['error' => $err->getMessage()] + ($err->getMessage() === 'validation' ? ['errors' => $err->details] : $err->details), $err->status);
}

function freeSlug($db, string $base, int $exceptId = 0): string {
    $base = Slug::normalize($base, 90) ?: 'evenement';
    if (strlen($base) < 3) $base .= '-event';
    $slug = $base;
    for ($i = 2; $i < 200; $i++) {
        if (!Slug::error($slug) && !$db->fetch('SELECT id FROM events WHERE slug = ? AND id <> ?', [$slug, $exceptId])) return $slug;
        $slug = $base . '-' . $i;
    }
    return $base . '-' . bin2hex(random_bytes(3));
}

// ── Upload ───────────────────────────────────────────────────────────────

const UPLOAD_KINDS = ['hero', 'logo', 'partner', 'step', 'terms_pdf', 'addon'];

function handleUpload(array $e): array {
    $kind = (string)($_POST['kind'] ?? '');
    if (!in_array($kind, UPLOAD_KINDS, true)) fail('invalid_kind');
    $f = $_FILES['file'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK) fail('no_file');
    $ext = strtolower(pathinfo((string)$f['name'], PATHINFO_EXTENSION));
    $dir = EventsRepo::mediaDir($e);
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) fail('storage_error', 500);
    $name = $kind . '_' . gmdate('YmdHis') . '_' . bin2hex(random_bytes(4));

    if ($kind === 'terms_pdf') {
        if ($ext !== 'pdf' || $f['size'] > 10 * 1024 * 1024) fail('invalid_pdf');
        $head = file_get_contents($f['tmp_name'], false, null, 0, 5);
        if ($head !== '%PDF-') fail('invalid_pdf');
        $name .= '.pdf';
        if (!move_uploaded_file($f['tmp_name'], "$dir/$name")) fail('storage_error', 500);
        return ['file' => $name, 'url' => EventsRepo::mediaUrl($e, $name)];
    }

    // Images: decoded and re-encoded with GD (drops metadata and anything that
    // is not pixels), longest side capped. No SVG: it would run on our origin.
    if ($f['size'] > 8 * 1024 * 1024) fail('file_too_large');
    $info = @getimagesize($f['tmp_name']);
    $mime = $info['mime'] ?? '';
    $src = match ($mime) {
        'image/png' => @imagecreatefrompng($f['tmp_name']),
        'image/jpeg' => @imagecreatefromjpeg($f['tmp_name']),
        'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($f['tmp_name']) : false,
        default => false,
    };
    if (!$src) fail('invalid_image');
    $w = imagesx($src);
    $h = imagesy($src);
    $max = $kind === 'hero' ? 2400 : 1200;
    $scale = min(1, $max / max($w, $h));
    $nw = max(1, (int)round($w * $scale));
    $nh = max(1, (int)round($h * $scale));
    $dst = imagecreatetruecolor($nw, $nh);
    $keepAlpha = $mime !== 'image/jpeg';
    if ($keepAlpha) {
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
    }
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    if ($keepAlpha) {
        $name .= '.png';
        $ok = imagepng($dst, "$dir/$name", 6);
    } else {
        $name .= '.jpg';
        $ok = imagejpeg($dst, "$dir/$name", 85);
    }
    if (!$ok) fail('storage_error', 500);
    return ['file' => $name, 'url' => EventsRepo::mediaUrl($e, $name), 'width' => $nw, 'height' => $nh];
}

// ── Router ───────────────────────────────────────────────────────────────

try {
    $db = Database::getInstance();
    if (!EventsSettings::migrated($db)) fail('events_unavailable', 503);
    // Auth FIRST: auth_tokens.expires_at is compared with NOW() in the server's
    // local time zone; only then pin this session to UTC for Events dates.
    $ctx = requireActor($db);
    EventsRepo::utcSession($db);
    $clientId = $ctx['clientId'];
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method === 'POST' && $action !== 'upload') {
        $data = getRequestData();
    }

    switch ($action) {
        case 'list': {
            $rows = $db->fetchAll(
                "SELECT e.*,
                    (SELECT COUNT(*) FROM event_slots s WHERE s.event_id = e.id AND s.status <> 'cancelled') AS slots_count,
                    (SELECT COUNT(*) FROM bookings b JOIN booking_tickets bt ON bt.booking_id = b.id WHERE b.event_id = e.id AND b.status = 'confirmed') AS tickets_sold,
                    (SELECT COALESCE(SUM(b.total_cents - b.booking_fee_cents - b.refunded_cents + b.fee_refunded_cents), 0) FROM bookings b WHERE b.event_id = e.id AND b.status = 'confirmed') AS revenue_cents
                   FROM events e WHERE e.client_id = ? AND e.status <> 'archived' ORDER BY COALESCE(e.first_slot_at, e.created_at) DESC",
                [$clientId]
            );
            $out = [];
            foreach ($rows as $r) {
                $contents = EventsRepo::contents($db, (int)$r['id']);
                $c = EventsRepo::content($contents, $r['main_language'], $r['main_language']);
                $layout = cleanLayout(EventsRepo::json($r['layout']));
                $out[] = [
                    'id' => (int)$r['id'],
                    'slug' => $r['slug'],
                    'title' => $c['title'] ?? '',
                    'status' => $r['status'],
                    'listed' => (int)$r['listed'] === 1,
                    'first_slot_at' => utcIso($r['first_slot_at']),
                    'last_slot_end_at' => utcIso($r['last_slot_end_at']),
                    'venue_city' => $r['venue_city'],
                    'hero' => EventsRepo::mediaUrl($r, $layout['hero']['image']),
                    'slots_count' => (int)$r['slots_count'],
                    'tickets_sold' => (int)$r['tickets_sold'],
                    'revenue_cents' => (int)$r['revenue_cents'],
                    'public_url' => PaymentsConfig::eventsPublicBase() . '/' . $r['slug'],
                ];
            }
            jsonResponse(['events' => $out]);
        }

        case 'get':
            jsonResponse(editorPayload($db, ownEvent($db, $clientId, (int)($_GET['id'] ?? 0))));

        case 'create': {
            $title = mb_substr(trim((string)($data['title'] ?? '')), 0, 120);
            if ($title === '') fail('validation', 422, ['errors' => ['title' => 'required']]);
            $lang = in_array($data['main_language'] ?? 'fr', EventsRepo::LANGS, true) ? ($data['main_language'] ?? 'fr') : 'fr';
            $client = $db->fetch('SELECT country, city, legal_email FROM clients WHERE id = ?', [$clientId]);
            $slug = freeSlug($db, $title . ' ' . date('Y'));
            $uniqid = bin2hex(random_bytes(6));
            $db->query(
                'INSERT INTO events (uniqid, client_id, slug, main_language, languages, venue_country, venue_city, licensee_alert_email, layout, theme, preview_nonce)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$uniqid, $clientId, $slug, $lang, json_encode([$lang]), $client['country'] ?? 'FR', null,
                 $client['legal_email'] ?? null, json_encode(defaultLayout()), json_encode(cleanTheme([])), EventsTokens::nonce()]
            );
            $id = (int)$db->lastInsertId();
            $db->query('INSERT INTO event_contents (event_id, lang, content) VALUES (?, ?, ?)', [$id, $lang, json_encode(cleanContent(['title' => $title]), JSON_UNESCAPED_UNICODE)]);
            Logger::log('events', 'POST', 'create', $ctx['actorId'], ['client_id' => $clientId, 'id' => $id], ['success' => true], 200);
            jsonResponse(editorPayload($db, EventsRepo::eventById($db, $id)));
        }

        case 'update': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $sets = [];
            $vals = [];
            $put = function (string $col, $val) use (&$sets, &$vals) { $sets[] = "$col = ?"; $vals[] = $val; };
            $str = fn($k, $max) => ($v = trim((string)($data[$k] ?? ''))) === '' ? null : mb_substr($v, 0, $max);

            if (array_key_exists('slug', $data)) {
                $slug = Slug::normalize((string)$data['slug'], 100);
                $err = Slug::error($slug);
                if (!$err && $db->fetch('SELECT id FROM events WHERE slug = ? AND id <> ?', [$slug, $e['id']])) $err = 'slug_taken';
                if ($err) fail('validation', 422, ['errors' => ['slug' => $err]]);
                $put('slug', $slug);
            }
            if (array_key_exists('main_language', $data) || array_key_exists('languages', $data)) {
                $main = in_array($data['main_language'] ?? $e['main_language'], EventsRepo::LANGS, true) ? ($data['main_language'] ?? $e['main_language']) : $e['main_language'];
                $langs = array_values(array_intersect(EventsRepo::LANGS, array_unique(array_merge([$main], is_array($data['languages'] ?? null) ? $data['languages'] : EventsRepo::languages($e)))));
                $put('main_language', $main);
                $put('languages', json_encode($langs));
            }
            if (array_key_exists('timezone', $data)) {
                $tz = (string)$data['timezone'];
                if (!in_array($tz, DateTimeZone::listIdentifiers(), true)) fail('validation', 422, ['errors' => ['timezone' => 'invalid']]);
                $put('timezone', $tz);
            }
            foreach (['venue_name' => 190, 'venue_address' => 255, 'venue_postal_code' => 20, 'venue_city' => 120] as $k => $max) {
                if (array_key_exists($k, $data)) $put($k, $str($k, $max));
            }
            if (array_key_exists('venue_country', $data)) $put('venue_country', strtoupper(substr((string)$data['venue_country'], 0, 2)) ?: null);
            foreach (['lat' => 90, 'lng' => 180] as $k => $lim) {
                if (array_key_exists($k, $data)) {
                    $v = $data[$k];
                    $put($k, ($v === null || $v === '' || !is_numeric($v) || abs((float)$v) > $lim) ? null : round((float)$v, 6));
                }
            }
            if (array_key_exists('region', $data)) $put('region', $str('region', 10));
            if (array_key_exists('audience', $data)) $put('audience', in_array($data['audience'], EventsRepo::AUDIENCES, true) ? $data['audience'] : 'all');
            foreach (['listed', 'sales_paused', 'require_player_details', 'image_rights_enabled', 'newsletter_enabled', 'last_tickets_banner'] as $k) {
                if (array_key_exists($k, $data)) $put($k, !empty($data[$k]) ? 1 : 0);
            }
            if (array_key_exists('team_size_min', $data)) $put('team_size_min', nInt($data['team_size_min'], 1, 30) ?? 1);
            if (array_key_exists('team_size_max', $data)) $put('team_size_max', nInt($data['team_size_max'], 1, 30) ?? 6);
            if (array_key_exists('minor_age_threshold', $data)) $put('minor_age_threshold', nInt($data['minor_age_threshold'], 1, 18));
            if (array_key_exists('adult_age', $data)) $put('adult_age', nInt($data['adult_age'], 16, 21) ?? 18);
            if (array_key_exists('sales_cutoff_minutes', $data)) $put('sales_cutoff_minutes', nInt($data['sales_cutoff_minutes'], 0, 7 * 24 * 60) ?? 60);
            if (array_key_exists('refund_policy', $data)) $put('refund_policy', in_array($data['refund_policy'], ['none', 'full_until', 'partial'], true) ? $data['refund_policy'] : 'none');
            if (array_key_exists('refund_days_before', $data)) $put('refund_days_before', nInt($data['refund_days_before'], 0, 365));
            if (array_key_exists('refund_retention_bp', $data)) $put('refund_retention_bp', nInt($data['refund_retention_bp'], 0, 10000));
            if (array_key_exists('terms_pdf', $data)) $put('terms_pdf', cleanFile($data['terms_pdf']));
            if (array_key_exists('licensee_alert_email', $data)) {
                $v = trim((string)$data['licensee_alert_email']);
                if ($v !== '' && !filter_var($v, FILTER_VALIDATE_EMAIL)) fail('validation', 422, ['errors' => ['licensee_alert_email' => 'invalid_email']]);
                $put('licensee_alert_email', $v !== '' ? $v : null);
            }
            if (array_key_exists('availability_display', $data)) $put('availability_display', $data['availability_display'] === 'exact' ? 'exact' : 'status');
            if (array_key_exists('few_left_bp', $data)) $put('few_left_bp', nInt($data['few_left_bp'], 0, 10000) ?? 2000);
            if (array_key_exists('layout', $data)) $put('layout', json_encode(cleanLayout($data['layout'])));
            if (array_key_exists('theme', $data)) $put('theme', json_encode(cleanTheme($data['theme'])));

            $min = array_key_exists('team_size_min', $data) ? (nInt($data['team_size_min'], 1, 30) ?? 1) : (int)$e['team_size_min'];
            $max = array_key_exists('team_size_max', $data) ? (nInt($data['team_size_max'], 1, 30) ?? 6) : (int)$e['team_size_max'];
            if ($min > $max) fail('validation', 422, ['errors' => ['team_size_max' => 'below_min']]);

            if ($sets) {
                $vals[] = $e['id'];
                $db->query('UPDATE events SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
            }
            jsonResponse(editorPayload($db, EventsRepo::eventById($db, (int)$e['id'])));
        }

        case 'content_save': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $lang = (string)($data['lang'] ?? '');
            if (!in_array($lang, EventsRepo::languages($e), true)) fail('validation', 422, ['errors' => ['lang' => 'not_an_event_language']]);
            $content = cleanContent($data['content'] ?? []);
            $db->query(
                'INSERT INTO event_contents (event_id, lang, content) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE content = VALUES(content)',
                [$e['id'], $lang, json_encode($content, JSON_UNESCAPED_UNICODE)]
            );
            jsonResponse(editorPayload($db, $e));
        }

        case 'ticket_types_save': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $in = is_array($data['types'] ?? null) ? array_slice($data['types'], 0, 20) : [];
            $existing = EventsRepo::ticketTypes($db, (int)$e['id']);
            $errors = [];
            foreach ($in as $i => $t) {
                if (!EventsRepo::cleanI18n($t['label_i18n'] ?? [])) $errors["types.$i.label"] = 'required';
                if ((int)($t['base_price_cents'] ?? 0) < 0) $errors["types.$i.base_price_cents"] = 'invalid';
            }
            if ($errors) fail('validation', 422, ['errors' => $errors]);

            $db->begin();
            try {
                $keep = [];
                foreach ($in as $pos => $t) {
                    $id = (int)($t['id'] ?? 0);
                    $row = [
                        in_array($t['role'] ?? 'player', EventsRepo::ROLES, true) ? ($t['role'] ?? 'player') : 'player',
                        json_encode(EventsRepo::cleanI18n($t['label_i18n'] ?? []), JSON_UNESCAPED_UNICODE),
                        json_encode(EventsRepo::cleanI18n($t['description_i18n'] ?? [], 500), JSON_UNESCAPED_UNICODE),
                        max(0, min(1000000, (int)($t['base_price_cents'] ?? 0))),
                        nInt($t['vat_bp'] ?? null, 0, 3000),
                        nInt($t['min_age'] ?? null, 0, 99),
                        nInt($t['cap_per_slot'] ?? null, 0, 10000),
                        nInt($t['max_per_booking'] ?? null, 1, 30),
                        $pos,
                        array_key_exists('active', $t) ? (!empty($t['active']) ? 1 : 0) : 1,
                    ];
                    if ($id && isset($existing[$id])) {
                        $db->query(
                            'UPDATE event_ticket_types SET role = ?, label_i18n = ?, description_i18n = ?, base_price_cents = ?, vat_bp = ?, min_age = ?,
                                cap_per_slot = ?, max_per_booking = ?, position = ?, active = ? WHERE id = ?',
                            array_merge($row, [$id])
                        );
                    } else {
                        $db->query(
                            'INSERT INTO event_ticket_types (role, label_i18n, description_i18n, base_price_cents, vat_bp, min_age, cap_per_slot, max_per_booking, position, active, event_id)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                            array_merge($row, [$e['id']])
                        );
                        $id = (int)$db->lastInsertId();
                        // A new type is sold on every existing slot by default.
                        $db->query('INSERT IGNORE INTO event_slot_ticket_types (slot_id, ticket_type_id) SELECT id, ? FROM event_slots WHERE event_id = ?', [$id, $e['id']]);
                    }
                    $keep[$id] = true;
                    $db->query('DELETE FROM event_price_steps WHERE ticket_type_id = ?', [$id]);
                    foreach (array_slice(is_array($t['steps'] ?? null) ? $t['steps'] : [], 0, 10) as $sp => $s) {
                        $endsAt = localToUtc($s['ends_at'] ?? null, $e['timezone']);
                        $after = nInt($s['ends_after_sold'] ?? null, 1, 100000);
                        if ($endsAt === null && $after === null) continue; // a tier must end somehow
                        $db->query(
                            'INSERT INTO event_price_steps (ticket_type_id, position, price_cents, ends_at, ends_after_sold, label_i18n) VALUES (?, ?, ?, ?, ?, ?)',
                            [$id, $sp, max(0, (int)($s['price_cents'] ?? 0)), $endsAt, $after, json_encode(EventsRepo::cleanI18n($s['label_i18n'] ?? []), JSON_UNESCAPED_UNICODE)]
                        );
                    }
                }
                foreach ($existing as $id => $t) {
                    if (isset($keep[$id])) continue;
                    $used = $db->fetch('SELECT 1 FROM booking_tickets WHERE ticket_type_id = ? LIMIT 1', [$id]);
                    if ($used) $db->query('UPDATE event_ticket_types SET active = 0 WHERE id = ?', [$id]);
                    else $db->query('DELETE FROM event_ticket_types WHERE id = ?', [$id]);
                }
                $db->commit();
            } catch (Throwable $ex) {
                $db->rollBack();
                throw $ex;
            }
            jsonResponse(editorPayload($db, $e));
        }

        case 'slots_save': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $in = is_array($data['slots'] ?? null) ? array_slice($data['slots'], 0, 500) : [];
            $existing = EventsRepo::slots($db, (int)$e['id']);
            $typeIds = array_keys(EventsRepo::ticketTypes($db, (int)$e['id']));
            $errors = [];
            $rows = [];
            foreach ($in as $i => $s) {
                $start = localToUtc($s['starts_at'] ?? null, $e['timezone']);
                if (!$start) $errors["slots.$i.starts_at"] = 'invalid';
                $id = (int)($s['id'] ?? 0);
                $capacity = nInt($s['capacity'] ?? null, 1, 10000) ?? 30;
                if ($id && isset($existing[$id])) {
                    $taken = EventsRepo::takenBySlot($db, (int)$e['id'])[$id]['total'] ?? 0;
                    if ($capacity < $taken) $errors["slots.$i.capacity"] = 'below_taken';
                }
                $rows[] = [$id, $start, nInt($s['duration_minutes'] ?? null, 5, 24 * 60) ?? 90, $capacity,
                    in_array($s['status'] ?? 'open', ['open', 'closed'], true) ? ($s['status'] ?? 'open') : 'open',
                    nInt($s['scenario_id'] ?? null, 1, PHP_INT_MAX),
                    json_encode(EventsRepo::cleanI18n($s['label_i18n'] ?? [], 80), JSON_UNESCAPED_UNICODE),
                    is_array($s['types'] ?? null) ? $s['types'] : null];
            }
            if ($errors) fail('validation', 422, ['errors' => $errors]);

            $db->begin();
            try {
                $keep = [];
                foreach ($rows as [$id, $start, $dur, $cap, $status, $scenario, $label, $types]) {
                    if ($id && isset($existing[$id])) {
                        if ($existing[$id]['status'] === 'cancelled') { $keep[$id] = true; continue; }
                        $db->query('UPDATE event_slots SET starts_at = ?, duration_minutes = ?, capacity = ?, status = ?, scenario_id = ?, label_i18n = ? WHERE id = ?',
                            [$start, $dur, $cap, $status, $scenario, $label, $id]);
                    } else {
                        $db->query('INSERT INTO event_slots (event_id, starts_at, duration_minutes, capacity, status, scenario_id, label_i18n) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            [$e['id'], $start, $dur, $cap, $status, $scenario, $label]);
                        $id = (int)$db->lastInsertId();
                        if ($types === null) $types = array_fill_keys($typeIds, null);
                    }
                    $keep[$id] = true;
                    if ($types !== null) {
                        $db->query('DELETE FROM event_slot_ticket_types WHERE slot_id = ?', [$id]);
                        foreach ($types as $tid => $tcap) {
                            if (!in_array((int)$tid, $typeIds, true)) continue;
                            $db->query('INSERT INTO event_slot_ticket_types (slot_id, ticket_type_id, cap) VALUES (?, ?, ?)', [$id, (int)$tid, nInt($tcap, 0, 10000)]);
                        }
                    }
                }
                foreach ($existing as $id => $s) {
                    if (isset($keep[$id])) continue;
                    if ($db->fetch('SELECT 1 FROM bookings WHERE slot_id = ? LIMIT 1', [$id])) {
                        throw new RuntimeException('slot_has_bookings:' . $id);
                    }
                    $db->query('DELETE FROM event_slots WHERE id = ?', [$id]);
                }
                $db->commit();
            } catch (RuntimeException $ex) {
                $db->rollBack();
                if (str_starts_with($ex->getMessage(), 'slot_has_bookings')) fail('slot_has_bookings', 409);
                throw $ex;
            } catch (Throwable $ex) {
                $db->rollBack();
                throw $ex;
            }
            EventsRepo::refreshSlotCache($db, (int)$e['id']);
            jsonResponse(editorPayload($db, EventsRepo::eventById($db, (int)$e['id'])));
        }

        case 'slots_generate': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $date = (string)($data['date'] ?? '');
            $from = (string)($data['from'] ?? '');
            $to = (string)($data['to'] ?? '');
            $every = nInt($data['every_minutes'] ?? null, 5, 24 * 60);
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}$/', $from) || !preg_match('/^\d{2}:\d{2}$/', $to) || !$every) {
                fail('validation', 422, ['errors' => ['generator' => 'invalid']]);
            }
            $tz = new DateTimeZone($e['timezone']);
            $cur = DateTime::createFromFormat('Y-m-d H:i', "$date $from", $tz);
            $end = DateTime::createFromFormat('Y-m-d H:i', "$date $to", $tz);
            if (!$cur || !$end || $end < $cur) fail('validation', 422, ['errors' => ['generator' => 'invalid']]);
            $typeIds = array_map('intval', is_array($data['ticket_type_ids'] ?? null) ? $data['ticket_type_ids'] : array_keys(EventsRepo::ticketTypes($db, (int)$e['id'], true)));
            $validTypes = array_keys(EventsRepo::ticketTypes($db, (int)$e['id']));
            $dur = nInt($data['duration_minutes'] ?? null, 5, 24 * 60) ?? 90;
            $cap = nInt($data['capacity'] ?? null, 1, 10000) ?? 30;
            $n = 0;
            $db->begin();
            while ($cur <= $end && $n < 200) {
                $utc = (clone $cur)->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
                $db->query('INSERT INTO event_slots (event_id, starts_at, duration_minutes, capacity) VALUES (?, ?, ?, ?)', [$e['id'], $utc, $dur, $cap]);
                $sid = (int)$db->lastInsertId();
                foreach ($typeIds as $tid) {
                    if (in_array($tid, $validTypes, true)) $db->query('INSERT INTO event_slot_ticket_types (slot_id, ticket_type_id) VALUES (?, ?)', [$sid, $tid]);
                }
                $cur->modify("+$every minutes");
                $n++;
            }
            $db->commit();
            EventsRepo::refreshSlotCache($db, (int)$e['id']);
            jsonResponse(['created' => $n] + editorPayload($db, EventsRepo::eventById($db, (int)$e['id'])));
        }

        case 'questions_save': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $in = is_array($data['questions'] ?? null) ? $data['questions'] : [];
            if (count($in) > 5) fail('validation', 422, ['errors' => ['questions' => 'max_5']]);
            $existing = [];
            foreach (EventsRepo::questions($db, (int)$e['id'], false) as $q) $existing[$q['id']] = $q;
            $keep = [];
            foreach ($in as $pos => $q) {
                $label = EventsRepo::cleanI18n($q['label_i18n'] ?? [], 200);
                if (!$label) fail('validation', 422, ['errors' => ["questions.$pos.label" => 'required']]);
                $kind = in_array($q['kind'] ?? 'text', ['text', 'choice', 'checkbox'], true) ? ($q['kind'] ?? 'text') : 'text';
                $options = [];
                if ($kind === 'choice') {
                    foreach (array_slice(is_array($q['options_i18n'] ?? null) ? $q['options_i18n'] : [], 0, 20) as $o) {
                        $o = EventsRepo::cleanI18n($o, 80);
                        if ($o) $options[] = $o;
                    }
                    if (count($options) < 2) fail('validation', 422, ['errors' => ["questions.$pos.options" => 'min_2']]);
                }
                $row = [$kind, json_encode($label, JSON_UNESCAPED_UNICODE), json_encode($options, JSON_UNESCAPED_UNICODE), !empty($q['required']) ? 1 : 0, $pos];
                $id = (int)($q['id'] ?? 0);
                if ($id && isset($existing[$id])) {
                    $db->query('UPDATE event_questions SET kind = ?, label_i18n = ?, options_i18n = ?, required = ?, position = ?, active = 1 WHERE id = ?', array_merge($row, [$id]));
                } else {
                    $db->query('INSERT INTO event_questions (kind, label_i18n, options_i18n, required, position, event_id) VALUES (?, ?, ?, ?, ?, ?)', array_merge($row, [$e['id']]));
                    $id = (int)$db->lastInsertId();
                }
                $keep[$id] = true;
            }
            foreach ($existing as $id => $q) {
                if (isset($keep[$id])) continue;
                // Answers already given keep their question (deactivated, not deleted).
                if ($db->fetch('SELECT 1 FROM booking_answers WHERE question_id = ? LIMIT 1', [$id])) $db->query('UPDATE event_questions SET active = 0 WHERE id = ?', [$id]);
                else $db->query('DELETE FROM event_questions WHERE id = ?', [$id]);
            }
            jsonResponse(editorPayload($db, $e));
        }

        case 'upload': {
            if ($method !== 'POST') fail('Method not allowed', 405);
            $e = ownEvent($db, $clientId, (int)($_POST['id'] ?? 0));
            jsonResponse(handleUpload($e));
        }

        case 'publish': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $missing = checklist($db, $e);
            if ($missing) fail('not_ready', 409, ['missing' => $missing]);
            $db->query("UPDATE events SET status = 'published', published_at = COALESCE(published_at, UTC_TIMESTAMP()) WHERE id = ?", [$e['id']]);
            Logger::log('events', 'POST', 'publish', $ctx['actorId'], ['id' => $e['id']], ['success' => true], 200);
            jsonResponse(editorPayload($db, EventsRepo::eventById($db, (int)$e['id'])));
        }

        case 'unpublish': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $db->query("UPDATE events SET status = 'draft' WHERE id = ?", [$e['id']]);
            jsonResponse(editorPayload($db, EventsRepo::eventById($db, (int)$e['id'])));
        }

        case 'duplicate': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $uniqid = bin2hex(random_bytes(6));
            $slug = freeSlug($db, preg_replace('/-\d{4}$/', '', $e['slug']) . '-' . (date('Y') + (strtotime($e['first_slot_at'] ?? 'now') < time() ? 0 : 1)));
            $cols = 'client_id, main_language, languages, timezone, currency, venue_name, venue_address, venue_postal_code, venue_city, venue_country, lat, lng, region, audience,
                     layout, theme, team_size_min, team_size_max, require_player_details, minor_age_threshold, adult_age, sales_cutoff_minutes, refund_policy,
                     refund_days_before, refund_retention_bp, terms_pdf, image_rights_enabled, newsletter_enabled, licensee_alert_email, availability_display, few_left_bp, last_tickets_banner';
            $db->begin();
            try {
                $db->query("INSERT INTO events (uniqid, slug, preview_nonce, listed, $cols) SELECT ?, ?, ?, listed, $cols FROM events WHERE id = ?", [$uniqid, $slug, EventsTokens::nonce(), $e['id']]);
                $newId = (int)$db->lastInsertId();
                $db->query('INSERT INTO event_contents (event_id, lang, content) SELECT ?, lang, content FROM event_contents WHERE event_id = ?', [$newId, $e['id']]);
                foreach (EventsRepo::ticketTypes($db, (int)$e['id'], true) as $t) {
                    $db->query('INSERT INTO event_ticket_types (event_id, role, label_i18n, description_i18n, base_price_cents, vat_bp, min_age, cap_per_slot, max_per_booking, position)
                                SELECT ?, role, label_i18n, description_i18n, base_price_cents, vat_bp, min_age, cap_per_slot, max_per_booking, position FROM event_ticket_types WHERE id = ?', [$newId, $t['id']]);
                    // Tiers are tied to the old dates: copied without their date limit would be wrong, so they are not copied.
                }
                $db->query('INSERT INTO event_questions (event_id, kind, label_i18n, options_i18n, required, position)
                            SELECT ?, kind, label_i18n, options_i18n, required, position FROM event_questions WHERE event_id = ? AND active = 1', [$newId, $e['id']]);
                $db->commit();
            } catch (Throwable $ex) {
                $db->rollBack();
                throw $ex;
            }
            // Media files: copy the folder so the new event owns its own copies.
            $src = EventsRepo::mediaDir($e);
            $dst = EventsRepo::mediaDir(['uniqid' => $uniqid]);
            if (is_dir($src) && @mkdir($dst, 0755, true)) {
                foreach (glob($src . '/*') ?: [] as $f) if (is_file($f)) @copy($f, $dst . '/' . basename($f));
            }
            jsonResponse(editorPayload($db, EventsRepo::eventById($db, $newId)));
        }

        case 'delete': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            if ($db->fetch('SELECT 1 FROM bookings WHERE event_id = ? LIMIT 1', [$e['id']])) {
                $db->query("UPDATE events SET status = 'archived' WHERE id = ?", [$e['id']]);
                jsonResponse(['archived' => true]);
            }
            $db->query('DELETE FROM events WHERE id = ?', [$e['id']]);
            jsonResponse(['deleted' => true]);
        }

        case 'bookings': {
            $e = ownEvent($db, $clientId, (int)($_GET['id'] ?? 0));
            $rows = $db->fetchAll(
                "SELECT b.*, s.starts_at,
                    (SELECT COUNT(*) FROM booking_tickets bt WHERE bt.booking_id = b.id) AS tickets
                   FROM bookings b JOIN event_slots s ON s.id = b.slot_id
                  WHERE b.event_id = ? AND b.status IN ('confirmed', 'pending', 'cancelled')
                  ORDER BY s.starts_at, b.created_at",
                [$e['id']]
            );
            $out = [];
            foreach ($rows as $r) $out[] = bookingRow($db, $e, $r);
            jsonResponse(['bookings' => $out]);
        }

        case 'booking': {
            $b = ownBooking($db, $clientId, (int)($_GET['booking_id'] ?? 0));
            jsonResponse(['booking' => bookingRow($db, EventsRepo::eventById($db, (int)$b['event_id']), $b, true)]);
        }

        case 'addons_save': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $in = is_array($data['addons'] ?? null) ? array_slice($data['addons'], 0, 20) : [];
            $existing = EventsRepo::addons($db, (int)$e['id']);
            foreach ($in as $i => $a) {
                if (!EventsRepo::cleanI18n($a['label_i18n'] ?? [])) fail('validation', 422, ['errors' => ["addons.$i.label" => 'required']]);
            }
            $db->begin();
            try {
                $keep = [];
                foreach ($in as $pos => $a) {
                    $id = (int)($a['id'] ?? 0);
                    $row = [
                        json_encode(EventsRepo::cleanI18n($a['label_i18n'] ?? []), JSON_UNESCAPED_UNICODE),
                        json_encode(EventsRepo::cleanI18n($a['description_i18n'] ?? [], 500), JSON_UNESCAPED_UNICODE),
                        cleanFile($a['image'] ?? null),
                        max(0, min(1000000, (int)($a['price_cents'] ?? 0))),
                        nInt($a['vat_bp'] ?? null, 0, 3000),
                        nInt($a['max_per_booking'] ?? null, 1, 50),
                        $pos,
                        array_key_exists('active', $a) ? (!empty($a['active']) ? 1 : 0) : 1,
                    ];
                    if ($id && isset($existing[$id])) {
                        $db->query('UPDATE event_addons SET label_i18n = ?, description_i18n = ?, image = ?, price_cents = ?, vat_bp = ?, max_per_booking = ?, position = ?, active = ? WHERE id = ?', array_merge($row, [$id]));
                    } else {
                        $db->query('INSERT INTO event_addons (label_i18n, description_i18n, image, price_cents, vat_bp, max_per_booking, position, active, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', array_merge($row, [$e['id']]));
                        $id = (int)$db->lastInsertId();
                    }
                    $keep[$id] = true;
                    $oldVariants = $existing[$id]['variants'] ?? [];
                    $variants = is_array($a['variants'] ?? null) && $a['variants'] ? array_slice($a['variants'], 0, 30) : [['label_i18n' => []]];
                    $keepV = [];
                    foreach ($variants as $vp => $v) {
                        $vid = (int)($v['id'] ?? 0);
                        $vrow = [json_encode(EventsRepo::cleanI18n($v['label_i18n'] ?? [], 80), JSON_UNESCAPED_UNICODE),
                                 nInt($v['price_cents'] ?? null, 0, 1000000), nInt($v['stock'] ?? null, 0, 100000), $vp,
                                 array_key_exists('active', $v) ? (!empty($v['active']) ? 1 : 0) : 1];
                        if ($vid && isset($oldVariants[$vid])) {
                            $db->query('UPDATE event_addon_variants SET label_i18n = ?, price_cents = ?, stock = ?, position = ?, active = ? WHERE id = ?', array_merge($vrow, [$vid]));
                        } else {
                            $db->query('INSERT INTO event_addon_variants (label_i18n, price_cents, stock, position, active, addon_id) VALUES (?, ?, ?, ?, ?, ?)', array_merge($vrow, [$id]));
                            $vid = (int)$db->lastInsertId();
                        }
                        $keepV[$vid] = true;
                    }
                    foreach ($oldVariants as $vid => $v) {
                        if (isset($keepV[$vid])) continue;
                        if ($db->fetch('SELECT 1 FROM booking_addons WHERE variant_id = ? LIMIT 1', [$vid])) $db->query('UPDATE event_addon_variants SET active = 0 WHERE id = ?', [$vid]);
                        else $db->query('DELETE FROM event_addon_variants WHERE id = ?', [$vid]);
                    }
                }
                foreach ($existing as $id => $a) {
                    if (isset($keep[$id])) continue;
                    if ($db->fetch('SELECT 1 FROM booking_addons WHERE addon_id = ? LIMIT 1', [$id])) $db->query('UPDATE event_addons SET active = 0 WHERE id = ?', [$id]);
                    else $db->query('DELETE FROM event_addons WHERE id = ?', [$id]);
                }
                $db->commit();
            } catch (Throwable $ex) {
                $db->rollBack();
                throw $ex;
            }
            jsonResponse(editorPayload($db, $e));
        }

        case 'promo_save': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $in = is_array($data['codes'] ?? null) ? array_slice($data['codes'], 0, 100) : [];
            $existing = [];
            foreach ($db->fetchAll('SELECT * FROM event_promo_codes WHERE event_id = ?', [$e['id']]) as $r) $existing[(int)$r['id']] = $r;
            $errors = [];
            $seen = [];
            foreach ($in as $i => $c) {
                $code = strtoupper(preg_replace('/[^A-Za-z0-9_-]/', '', (string)($c['code'] ?? '')));
                if (strlen($code) < 3) $errors["codes.$i.code"] = 'too_short';
                elseif (isset($seen[$code])) $errors["codes.$i.code"] = 'duplicate';
                $seen[$code] = true;
                $kind = ($c['kind'] ?? 'percent') === 'fixed' ? 'fixed' : 'percent';
                $v = (int)($c['value'] ?? 0);
                if ($v <= 0 || ($kind === 'percent' && $v > 10000)) $errors["codes.$i.value"] = 'invalid';
            }
            if ($errors) fail('validation', 422, ['errors' => $errors]);
            $db->begin();
            try {
                $keep = [];
                foreach ($in as $c) {
                    $id = (int)($c['id'] ?? 0);
                    $row = [strtoupper(preg_replace('/[^A-Za-z0-9_-]/', '', (string)$c['code'])), ($c['kind'] ?? 'percent') === 'fixed' ? 'fixed' : 'percent', (int)$c['value'],
                            nInt($c['max_uses'] ?? null, 1, 1000000), localToUtc($c['valid_from'] ?? null, $e['timezone']), localToUtc($c['valid_until'] ?? null, $e['timezone']),
                            array_key_exists('active', $c) ? (!empty($c['active']) ? 1 : 0) : 1];
                    if ($id && isset($existing[$id])) {
                        $db->query('UPDATE event_promo_codes SET code = ?, kind = ?, value = ?, max_uses = ?, valid_from = ?, valid_until = ?, active = ? WHERE id = ?', array_merge($row, [$id]));
                    } else {
                        $db->query('INSERT INTO event_promo_codes (code, kind, value, max_uses, valid_from, valid_until, active, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', array_merge($row, [$e['id']]));
                        $id = (int)$db->lastInsertId();
                    }
                    $keep[$id] = true;
                }
                foreach ($existing as $id => $r) {
                    if (isset($keep[$id])) continue;
                    // A used code stays (bookings reference it), just switched off.
                    if ($db->fetch('SELECT 1 FROM bookings WHERE promo_code_id = ? LIMIT 1', [$id])) $db->query('UPDATE event_promo_codes SET active = 0 WHERE id = ?', [$id]);
                    else $db->query('DELETE FROM event_promo_codes WHERE id = ?', [$id]);
                }
                $db->commit();
            } catch (Throwable $ex) {
                $db->rollBack();
                throw $ex;
            }
            jsonResponse(editorPayload($db, $e));
        }

        case 'booking_manual_create': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $lang = in_array($data['lang'] ?? '', EventsRepo::languages($e), true) ? $data['lang'] : $e['main_language'];
            try {
                $b = EventsBooking::createHold($db, $e, $data, $lang, [
                    'manual' => true, 'source' => $data['source'] ?? 'manual_onsite', 'paid' => !empty($data['paid']),
                    'actor_id' => $ctx['actorId'], 'notes' => $data['notes'] ?? null,
                ]);
            } catch (BookingError $err) {
                bookingErrorResponse($err);
            }
            if (!empty($data['send_email']) && $b['buyer_email']) EventsEmails::queue($db, 'booking_confirmation', (int)$b['id']);
            jsonResponse(['booking' => bookingRow($db, $e, $b, true)]);
        }

        case 'booking_update': {
            $b = ownBooking($db, $clientId, (int)($data['booking_id'] ?? 0));
            try {
                EventsBackoffice::updateDetails($db, $b, $data, false, $ctx['actor'] === 'admin' ? 'admin' : 'licensee', $ctx['actorId']);
            } catch (BookingError $err) {
                bookingErrorResponse($err);
            }
            $b = $db->fetch('SELECT * FROM bookings WHERE id = ?', [$b['id']]);
            jsonResponse(['booking' => bookingRow($db, EventsRepo::eventById($db, (int)$b['event_id']), $b, true)]);
        }

        case 'booking_refund': {
            $b = ownBooking($db, $clientId, (int)($data['booking_id'] ?? 0));
            try {
                EventsBackoffice::licenseeRefund($db, $b, (int)($data['amount_cents'] ?? 0), mb_substr(trim((string)($data['reason'] ?? '')), 0, 200),
                    $ctx['actor'] === 'admin' ? 'admin' : 'licensee', $ctx['actorId'], !array_key_exists('notify', $data) || !empty($data['notify']));
            } catch (BookingError $err) {
                bookingErrorResponse($err);
            } catch (\Stripe\Exception\ApiErrorException $err) {
                fail('stripe_error', 502, ['message' => $err->getMessage()]);
            }
            $b = $db->fetch('SELECT * FROM bookings WHERE id = ?', [$b['id']]);
            jsonResponse(['booking' => bookingRow($db, EventsRepo::eventById($db, (int)$b['event_id']), $b, true)]);
        }

        case 'booking_cancel': {
            $b = ownBooking($db, $clientId, (int)($data['booking_id'] ?? 0));
            try {
                EventsBackoffice::cancel($db, $b, !empty($data['refund']), false, mb_substr(trim((string)($data['reason'] ?? '')), 0, 255) ?: 'cancelled_by_organizer',
                    !array_key_exists('notify', $data) || !empty($data['notify']), $ctx['actor'] === 'admin' ? 'admin' : 'licensee', $ctx['actorId']);
            } catch (BookingError $err) {
                bookingErrorResponse($err);
            } catch (\Stripe\Exception\ApiErrorException $err) {
                fail('stripe_error', 502, ['message' => $err->getMessage()]);
            }
            $b = $db->fetch('SELECT * FROM bookings WHERE id = ?', [$b['id']]);
            jsonResponse(['booking' => bookingRow($db, EventsRepo::eventById($db, (int)$b['event_id']), $b, true)]);
        }

        case 'booking_resend': {
            $b = ownBooking($db, $clientId, (int)($data['booking_id'] ?? 0));
            if ($b['status'] !== 'confirmed' || !$b['buyer_email']) fail('not_sendable', 409);
            EventsEmails::queue($db, 'booking_confirmation', (int)$b['id']);
            EventsBooking::log($db, (int)$b['id'], 'resent', $ctx['actor'], $ctx['actorId']);
            jsonResponse(['queued' => true]);
        }

        case 'slot_cancel':
        case 'event_cancel': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $reason = mb_substr(trim((string)($data['reason'] ?? '')), 0, 200);
            $slotId = null;
            if ($action === 'slot_cancel') {
                $slotId = (int)($data['slot_id'] ?? 0);
                $slot = $db->fetch('SELECT * FROM event_slots WHERE id = ? AND event_id = ?', [$slotId, $e['id']]);
                if (!$slot) fail('not_found', 404);
                if ($slot['status'] === 'cancelled') fail('already_cancelled', 409);
            } elseif (!empty($e['cancelled_at'])) {
                fail('already_cancelled', 409);
            }
            $jobId = EventsBackoffice::startCancelJob($db, $e, $slotId, $reason ?: ($slotId ? 'slot_cancelled' : 'event_cancelled'), $ctx['actor'], $ctx['actorId']);
            $job = EventsBackoffice::processJob($db, $jobId); // first batch now, the rest via job polling / cron
            jsonResponse(['job' => jobPayload($job)] + editorPayload($db, EventsRepo::eventById($db, (int)$e['id'])));
        }

        case 'staff_link_create': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            if ((int)$db->fetch('SELECT COUNT(*) n FROM event_staff_links WHERE event_id = ? AND revoked_at IS NULL', [$e['id']])['n'] >= 20) fail('too_many_links', 409);
            [$link, $pin] = EventsCheckin::createLink($db, (int)$e['id'], trim((string)($data['label'] ?? '')));
            jsonResponse(['link' => staffLinkPayload($link), 'pin' => $pin]);
        }

        case 'staff_link_pin':
        case 'staff_link_revoke': {
            $e = ownEvent($db, $clientId, (int)($data['id'] ?? 0));
            $link = $db->fetch('SELECT * FROM event_staff_links WHERE id = ? AND event_id = ? AND revoked_at IS NULL', [(int)($data['link_id'] ?? 0), $e['id']]);
            if (!$link) fail('not_found', 404);
            if ($action === 'staff_link_revoke') {
                EventsCheckin::revokeLink($db, (int)$link['id']);
                jsonResponse(['revoked' => true]);
            }
            $pin = EventsCheckin::resetPin($db, (int)$link['id']);
            jsonResponse(['link' => staffLinkPayload($db->fetch('SELECT * FROM event_staff_links WHERE id = ?', [$link['id']])), 'pin' => $pin]);
        }

        case 'job': {
            $job = $db->fetch('SELECT j.* FROM event_jobs j JOIN events e ON e.id = j.event_id WHERE j.id = ? AND e.client_id = ?', [(int)($_GET['job_id'] ?? 0), $clientId]);
            if (!$job) fail('not_found', 404);
            if (in_array($job['status'], ['queued', 'running'], true)) $job = EventsBackoffice::processJob($db, (int)$job['id']);
            jsonResponse(['job' => jobPayload($job)]);
        }

        default:
            fail('Invalid action', 400);
    }
} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log('[events] ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    jsonResponse(['error' => 'Server error'], 500);
}
