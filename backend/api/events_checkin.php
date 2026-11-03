<?php
// Events - event-day check-in (phase 4). Design: Claude plan "ok-i-need-a-moonlit-goose".
//
// Two ways in:
//   - staff (volunteers): POST staff_login {token, pin} with the link token from
//     the licensee, then `Authorization: Bearer <session>` on every call. Staff
//     see names and arrival only: no email, phone or money.
//   - licensee / admin: the normal Studio X-Auth-Token + ?event_id (admin: + client_id).
//
// POST staff_login {token, pin}                 -> {session, event, label}
// GET  day[&date=YYYY-MM-DD]                     -> sessions of the day + confirmed bookings (+ check-in state)
// POST scan    {code}                            -> {booking}  QR content, QR URL or booking reference
// POST checkin {client_uuid, booking_id, ticket_ids|null, action: in|undo, occurred_at?} -> {tickets}

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
header('Cache-Control: no-store');
ini_set('display_errors', '0');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/EventsSettings.php';
require_once __DIR__ . '/../utils/EventsRepo.php';
require_once __DIR__ . '/../utils/EventsCheckin.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function body(): array {
    $d = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($d)) jsonResponse(['error' => 'invalid_json'], 400);
    return $d;
}

/** ['event' => row, 'staff' => bool, 'link_id' => ?int, 'actor_id' => ?int] or 401/403/404. */
function requireCheckinActor($db): array {
    $studio = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if ($studio !== '') {
        $tokenData = TokenManager::validateToken($db, $studio);
        if (!$tokenData) jsonResponse(['error' => 'Unauthorized'], 401);
        $isAdmin = ($tokenData['user_type'] ?? '') === 'admin';
        if (!$isAdmin && !empty($tokenData['device_id'])) jsonResponse(['error' => 'Forbidden'], 403);
        $clientId = $isAdmin ? (int)($_GET['client_id'] ?? 0) : (int)$tokenData['user_id'];
        if (!$isAdmin && !EventsSettings::clientEnabled($db, $clientId)) jsonResponse(['error' => 'events_disabled'], 403);
        $event = EventsRepo::eventById($db, (int)($_GET['event_id'] ?? 0));
        if (!$event || (int)$event['client_id'] !== $clientId) jsonResponse(['error' => 'not_found'], 404);
        return ['event' => $event, 'staff' => false, 'link_id' => null, 'actor_id' => (int)$tokenData['user_id']];
    }
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $session = str_starts_with($auth, 'Bearer ') ? substr($auth, 7) : '';
    $link = $session !== '' ? EventsCheckin::sessionLink($db, $session) : null;
    if (!$link) jsonResponse(['error' => 'session_expired'], 401);
    $event = EventsRepo::eventById($db, (int)$link['event_id']);
    if (!$event) jsonResponse(['error' => 'not_found'], 404);
    return ['event' => $event, 'staff' => true, 'link_id' => (int)$link['id'], 'actor_id' => null];
}

function bookingRow($db, array $b, bool $staff): array {
    $row = [
        'id' => (int)$b['id'], 'reference' => $b['reference'], 'team_name' => $b['team_name'],
        'buyer_name' => trim(($b['buyer_first_name'] ?? '') . ' ' . ($b['buyer_last_name'] ?? '')),
        'slot_id' => (int)$b['slot_id'], 'status' => $b['status'], 'source' => $b['source'],
        'payment_due' => $b['payment_status'] === 'offline_due',
        'tickets' => EventsCheckin::ticketsOf($db, (int)$b['id']),
    ];
    if (!$staff) {
        $row['buyer_email'] = $b['buyer_email'];
        $row['buyer_phone'] = $b['buyer_phone'];
    }
    return $row;
}

try {
    $db = Database::getInstance();
    if (!EventsSettings::migrated($db) || !EventsCheckin::migrated($db)) jsonResponse(['error' => 'events_unavailable'], 503);
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];

    if ($action === 'staff_login') {
        if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
        EventsRepo::utcSession($db);
        $d = body();
        try {
            $r = EventsCheckin::login($db, (string)($d['token'] ?? ''), (string)($d['pin'] ?? ''));
        } catch (RuntimeException $e) {
            $code = $e->getMessage();
            jsonResponse(['error' => $code], ['invalid_link' => 404, 'revoked' => 410, 'locked' => 423, 'rate_limited' => 429][$code] ?? 401);
        }
        $event = EventsRepo::eventById($db, (int)$r['link']['event_id']);
        $c = EventsRepo::content(EventsRepo::contents($db, (int)$event['id']), $event['main_language'], $event['main_language']);
        jsonResponse(['session' => $r['session'], 'event' => ['id' => (int)$event['id'], 'title' => $c['title'] ?? $event['slug']], 'label' => $r['link']['label']]);
    }

    // Auth BEFORE the UTC session: auth_tokens.expires_at is server-local time.
    $ctx = requireCheckinActor($db);
    EventsRepo::utcSession($db);
    $event = $ctx['event'];

    switch ($action) {
        case 'day':
            jsonResponse(EventsCheckin::day($db, $event, $_GET['date'] ?? null, $ctx['staff']) + ['staff' => $ctx['staff']]);

        case 'scan': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $d = body();
            $b = EventsCheckin::findByCode($db, (int)$event['id'], (string)($d['code'] ?? ''));
            if (!$b) jsonResponse(['error' => 'not_found'], 404);
            $slot = $db->fetch('SELECT starts_at FROM event_slots WHERE id = ?', [$b['slot_id']]);
            jsonResponse(['booking' => bookingRow($db, $b, $ctx['staff']) + ['slot_starts_at' => gmdate('c', strtotime($slot['starts_at'] . ' UTC'))]]);
        }

        case 'checkin': {
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $d = body();
            $uuid = (string)($d['client_uuid'] ?? '');
            if (!preg_match(EventsTokens::UUID_RE, $uuid)) jsonResponse(['error' => 'invalid_client_uuid'], 422);
            $b = $db->fetch('SELECT * FROM bookings WHERE id = ? AND event_id = ?', [(int)($d['booking_id'] ?? 0), $event['id']]);
            if (!$b) jsonResponse(['error' => 'not_found'], 404);
            try {
                $tickets = EventsCheckin::apply($db, $b, is_array($d['ticket_ids'] ?? null) ? $d['ticket_ids'] : null, (string)($d['action'] ?? 'in'),
                    $ctx['staff'] ? 'staff' : 'licensee', $d['occurred_at'] ?? null, $uuid, $ctx['link_id']);
            } catch (InvalidArgumentException $e) {
                jsonResponse(['error' => $e->getMessage()], 409);
            }
            jsonResponse(['tickets' => $tickets]);
        }

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Throwable $e) {
    error_log('[events_checkin] ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    jsonResponse(['error' => 'Server error'], 500);
}
