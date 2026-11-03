<?php
// Stripe webhook receiver (Connect endpoint: events from licensees' accounts).
// Design: Claude plan "ok-i-need-a-moonlit-goose".
//
// Every event is signature-checked against config stripe_webhook_secrets,
// recorded once in stripe_events (Stripe retries for up to 3 days, so a
// replay is a no-op) and dispatched. Answer 2xx only when handled; a 5xx makes
// Stripe retry.
//
// Handles: account.updated, account.application.deauthorized (phase 1);
// checkout.session.completed / .expired (phase 2); charge.refunded,
// charge.dispute.created / .closed (phase 3).

header('Content-Type: application/json');
header('Cache-Control: no-store');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/PaymentsConfig.php';
require_once __DIR__ . '/../utils/StripeConnect.php';
require_once __DIR__ . '/../utils/EventsRepo.php';
require_once __DIR__ . '/../utils/EventsBooking.php';
require_once __DIR__ . '/../utils/EventsBackoffice.php';

function hookResponse(int $code, array $body = []): void {
    http_response_code($code);
    echo json_encode($body ?: ['received' => $code < 300]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') hookResponse(405, ['error' => 'Method not allowed']);
if (!PaymentsConfig::stripeConfigured()) hookResponse(503, ['error' => 'stripe_not_configured']);
require_once __DIR__ . '/../vendor/autoload.php';

$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
$secrets = (array)PaymentsConfig::get('stripe_webhook_secrets', []);

$event = null;
foreach ($secrets as $secret) {
    if (!$secret) continue;
    try {
        $event = \Stripe\Webhook::constructEvent($payload, $signature, $secret, 300);
        break;
    } catch (\Stripe\Exception\SignatureVerificationException $e) {
        // Try the next endpoint secret.
    } catch (\UnexpectedValueException $e) {
        hookResponse(400, ['error' => 'invalid_payload']);
    }
}
if (!$event) hookResponse(400, ['error' => 'invalid_signature']);

$db = Database::getInstance();
EventsRepo::utcSession($db);

// Record once. A row that exists but never finished processing (crash, 5xx)
// is processed again; a finished one is acknowledged without side effects.
$db->query(
    'INSERT IGNORE INTO stripe_events (id, type, account, livemode) VALUES (?, ?, ?, ?)',
    [$event->id, $event->type, $event->account ?? null, !empty($event->livemode) ? 1 : 0]
);
$seen = $db->fetch('SELECT processed_at FROM stripe_events WHERE id = ?', [$event->id]);
if ($seen && $seen['processed_at'] !== null) hookResponse(200, ['received' => true, 'duplicate' => true]);

try {
    $object = $event->data->object ?? null;
    switch ($event->type) {
        case 'account.updated':
            if ($object) StripeConnect::syncFromAccount($db, $object);
            break;

        case 'account.application.deauthorized':
            // The licensee disconnected our platform from their Stripe dashboard.
            if (!empty($event->account)) StripeConnect::markDisconnected($db, $event->account);
            break;

        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded':
            // A booking checkout on a licensee's account: confirm it (idempotent).
            if ($object && !empty($object->client_reference_id)) {
                EventsBooking::fulfil($db, (string)$object->client_reference_id, $object, 'stripe');
            }
            break;

        case 'checkout.session.expired':
            if ($object && !empty($object->client_reference_id)) {
                $b = $db->fetch('SELECT id FROM bookings WHERE uuid = ?', [(string)$object->client_reference_id]);
                if ($b) EventsBooking::expire($db, (int)$b['id'], 'stripe', 'checkout_expired');
            }
            break;

        case 'charge.refunded':
            // Our own refunds are already recorded (idempotent); refunds made in the
            // licensee's Stripe dashboard are picked up here.
            if ($object) EventsBackoffice::syncChargeRefunds($db, $event->account ?? null, $object);
            break;

        case 'charge.dispute.created':
            if ($object) EventsBackoffice::disputeOpened($db, $object);
            break;

        case 'charge.dispute.closed':
            if ($object) EventsBackoffice::disputeClosed($db, $object);
            break;

        default:
            // Not used (yet): acknowledged so Stripe stops retrying.
            break;
    }
    $db->query('UPDATE stripe_events SET processed_at = UTC_TIMESTAMP(), error = NULL WHERE id = ?', [$event->id]);
    hookResponse(200);
} catch (Throwable $e) {
    error_log('[stripe_webhook] ' . $event->type . ' ' . $event->id . ': ' . $e->getMessage());
    $db->query('UPDATE stripe_events SET error = ? WHERE id = ?', [substr($e->getMessage(), 0, 2000), $event->id]);
    hookResponse(500, ['error' => 'processing_failed']);
}
