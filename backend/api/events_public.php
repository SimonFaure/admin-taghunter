<?php
// Events - public API for events.taghunter.fr (no account; phase 2).
// Design: Claude plan "ok-i-need-a-moonlit-goose".
//
// GET  directory[&lang&region&audience&q]       upcoming listed events (all licensees)
// GET  organizer&slug[&lang]                     a licensee's upcoming events
// GET  event&slug[&lang][&preview=token]         full public page payload (no personal data)
// GET  availability&slug                         per-slot places (polled by the booking page)
// GET  meta&slug[&lang]                          short payload for SEO/social tags (events app index.php)
// POST quote        {slug, slot_id, tickets:[type_id...], lang}
// POST book         {slug, slot_id, tickets:[{ticket_type_id, first_name?, age?}], team_name?, buyer{}, answers{}, consents{}, lang}
//                   -> {checkout_url} (paid) | {confirmed: true, return_token} (free)
// GET  booking_return&b=<return token>[&session_id]  confirmation page data (fulfils if the webhook is late)
// POST cancel_hold  {b: <return token>}         buyer left Checkout: free the places now
// GET  booking&t=<manage token>                 "my booking" page
// GET  ticket&q=<qr token>                      what the QR code opens
// GET  ics&t=<manage token>                     calendar file
// POST manage_update {t, team_name?, tickets?: [{first_name, age}], answers?}   buyer edits until the sales cut-off
// Phase 3: event payload has `addons` + `has_promo_codes`; quote/book accept
// addons: [{variant_id, qty}] and promo_code.
//
// CORS: backend/.htaccess already sends Access-Control-Allow-Origin "*"; this
// endpoint must NOT add another one (see go.php). Only the preflight is answered here.

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}
header('Content-Type: application/json');
header('Cache-Control: no-store, max-age=0');
ini_set('display_errors', '0');

set_exception_handler(function ($e) {
    error_log('[events_public] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json');
    }
    echo json_encode(['error' => 'server_error']);
});

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/EventsSettings.php';
require_once __DIR__ . '/../utils/EventsRepo.php';
require_once __DIR__ . '/../utils/EventsPricing.php';
require_once __DIR__ . '/../utils/EventsTokens.php';
require_once __DIR__ . '/../utils/EventsBooking.php';
require_once __DIR__ . '/../utils/EventsBackoffice.php';
require_once __DIR__ . '/../utils/EventsEmails.php';
require_once __DIR__ . '/../utils/FontCatalog.php';
require_once __DIR__ . '/../utils/PublicRateLimit.php';
require_once __DIR__ . '/../utils/StripeConnect.php';
require_once __DIR__ . '/../utils/Ics.php';

function out($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function body(): array {
    $d = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($d)) out(['error' => 'invalid_json'], 400);
    return $d;
}

function lang($v, array $allowed = EventsRepo::LANGS, string $fallback = 'fr'): string {
    return in_array($v, $allowed, true) ? $v : $fallback;
}

function limit($db, string $bucket, int $max, int $window): void {
    if (!PublicRateLimit::hit($db, $bucket, $max, $window)) out(['error' => 'rate_limited'], 429);
}

function iso(?string $utc): ?string {
    return $utc ? str_replace(' ', 'T', $utc) . 'Z' : null;
}

function organizerPublic(array $c): array {
    return [
        'name' => $c['legal_name'] ?: ($c['company'] ?: $c['name']),
        'slug' => $c['slug'],
        'email' => $c['legal_email'],
        'phone' => $c['public_phone'],
        'address' => trim(implode(', ', array_filter([$c['address_line1'], $c['address_line2'], trim(($c['postal_code'] ?? '') . ' ' . ($c['city'] ?? ''))]))),
        'siret' => $c['siret'],
        'vat_number' => ($c['vat_regime'] ?? 'subject') === 'exempt' ? null : $c['vat_number'],
        'vat_exempt' => ($c['vat_regime'] ?? 'subject') === 'exempt',
    ];
}

function clientRow($db, int $id): array {
    return $db->fetch('SELECT * FROM clients WHERE id = ?', [$id]) ?: [];
}

/** Published event by slug (or a draft with a valid preview token). */
function loadPublicEvent($db, string $slug, ?string $preview): array {
    $e = $slug !== '' ? EventsRepo::eventBySlug($db, $slug) : null;
    if (!$e || $e['status'] === 'archived') out(['error' => 'not_found'], 404);
    $isPreview = false;
    if ($e['status'] !== 'published') {
        if (!$preview || !EventsTokens::verify(EventsTokens::PREVIEW, $preview, $e['uniqid'], $e['preview_nonce'])) out(['error' => 'not_found'], 404);
        $isPreview = true;
    }
    if (!EventsSettings::clientEnabled($db, (int)$e['client_id']) && !$isPreview) out(['error' => 'not_found'], 404);
    $e['_preview'] = $isPreview;
    return $e;
}

/** Current price + next tier change of each type. */
function publicTypes(array $event, array $types, array $takenByType, string $lang): array {
    $now = time();
    $out = [];
    foreach ($types as $t) {
        if ((int)$t['active'] !== 1) continue;
        $sold = $takenByType[$t['id']] ?? 0;
        $cur = EventsPricing::unitPrice($t, $sold, $now);
        $next = null;
        if ($cur['step_id'] !== null) {
            foreach ($t['steps'] as $s) {
                if ($s['id'] !== $cur['step_id']) continue;
                $after = EventsPricing::unitPrice($t, $s['ends_after_sold'] !== null ? max($sold, $s['ends_after_sold']) : $sold, $s['ends_at'] ?? PHP_INT_MAX);
                $next = [
                    'price_cents' => $s['ends_at'] !== null || $s['ends_after_sold'] !== null ? (function () use ($t, $s, $sold) {
                        // Price once THIS tier is over (by date or by count, whichever comes first).
                        $tmp = $t;
                        $tmp['steps'] = array_values(array_filter($t['steps'], fn($x) => $x['id'] !== $s['id']));
                        return EventsPricing::unitPrice($tmp, $sold, time())['price_cents'];
                    })() : $after['price_cents'],
                    'until' => $s['ends_at'] ? gmdate('c', $s['ends_at']) : null,
                    'remaining_at_price' => $s['ends_after_sold'] !== null ? max(0, $s['ends_after_sold'] - $sold) : null,
                ];
            }
        }
        $out[] = [
            'id' => $t['id'],
            'role' => $t['role'],
            'label' => EventsRepo::tr($t['label_i18n'], $lang, $event['main_language']),
            'description' => EventsRepo::tr($t['description_i18n'], $lang, $event['main_language']),
            'price_cents' => $cur['price_cents'],
            'base_price_cents' => $t['base_price_cents'],
            'next' => $next,
            'min_age' => $t['min_age'] !== null ? (int)$t['min_age'] : null,
            'max_per_booking' => $t['max_per_booking'] !== null ? (int)$t['max_per_booking'] : null,
        ];
    }
    return $out;
}

/** Future slots with availability. Exact numbers only when the licensee shows them. */
function publicSlots($db, array $event, array $types, string $lang, bool $salesOpen): array {
    $now = time();
    $taken = EventsRepo::takenBySlot($db, (int)$event['id']);
    $exact = $event['availability_display'] === 'exact';
    $out = [];
    foreach (EventsRepo::slots($db, (int)$event['id']) as $s) {
        if ($s['status'] === 'cancelled') continue;
        $start = strtotime($s['starts_at'] . ' UTC');
        if ($start <= $now) continue;
        $t = $taken[$s['id']] ?? ['total' => 0, 'by_type' => []];
        $remaining = max(0, $s['capacity'] - $t['total']);
        $onSale = $salesOpen && EventsRepo::slotOnSale($event, $s, $now);
        $status = !$onSale ? 'closed' : ($remaining <= 0 ? 'full'
            : ($remaining <= max(1, (int)floor($s['capacity'] * (int)$event['few_left_bp'] / 10000)) ? 'few_left' : 'available'));
        $slotTypes = [];
        foreach ($s['types'] as $tid => $_cap) {
            if (!isset($types[$tid]) || (int)$types[$tid]['active'] !== 1) continue;
            $cap = EventsRepo::typeCap($s, $types[$tid]);
            $typeRemaining = $cap === null ? $remaining : min($remaining, max(0, $cap - ($t['by_type'][$tid] ?? 0)));
            $slotTypes[] = ['id' => $tid, 'available' => $onSale && $typeRemaining > 0, 'remaining' => $typeRemaining];
        }
        $out[] = [
            'id' => $s['id'],
            'starts_at' => gmdate('c', $start),
            'ends_at' => gmdate('c', $start + $s['duration_minutes'] * 60),
            'duration_minutes' => $s['duration_minutes'],
            'label' => EventsRepo::tr($s['label_i18n'], $lang, $event['main_language']),
            'status' => $status,
            // Used by the booking form to cap quantities; shown only in "exact" mode.
            'remaining' => $remaining,
            'show_remaining' => $exact,
            'types' => $slotTypes,
        ];
    }
    return $out;
}

function salesOpen($db, array $event): bool {
    return $event['status'] === 'published' && empty($event['cancelled_at']) && (int)$event['sales_paused'] !== 1
        && EventsSettings::salesGateReason($db, (int)$event['client_id'], false) === null;
}

function refundText(array $event, string $lang): string {
    switch ($event['refund_policy']) {
        case 'full_until': return EventsEmails::str($lang, 'refund_full_until', ['days' => (int)$event['refund_days_before']]);
        case 'partial': return EventsEmails::str($lang, 'refund_partial', ['rate' => EventsEmails::percent((int)$event['refund_retention_bp'], $lang)]);
        default: return EventsEmails::str($lang, 'refund_none');
    }
}

function eventPayload($db, array $e, string $lang): array {
    $langs = EventsRepo::languages($e);
    $lang = lang($lang, $langs, $e['main_language']);
    $content = EventsRepo::content(EventsRepo::contents($db, (int)$e['id']), $lang, $e['main_language']);
    $layout = EventsRepo::json($e['layout']) ?: [];
    $theme = EventsRepo::json($e['theme']) ?: [];
    $client = clientRow($db, (int)$e['client_id']);
    $types = EventsRepo::ticketTypes($db, (int)$e['id']);
    $open = salesOpen($db, $e);
    $slots = publicSlots($db, $e, $types, $lang, $open);
    $com = EventsSettings::commissionFor($db, $client);

    $hero = $layout['hero'] ?? [];
    $partners = [];
    foreach ($layout['partners'] ?? [] as $p) {
        $partners[] = ['name' => $p['name'] ?? '', 'url' => $p['url'] ?? null, 'logo' => EventsRepo::mediaUrl($e, $p['logo'] ?? null)];
    }
    $font = FontCatalog::canonical($theme['heading_font'] ?? null);
    return [
        'event' => [
            'slug' => $e['slug'],
            'preview' => !empty($e['_preview']),
            'lang' => $lang,
            'languages' => $langs,
            'main_language' => $e['main_language'],
            'timezone' => $e['timezone'],
            'currency' => $e['currency'],
            'content' => $content + ['title' => $e['slug']],
            'sections' => array_values(array_filter($layout['sections'] ?? [], fn($s) => !empty($s['enabled']))),
            'hero' => [
                'image' => EventsRepo::mediaUrl($e, $hero['image'] ?? null),
                'video_url' => $hero['video_url'] ?? null,
                'countdown' => !empty($hero['countdown']),
            ],
            'partners' => $partners,
            'theme' => [
                'primary' => $theme['primary'] ?? '#b91c1c',
                'accent' => $theme['accent'] ?? '#f59e0b',
                'mode' => $theme['mode'] ?? 'dark',
                'heading_font' => $font,
                'font_faces' => FontCatalog::faces($font),
                'logo' => EventsRepo::mediaUrl($e, $theme['logo'] ?? null),
            ],
            'venue' => [
                'name' => $e['venue_name'], 'address' => $e['venue_address'], 'postal_code' => $e['venue_postal_code'],
                'city' => $e['venue_city'], 'country' => $e['venue_country'],
                'lat' => $e['lat'] !== null ? (float)$e['lat'] : null, 'lng' => $e['lng'] !== null ? (float)$e['lng'] : null,
            ],
            'audience' => $e['audience'],
            'rules' => [
                'team_size_min' => (int)$e['team_size_min'],
                'team_size_max' => (int)$e['team_size_max'],
                'require_player_details' => (int)$e['require_player_details'] === 1,
                'minor_age_threshold' => $e['minor_age_threshold'] !== null ? (int)$e['minor_age_threshold'] : null,
                'adult_age' => (int)$e['adult_age'],
            ],
            'refund_text' => refundText($e, $lang),
            'terms_pdf' => EventsRepo::mediaUrl($e, $e['terms_pdf']),
            'image_rights_enabled' => (int)$e['image_rights_enabled'] === 1,
            'newsletter_enabled' => (int)$e['newsletter_enabled'] === 1,
            'last_tickets_banner' => (int)$e['last_tickets_banner'] === 1,
            'sales_open' => $open,
            'first_slot_at' => iso($e['first_slot_at']),
            'last_slot_end_at' => iso($e['last_slot_end_at']),
        ],
        'organizer' => organizerPublic($client),
        'ticket_types' => publicTypes($e, $types, EventsRepo::takenByType($db, (int)$e['id']), $lang),
        'slots' => $slots,
        'questions' => array_map(fn($q) => [
            'id' => $q['id'],
            'kind' => $q['kind'],
            'label' => EventsRepo::tr($q['label_i18n'], $lang, $e['main_language']),
            'options' => array_map(fn($o) => EventsRepo::tr($o, $lang, $e['main_language']), $q['options_i18n']),
            'required' => $q['required'],
        ], EventsRepo::questions($db, (int)$e['id'])),
        'commission' => ['bp' => $com['bp'], 'fixed_cents' => $com['fixed_cents']],
        'addons' => publicAddons($db, $e, $lang),
        'has_promo_codes' => hasPromoCodes($db, (int)$e['id']),
        'platform_terms_url' => EventsSettings::get($db, 'platform_terms_url', ''),
    ];
}

/** Add-ons on sale, with what is left of each variant's stock. */
function publicAddons($db, array $e, string $lang): array {
    $taken = EventsRepo::addonTaken($db, (int)$e['id']);
    $out = [];
    foreach (EventsRepo::addons($db, (int)$e['id'], true) as $a) {
        if (!$a['variants']) continue;
        $out[] = [
            'id' => $a['id'],
            'label' => EventsRepo::tr($a['label_i18n'], $lang, $e['main_language']),
            'description' => EventsRepo::tr($a['description_i18n'], $lang, $e['main_language']),
            'image' => EventsRepo::mediaUrl($e, $a['image']),
            'max_per_booking' => $a['max_per_booking'] !== null ? (int)$a['max_per_booking'] : null,
            'variants' => array_values(array_map(function ($v) use ($e, $lang, $taken) {
                $remaining = $v['stock'] !== null ? max(0, (int)$v['stock'] - ($taken[$v['id']] ?? 0)) : null;
                return [
                    'id' => $v['id'],
                    'label' => EventsRepo::tr($v['label_i18n'], $lang, $e['main_language']),
                    'price_cents' => $v['unit_price_cents'],
                    'remaining' => $remaining,
                    'available' => $remaining === null || $remaining > 0,
                ];
            }, $a['variants'])),
        ];
    }
    return $out;
}

function hasPromoCodes($db, int $eventId): bool {
    try {
        return (bool)$db->fetch("SELECT 1 FROM event_promo_codes WHERE event_id = ? AND active = 1 AND (valid_until IS NULL OR valid_until > UTC_TIMESTAMP()) LIMIT 1", [$eventId]);
    } catch (Throwable $e) {
        return false;
    }
}

/** Buyer-facing booking summary (manage page / return page). */
function bookingPayload($db, array $b, bool $withManage): array {
    $e = EventsRepo::eventById($db, (int)$b['event_id']);
    $lang = lang($b['language'], EventsRepo::LANGS, $e['main_language']);
    $content = EventsRepo::content(EventsRepo::contents($db, (int)$e['id']), $lang, $e['main_language']);
    $slot = $db->fetch('SELECT * FROM event_slots WHERE id = ?', [$b['slot_id']]);
    $types = EventsRepo::ticketTypes($db, (int)$e['id']);
    $tickets = [];
    $rawTickets = $db->fetchAll('SELECT * FROM booking_tickets WHERE booking_id = ? ORDER BY position', [$b['id']]);
    foreach ($rawTickets as $t) {
        $type = $types[(int)$t['ticket_type_id']] ?? null;
        $tickets[] = [
            'label' => $type ? EventsRepo::tr($type['label_i18n'], $lang, $e['main_language']) : $t['label_snapshot'],
            'role' => $t['role'],
            'unit_price_cents' => (int)$t['unit_price_cents'],
            'first_name' => $t['participant_first_name'],
            'age' => $t['participant_age'] !== null ? (int)$t['participant_age'] : null,
        ];
    }
    $start = strtotime($slot['starts_at'] . ' UTC');
    $theme = EventsRepo::json($e['theme']) ?: [];
    $out = [
        'reference' => $b['reference'],
        'status' => $b['status'],
        'payment_status' => $b['payment_status'],
        'language' => $lang,
        'event' => [
            'slug' => $e['slug'],
            'title' => $content['title'] ?? $e['slug'],
            'timezone' => $e['timezone'],
            'venue' => trim(implode(', ', array_filter([$e['venue_name'], $e['venue_address'], trim(($e['venue_postal_code'] ?? '') . ' ' . ($e['venue_city'] ?? ''))]))),
            'lat' => $e['lat'] !== null ? (float)$e['lat'] : null,
            'lng' => $e['lng'] !== null ? (float)$e['lng'] : null,
            'theme' => ['primary' => $theme['primary'] ?? '#b91c1c', 'mode' => $theme['mode'] ?? 'dark', 'logo' => EventsRepo::mediaUrl($e, $theme['logo'] ?? null)],
        ],
        'slot' => ['starts_at' => gmdate('c', $start), 'ends_at' => gmdate('c', $start + (int)$slot['duration_minutes'] * 60), 'duration_minutes' => (int)$slot['duration_minutes']],
        'team_name' => $b['team_name'],
        'buyer' => ['first_name' => $b['buyer_first_name'], 'last_name' => $b['buyer_last_name'], 'email' => $b['buyer_email']],
        'tickets' => $tickets,
        'subtotal_cents' => (int)$b['subtotal_cents'],
        'discount_cents' => (int)$b['discount_cents'],
        'booking_fee_cents' => (int)$b['booking_fee_cents'],
        'total_cents' => (int)$b['total_cents'],
        'refunded_cents' => (int)$b['refunded_cents'],
        'currency' => $b['currency'],
        'refund_text' => refundText($e, $lang),
        'organizer' => organizerPublic(clientRow($db, (int)$b['client_id'])),
        'qr_token' => EventsTokens::make(EventsTokens::QR, $b['uuid'], $b['token_nonce']),
    ];
    try {
        $out['addons'] = array_map(fn($a) => ['label' => $a['label_snapshot'], 'qty' => (int)$a['qty'], 'unit_price_cents' => (int)$a['unit_price_cents']],
            $db->fetchAll('SELECT label_snapshot, qty, unit_price_cents FROM booking_addons WHERE booking_id = ? ORDER BY id', [$b['id']]));
        $out['promo_code'] = $b['promo_code_id'] ? ($db->fetch('SELECT code FROM event_promo_codes WHERE id = ?', [$b['promo_code_id']])['code'] ?? null) : null;
    } catch (Throwable $ex) {
        $out['addons'] = [];
        $out['promo_code'] = null;
    }
    if ($withManage) {
        $out['manage_token'] = EventsTokens::make(EventsTokens::MANAGE, $b['uuid'], $b['token_nonce']);
        // What the buyer may still change (names, ages, answers) until the sales cut-off.
        $cutoff = $start - (int)$e['sales_cutoff_minutes'] * 60;
        $out['editable'] = $b['status'] === 'confirmed' && time() < $cutoff && empty($b['anonymised_at']);
        $out['editable_until'] = gmdate('c', $cutoff);
        $out['rules'] = [
            'require_player_details' => (int)$e['require_player_details'] === 1,
            'minor_age_threshold' => $e['minor_age_threshold'] !== null ? (int)$e['minor_age_threshold'] : null,
            'adult_age' => (int)$e['adult_age'],
        ];
        $answers = [];
        foreach ($db->fetchAll('SELECT question_id, value FROM booking_answers WHERE booking_id = ?', [$b['id']]) as $a) $answers[(int)$a['question_id']] = $a['value'];
        $out['questions'] = array_map(fn($q) => [
            'id' => $q['id'], 'kind' => $q['kind'], 'label' => EventsRepo::tr($q['label_i18n'], $lang, $e['main_language']),
            'options' => array_map(fn($o) => EventsRepo::tr($o, $lang, $e['main_language']), $q['options_i18n']),
            'required' => $q['required'], 'value' => $answers[$q['id']] ?? null,
        ], EventsRepo::questions($db, (int)$e['id']));
        foreach ($out['tickets'] as $i => &$t) $t['min_age'] = isset($types[(int)($rawTickets[$i]['ticket_type_id'] ?? 0)]) ? $types[(int)$rawTickets[$i]['ticket_type_id']]['min_age'] : null;
        unset($t);
    }
    return $out;
}

/** Booking from a token of $purpose, or 404. */
function bookingFromToken($db, string $purpose, string $token): array {
    $uuid = EventsTokens::idOf($token);
    $b = $uuid ? $db->fetch('SELECT * FROM bookings WHERE uuid = ?', [$uuid]) : null;
    if (!$b || $b['anonymised_at'] || !EventsTokens::verify($purpose, $token, $b['uuid'], $b['token_nonce'])) out(['error' => 'not_found'], 404);
    return $b;
}

// ── Router ───────────────────────────────────────────────────────────────

$db = Database::getInstance();
if (!EventsSettings::migrated($db)) out(['error' => 'events_unavailable'], 503);
EventsRepo::utcSession($db);
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$ip = PublicRateLimit::clientIp();

switch ($action) {
    case 'directory': {
        $lang = lang($_GET['lang'] ?? 'fr');
        $where = ["e.status = 'published'", 'e.listed = 1', 'e.cancelled_at IS NULL', 'e.last_slot_end_at > UTC_TIMESTAMP()', 'c.events_enabled = 1'];
        $params = [];
        if (!empty($_GET['region'])) { $where[] = 'e.region = ?'; $params[] = substr((string)$_GET['region'], 0, 10); }
        if (!empty($_GET['audience']) && in_array($_GET['audience'], EventsRepo::AUDIENCES, true) && $_GET['audience'] !== 'all') {
            $where[] = "(e.audience = ? OR e.audience = 'all')";
            $params[] = $_GET['audience'];
        }
        $rows = $db->fetchAll(
            'SELECT e.*, c.legal_name, c.company, c.name AS client_name, c.slug AS client_slug
               FROM events e JOIN clients c ON c.id = e.client_id
              WHERE ' . implode(' AND ', $where) . ' ORDER BY e.first_slot_at LIMIT 200',
            $params
        );
        $q = mb_strtolower(trim((string)($_GET['q'] ?? '')));
        $out = [];
        foreach ($rows as $e) {
            $content = EventsRepo::content(EventsRepo::contents($db, (int)$e['id']), lang($lang, EventsRepo::languages($e), $e['main_language']), $e['main_language']);
            $title = $content['title'] ?? $e['slug'];
            if ($q !== '' && mb_strpos(mb_strtolower($title . ' ' . $e['venue_city'] . ' ' . ($content['subtitle'] ?? '')), $q) === false) continue;
            $types = EventsRepo::ticketTypes($db, (int)$e['id'], true);
            $sold = EventsRepo::takenByType($db, (int)$e['id']);
            $prices = array_map(fn($t) => EventsPricing::unitPrice($t, $sold[$t['id']] ?? 0, time())['price_cents'], $types);
            $next = $db->fetch("SELECT MIN(starts_at) AS s FROM event_slots WHERE event_id = ? AND status = 'open' AND starts_at > UTC_TIMESTAMP()", [$e['id']]);
            $layout = EventsRepo::json($e['layout']) ?: [];
            $theme = EventsRepo::json($e['theme']) ?: [];
            $out[] = [
                'slug' => $e['slug'],
                'title' => $title,
                'subtitle' => $content['subtitle'] ?? '',
                'date_text' => $content['date_text'] ?? '',
                'image' => EventsRepo::mediaUrl($e, $layout['hero']['image'] ?? null),
                'primary' => $theme['primary'] ?? '#b91c1c',
                'city' => $e['venue_city'],
                'region' => $e['region'],
                'audience' => $e['audience'],
                'next_slot_at' => iso($next['s'] ?? null),
                'last_slot_end_at' => iso($e['last_slot_end_at']),
                // "From" = cheapest PAID ticket (a free volunteer ticket would read as "free event").
                'price_from_cents' => $prices ? (array_filter($prices) ? min(array_filter($prices)) : 0) : null,
                'currency' => $e['currency'],
                'organizer' => $e['legal_name'] ?: ($e['company'] ?: $e['client_name']),
                'organizer_slug' => $e['client_slug'],
            ];
        }
        out(['events' => $out]);
    }

    case 'organizer': {
        $slug = (string)($_GET['slug'] ?? '');
        $c = $slug !== '' ? $db->fetch('SELECT * FROM clients WHERE slug = ? AND events_enabled = 1', [$slug]) : null;
        if (!$c) out(['error' => 'not_found'], 404);
        $lang = lang($_GET['lang'] ?? ($c['language'] ?? 'fr'));
        $events = [];
        foreach ($db->fetchAll("SELECT * FROM events WHERE client_id = ? AND status = 'published' AND listed = 1 AND cancelled_at IS NULL AND last_slot_end_at > UTC_TIMESTAMP() ORDER BY first_slot_at", [$c['id']]) as $e) {
            $content = EventsRepo::content(EventsRepo::contents($db, (int)$e['id']), lang($lang, EventsRepo::languages($e), $e['main_language']), $e['main_language']);
            $layout = EventsRepo::json($e['layout']) ?: [];
            $events[] = [
                'slug' => $e['slug'], 'title' => $content['title'] ?? $e['slug'], 'subtitle' => $content['subtitle'] ?? '',
                'date_text' => $content['date_text'] ?? '', 'image' => EventsRepo::mediaUrl($e, $layout['hero']['image'] ?? null),
                'city' => $e['venue_city'], 'first_slot_at' => iso($e['first_slot_at']), 'last_slot_end_at' => iso($e['last_slot_end_at']),
            ];
        }
        out(['organizer' => organizerPublic($c), 'events' => $events]);
    }

    case 'event': {
        $e = loadPublicEvent($db, (string)($_GET['slug'] ?? ''), $_GET['preview'] ?? null);
        out(eventPayload($db, $e, (string)($_GET['lang'] ?? $e['main_language'])));
    }

    case 'availability': {
        $e = loadPublicEvent($db, (string)($_GET['slug'] ?? ''), $_GET['preview'] ?? null);
        $types = EventsRepo::ticketTypes($db, (int)$e['id']);
        $lang = lang($_GET['lang'] ?? $e['main_language']);
        out([
            'slots' => publicSlots($db, $e, $types, $lang, salesOpen($db, $e)),
            'ticket_types' => publicTypes($e, $types, EventsRepo::takenByType($db, (int)$e['id']), $lang),
        ]);
    }

    case 'meta': {
        $e = EventsRepo::eventBySlug($db, (string)($_GET['slug'] ?? ''));
        if (!$e || $e['status'] !== 'published' || !EventsSettings::clientEnabled($db, (int)$e['client_id'])) out(['error' => 'not_found'], 404);
        $lang = lang($_GET['lang'] ?? $e['main_language'], EventsRepo::languages($e), $e['main_language']);
        $content = EventsRepo::content(EventsRepo::contents($db, (int)$e['id']), $lang, $e['main_language']);
        $layout = EventsRepo::json($e['layout']) ?: [];
        $types = EventsRepo::ticketTypes($db, (int)$e['id'], true);
        $sold = EventsRepo::takenByType($db, (int)$e['id']);
        $prices = array_map(fn($t) => EventsPricing::unitPrice($t, $sold[$t['id']] ?? 0, time())['price_cents'], $types);
        $slots = publicSlots($db, $e, EventsRepo::ticketTypes($db, (int)$e['id']), $lang, salesOpen($db, $e));
        $anyAvailable = (bool)array_filter($slots, fn($s) => in_array($s['status'], ['available', 'few_left'], true));
        $client = clientRow($db, (int)$e['client_id']);
        $desc = trim($content['seo_description'] ?? '') ?: trim($content['subtitle'] ?? '') ?: mb_substr(trim(preg_replace('/[#*_>\[\]()`]/', '', $content['description_md'] ?? '')), 0, 200);
        out([
            'slug' => $e['slug'],
            'lang' => $lang,
            'languages' => EventsRepo::languages($e),
            'title' => $content['title'] ?? $e['slug'],
            'description' => $desc,
            'image' => EventsRepo::mediaUrl($e, $layout['hero']['image'] ?? null),
            'listed' => (int)$e['listed'] === 1,
            'cancelled' => !empty($e['cancelled_at']),
            'start' => iso($e['first_slot_at']),
            'end' => iso($e['last_slot_end_at']),
            'venue' => ['name' => $e['venue_name'], 'address' => $e['venue_address'], 'postal_code' => $e['venue_postal_code'], 'city' => $e['venue_city'], 'country' => $e['venue_country'], 'lat' => $e['lat'], 'lng' => $e['lng']],
            'price_low_cents' => $prices ? min($prices) : null,
            'price_high_cents' => $prices ? max($prices) : null,
            'currency' => $e['currency'],
            'available' => $anyAvailable,
            'organizer' => ['name' => organizerPublic($client)['name'], 'slug' => $client['slug']],
        ]);
    }

    case 'quote': {
        if ($method !== 'POST') out(['error' => 'method_not_allowed'], 405);
        limit($db, "quote:$ip", 120, 300);
        $d = body();
        $e = loadPublicEvent($db, (string)($d['slug'] ?? ''), $d['preview'] ?? null);
        $ids = array_map('intval', array_slice(is_array($d['tickets'] ?? null) ? $d['tickets'] : [], 0, EventsBooking::MAX_TICKETS));
        try {
            out(EventsBooking::quote($db, $e, (int)($d['slot_id'] ?? 0), $ids, is_array($d['addons'] ?? null) ? array_slice($d['addons'], 0, 30) : [],
                (string)($d['promo_code'] ?? ''), lang($d['lang'] ?? $e['main_language'])));
        } catch (BookingError $err) {
            out(['error' => $err->getMessage()] + $err->details, $err->status);
        }
    }

    case 'book': {
        if ($method !== 'POST') out(['error' => 'method_not_allowed'], 405);
        limit($db, "book:$ip", 30, 600); // generous: visitors at a venue often share one IP
        $d = body();
        $email = strtolower(trim((string)($d['buyer']['email'] ?? '')));
        if ($email !== '') limit($db, 'book-email:' . sha1($email), 6, 600);
        $e = loadPublicEvent($db, (string)($d['slug'] ?? ''), null);
        $lang = lang($d['lang'] ?? $e['main_language'], EventsRepo::languages($e), $e['main_language']);
        try {
            $b = EventsBooking::createHold($db, $e, $d, $lang);
        } catch (BookingError $err) {
            out(['error' => $err->getMessage(), 'details' => (object)$err->details], $err->status);
        }
        $returnToken = EventsTokens::make(EventsTokens::RETURN, $b['uuid'], $b['token_nonce']);
        if ($b['status'] === 'confirmed') {
            EventsEmails::queueConfirmation($db, (int)$b['id']);
            out(['confirmed' => true, 'return_token' => $returnToken]);
        }
        try {
            $title = EventsRepo::content(EventsRepo::contents($db, (int)$e['id']), $lang, $e['main_language'])['title'] ?? $e['slug'];
            $url = EventsBooking::startCheckout($db, $b, $e, $lang, $title);
        } catch (Throwable $err) {
            EventsBooking::expire($db, (int)$b['id'], 'system', 'checkout_failed');
            error_log('[events_public] checkout failed for ' . $b['uuid'] . ': ' . $err->getMessage());
            out(['error' => $err instanceof BookingError ? $err->getMessage() : 'payment_unavailable'], 502);
        }
        out(['checkout_url' => $url, 'return_token' => $returnToken]);
    }

    case 'booking_return': {
        limit($db, "return:$ip", 60, 300);
        $b = bookingFromToken($db, EventsTokens::RETURN, (string)($_GET['b'] ?? ''));
        // The webhook may not have arrived yet: ask Stripe directly.
        if (in_array($b['status'], ['pending', 'expired'], true) && $b['stripe_checkout_session_id'] && PaymentsConfig::stripeConfigured()) {
            try {
                $session = StripeConnect::client()->checkout->sessions->retrieve($b['stripe_checkout_session_id'], [], ['stripe_account' => $b['stripe_account_id']]);
                EventsBooking::fulfil($db, $b['uuid'], $session, 'buyer_return');
                $b = $db->fetch('SELECT * FROM bookings WHERE id = ?', [$b['id']]);
            } catch (Throwable $err) {
                error_log('[events_public] return check failed for ' . $b['uuid'] . ': ' . $err->getMessage());
            }
        }
        out(bookingPayload($db, $b, $b['status'] === 'confirmed'));
    }

    case 'cancel_hold': {
        if ($method !== 'POST') out(['error' => 'method_not_allowed'], 405);
        limit($db, "return:$ip", 60, 300);
        $d = body();
        $b = bookingFromToken($db, EventsTokens::RETURN, (string)($d['b'] ?? ''));
        if ($b['status'] === 'pending') {
            if ($b['stripe_checkout_session_id'] && PaymentsConfig::stripeConfigured()) {
                try {
                    $s = StripeConnect::client()->checkout->sessions->expire($b['stripe_checkout_session_id'], [], ['stripe_account' => $b['stripe_account_id']]);
                } catch (Throwable $err) {
                    // Already paid or already expired: leave it to the webhook / fulfil.
                    out(['released' => false]);
                }
            }
            EventsBooking::expire($db, (int)$b['id'], 'buyer', 'left_checkout');
            out(['released' => true]);
        }
        out(['released' => false]);
    }

    case 'booking': {
        limit($db, "view:$ip", 120, 300);
        $b = bookingFromToken($db, EventsTokens::MANAGE, (string)($_GET['t'] ?? ''));
        out(bookingPayload($db, $b, true));
    }

    case 'manage_update': {
        if ($method !== 'POST') out(['error' => 'method_not_allowed'], 405);
        limit($db, "manage:$ip", 30, 600);
        $d = body();
        $b = bookingFromToken($db, EventsTokens::MANAGE, (string)($d['t'] ?? ''));
        try {
            EventsBackoffice::updateDetails($db, $b, array_intersect_key($d, array_flip(['team_name', 'tickets', 'answers'])), true, 'buyer', null);
        } catch (BookingError $err) {
            out(['error' => $err->getMessage(), 'details' => (object)$err->details], $err->status);
        }
        out(bookingPayload($db, $db->fetch('SELECT * FROM bookings WHERE id = ?', [$b['id']]), true));
    }

    case 'ticket': {
        limit($db, "view:$ip", 120, 300);
        $b = bookingFromToken($db, EventsTokens::QR, (string)($_GET['q'] ?? ''));
        $p = bookingPayload($db, $b, false);
        out([
            'reference' => $p['reference'], 'status' => $p['status'], 'event' => $p['event'], 'slot' => $p['slot'],
            'team_name' => $p['team_name'], 'tickets' => array_map(fn($t) => ['label' => $t['label'], 'first_name' => $t['first_name']], $p['tickets']),
            'qr_token' => $p['qr_token'],
        ]);
    }

    case 'ics': {
        $b = bookingFromToken($db, EventsTokens::MANAGE, (string)($_GET['t'] ?? ''));
        $p = bookingPayload($db, $b, true);
        $manage = PaymentsConfig::eventsPublicBase() . '/booking/' . $p['manage_token'];
        header('Content-Type: text/calendar; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $p['reference'] . '.ics"');
        echo Ics::event($b['uuid'], strtotime($p['slot']['starts_at']), strtotime($p['slot']['ends_at']), $p['event']['title'], $p['event']['venue'], $p['reference'] . ' · ' . $manage, $manage);
        exit;
    }

    default:
        out(['error' => 'invalid_action'], 400);
}
