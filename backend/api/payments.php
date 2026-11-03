<?php
// Events - licensee payments setup (phase 1): legal identity, platform terms,
// Stripe Connect onboarding. Design: Claude plan "ok-i-need-a-moonlit-goose".
//
// Auth: licensee token (scoped to itself; needs events_enabled) or admin token
// with ?client_id=N (read + edit on the licensee's behalf).
//
// GET  status          -> {events_enabled, legal, missing[], slug, terms, commission, stripe, countries}
// POST legal_save      {legal fields..., slug?, accept_terms?} -> status | 422 {errors}
// POST connect_start   -> {url}  Stripe-hosted onboarding (creates the account on first call)
// POST connect_refresh -> status  re-read the account from Stripe (after returning from onboarding)
// GET  invoices        -> monthly commission invoices / credit notes (phase 3)
// GET  invoice_download&id&what=pdf|csv

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
header('Cache-Control: no-store');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/EventsSettings.php';
require_once __DIR__ . '/../utils/LegalInfo.php';
require_once __DIR__ . '/../utils/StripeConnect.php';
require_once __DIR__ . '/../utils/Slug.php';
require_once __DIR__ . '/../utils/EventsInvoices.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

/** JSON object body, or 400. Never treat a broken body as an empty form (it would wipe fields). */
function getRequestData(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) jsonResponse(['error' => 'invalid_json'], 400);
    return $data;
}

/** ['clientId', 'actor' => 'client'|'admin', 'actorId'] or a 401/403/400 exit. */
function requirePaymentsActor($db): array {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($header, 'Bearer ') === 0) $header = substr($header, 7);
    $tokenData = $header !== '' ? TokenManager::validateToken($db, $header) : null;
    if (!$tokenData) jsonResponse(['error' => 'Unauthorized'], 401);

    if (($tokenData['user_type'] ?? '') === 'admin') {
        $clientId = (int)($_GET['client_id'] ?? 0);
        if ($clientId <= 0 || !$db->fetch('SELECT id FROM clients WHERE id = ?', [$clientId])) {
            jsonResponse(['error' => 'client_id is required'], 400);
        }
        return ['clientId' => $clientId, 'actor' => 'admin', 'actorId' => (int)$tokenData['user_id']];
    }
    // Playground device tokens are licensee tokens too; they have no business here.
    if (!empty($tokenData['device_id'])) jsonResponse(['error' => 'Forbidden'], 403);
    $clientId = (int)$tokenData['user_id'];
    if (!EventsSettings::clientEnabled($db, $clientId)) jsonResponse(['error' => 'events_disabled'], 403);
    return ['clientId' => $clientId, 'actor' => 'client', 'actorId' => $clientId];
}

function loadClient($db, int $clientId): array {
    $row = $db->fetch(
        'SELECT id, email, name, company, events_enabled, events_commission_bp, events_commission_fixed_cents, '
        . LegalInfo::columns() . ' FROM clients WHERE id = ?',
        [$clientId]
    );
    if (!$row) jsonResponse(['error' => 'Client not found'], 404);
    return $row;
}

function buildStatus($db, int $clientId): array {
    $c = loadClient($db, $clientId);
    $termsRequired = EventsSettings::get($db, 'platform_terms_version', '');
    $missing = LegalInfo::missing($c);
    $termsOk = $termsRequired !== '' && ($c['events_terms_version'] ?? null) === $termsRequired;
    if (!$termsOk) $missing[] = 'terms';
    return [
        'events_enabled' => (int)$c['events_enabled'] === 1,
        'legal' => LegalInfo::toApi($c),
        'missing' => $missing,
        'slug' => $c['slug'],
        'terms' => [
            'required_version' => $termsRequired,
            'url' => EventsSettings::get($db, 'platform_terms_url', ''),
            'accepted_version' => $c['events_terms_version'],
            'accepted_at' => $c['events_terms_accepted_at'],
            'accepted' => $termsOk,
        ],
        'commission' => EventsSettings::commissionFor($db, $c),
        'stripe' => StripeConnect::status(StripeConnect::row($db, $clientId)),
        'countries' => EventsSettings::COUNTRIES,
    ];
}

try {
    $db = Database::getInstance();
    if (!EventsSettings::migrated($db)) jsonResponse(['error' => 'events_unavailable'], 503);

    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];
    $ctx = requirePaymentsActor($db);
    $clientId = $ctx['clientId'];

    switch ($action) {
        case 'status':
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            jsonResponse(['data' => buildStatus($db, $clientId)]);
            break;

        case 'legal_save':
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $data = getRequestData();
            if (!$data) jsonResponse(['error' => 'invalid_json'], 400);
            $current = loadClient($db, $clientId);
            [$clean, $errors] = LegalInfo::validate($data);

            // The Stripe account country is fixed once the account exists.
            $acct = StripeConnect::row($db, $clientId);
            if ($acct && empty($acct['disconnected_at']) && $clean['country'] && $acct['country']
                && $clean['country'] !== $acct['country']) {
                $errors['country'] = 'country_locked';
            }

            $slug = null;
            if (array_key_exists('slug', $data) && trim((string)$data['slug']) !== '') {
                $slug = Slug::normalize((string)$data['slug']);
                $slugErr = Slug::error($slug);
                if (!$slugErr && !Slug::clientSlugFree($db, $slug, $clientId)) $slugErr = 'slug_taken';
                if ($slugErr) $errors['slug'] = $slugErr;
            }
            // Saving with errors is allowed (draft), except hard format errors on
            // identifiers and the slug: those would be stored wrong.
            $blocking = array_intersect_key($errors, array_flip(['siret', 'vat_number', 'slug', 'country', 'legal_email']));
            $blocking = array_filter($blocking, fn($code) => $code !== 'required' && $code !== 'required_when_subject');
            if ($blocking) jsonResponse(['error' => 'validation', 'errors' => $errors], 422);

            $sets = [];
            $vals = [];
            foreach (LegalInfo::FIELDS as $f) {
                $sets[] = "$f = ?";
                $vals[] = $clean[$f];
            }
            if ($slug !== null) {
                $sets[] = 'slug = ?';
                $vals[] = $slug;
            }
            // VAT number changed (or never checked): ask VIES, never blocking.
            if ($clean['vat_number'] !== null
                && ($clean['vat_number'] !== $current['vat_number'] || $current['vat_checked_at'] === null)) {
                $valid = LegalInfo::viesCheck($clean['vat_number']);
                $sets[] = 'vat_valid = ?';
                $vals[] = $valid === null ? null : ($valid ? 1 : 0);
                $sets[] = 'vat_checked_at = ' . ($valid === null ? 'NULL' : 'UTC_TIMESTAMP()');
            } elseif ($clean['vat_number'] === null) {
                $sets[] = 'vat_valid = NULL';
                $sets[] = 'vat_checked_at = NULL';
            }
            if (!empty($data['accept_terms']) && $ctx['actor'] === 'client') {
                $sets[] = 'events_terms_version = ?';
                $vals[] = EventsSettings::get($db, 'platform_terms_version', '');
                $sets[] = 'events_terms_accepted_at = UTC_TIMESTAMP()';
            }
            $vals[] = $clientId;
            $db->query('UPDATE clients SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
            Logger::log('payments', 'POST', 'legal_save', $ctx['actorId'], ['client_id' => $clientId, 'actor' => $ctx['actor']], ['success' => true], 200);
            jsonResponse(['data' => buildStatus($db, $clientId), 'errors' => (object)$errors]);
            break;

        case 'connect_start':
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            if (!PaymentsConfig::stripeConfigured()) jsonResponse(['error' => 'stripe_not_configured'], 503);
            $status = buildStatus($db, $clientId);
            if (!empty($status['missing'])) {
                jsonResponse(['error' => 'legal_info_incomplete', 'missing' => $status['missing']], 409);
            }
            $client = loadClient($db, $clientId);
            $accountId = StripeConnect::ensureAccount($db, $client);
            $url = StripeConnect::onboardingLink($accountId);
            Logger::log('payments', 'POST', 'connect_start', $ctx['actorId'], ['client_id' => $clientId, 'account' => $accountId], ['success' => true], 200);
            jsonResponse(['url' => $url]);
            break;

        case 'connect_refresh':
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $row = StripeConnect::row($db, $clientId);
            if ($row && empty($row['disconnected_at']) && PaymentsConfig::stripeConfigured()) {
                StripeConnect::refresh($db, $row['stripe_account_id']);
            }
            jsonResponse(['data' => buildStatus($db, $clientId)]);
            break;

        case 'invoices':
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            try {
                $rows = $db->fetchAll('SELECT * FROM commission_invoices WHERE client_id = ? ORDER BY period_start DESC, id DESC', [$clientId]);
            } catch (Throwable $e) {
                $rows = [];
            }
            jsonResponse(['invoices' => array_map([EventsInvoices::class, 'toApi'], $rows)]);
            break;

        case 'invoice_download':
            $inv = $db->fetch('SELECT * FROM commission_invoices WHERE id = ? AND client_id = ?', [(int)($_GET['id'] ?? 0), $clientId]);
            if (!$inv) jsonResponse(['error' => 'not_found'], 404);
            EventsInvoices::stream($inv, ($_GET['what'] ?? 'pdf') === 'csv' ? 'csv' : 'pdf');
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (\Stripe\Exception\ApiErrorException $e) {
    error_log('[payments] Stripe error: ' . $e->getMessage());
    jsonResponse(['error' => 'stripe_error', 'message' => $e->getMessage()], 502);
} catch (Throwable $e) {
    error_log('[payments] ' . $e->getMessage());
    jsonResponse(['error' => 'Server error'], 500);
}
