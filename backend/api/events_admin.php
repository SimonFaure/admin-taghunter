<?php
// Events - admin-only settings (phase 1). Design: Claude plan "ok-i-need-a-moonlit-goose".
//
// GET  settings                    -> platform defaults + Stripe/Mailjet configuration state
// POST settings_save               {commission_bp_default?, commission_fixed_cents_default?,
//                                   platform_terms_version?, platform_terms_url?, invoice_series_prefix?, invoice_issuer?}
// GET  licensee&client_id=N        -> Events switch, commission (custom + effective), slug,
//                                     legal info (read-only), missing fields, Stripe status
// POST licensee_save               {client_id, events_enabled?, commission_bp?|null,
//                                   commission_fixed_cents?|null, slug?|null}
// POST vies_recheck                {client_id} -> re-ask VIES for the stored VAT number
// GET  revenue&year=YYYY            -> sales / fees / refunds per licensee per month (phase 3)
// GET  invoices[&period=YYYY-MM]    -> every commission invoice
// POST invoices_generate            {period: YYYY-MM, client_id?} -> issue missing invoices (idempotent)
// GET  invoice_download&id&what=pdf|csv
//
// Kept out of clients.php on purpose: these fields are admin-only by design
// and must never ride on a generic update allowlist.

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

/** JSON object body, or 400 (a broken body must never read as "no changes" or "clear fields"). */
function getRequestData(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) jsonResponse(['error' => 'invalid_json'], 400);
    return $data;
}

function requireAdminToken($db): int {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($header, 'Bearer ') === 0) $header = substr($header, 7);
    $tokenData = $header !== '' ? TokenManager::validateToken($db, $header) : null;
    if (!$tokenData) jsonResponse(['error' => 'Unauthorized'], 401);
    if (($tokenData['user_type'] ?? '') !== 'admin') jsonResponse(['error' => 'Forbidden'], 403);
    return (int)$tokenData['user_id'];
}

/** null stays null (= use the default); otherwise a clamped non-negative int. */
function nullableInt($v, int $max): ?int {
    if ($v === null || $v === '') return null;
    return max(0, min($max, (int)$v));
}

function settingsPayload($db): array {
    $all = EventsSettings::all($db);
    [$bp, $fixed] = EventsSettings::defaultCommission($db);
    $issuer = json_decode($all['invoice_issuer'] ?? '{}', true);
    return [
        'commission_bp_default' => $bp,
        'commission_fixed_cents_default' => $fixed,
        'platform_terms_version' => $all['platform_terms_version'] ?? '',
        'platform_terms_url' => $all['platform_terms_url'] ?? '',
        'invoice_series_prefix' => $all['invoice_series_prefix'] ?? 'TH-COM',
        'invoice_issuer' => is_array($issuer) ? $issuer : new stdClass(),
        'stripe_configured' => PaymentsConfig::stripeConfigured(),
        'stripe_live' => PaymentsConfig::stripeLive(),
        'mailjet_configured' => PaymentsConfig::get('mailjet_api_key') !== '' && PaymentsConfig::get('mailjet_api_secret') !== '',
    ];
}

function licenseePayload($db, int $clientId): array {
    $c = $db->fetch(
        'SELECT id, email, name, company, events_enabled, events_commission_bp, events_commission_fixed_cents, '
        . LegalInfo::columns() . ' FROM clients WHERE id = ?',
        [$clientId]
    );
    if (!$c) jsonResponse(['error' => 'Client not found'], 404);
    return [
        'client_id' => (int)$c['id'],
        'events_enabled' => (int)$c['events_enabled'] === 1,
        'commission_bp' => $c['events_commission_bp'] !== null ? (int)$c['events_commission_bp'] : null,
        'commission_fixed_cents' => $c['events_commission_fixed_cents'] !== null ? (int)$c['events_commission_fixed_cents'] : null,
        'commission' => EventsSettings::commissionFor($db, $c),
        'slug' => $c['slug'],
        'legal' => LegalInfo::toApi($c),
        'missing' => LegalInfo::missing($c),
        'terms_version' => $c['events_terms_version'],
        'terms_accepted_at' => $c['events_terms_accepted_at'],
        'stripe' => StripeConnect::status(StripeConnect::row($db, $clientId)),
        'sales_gate' => EventsSettings::salesGateReason($db, $clientId),
    ];
}

try {
    $db = Database::getInstance();
    if (!EventsSettings::migrated($db)) jsonResponse(['error' => 'events_unavailable'], 503);

    $adminId = requireAdminToken($db);
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($action) {
        case 'settings':
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            jsonResponse(['data' => settingsPayload($db)]);
            break;

        case 'settings_save':
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $d = getRequestData();
            if (array_key_exists('commission_bp_default', $d)) {
                EventsSettings::set($db, 'commission_bp_default', (string)max(0, min(5000, (int)$d['commission_bp_default'])), $adminId);
            }
            if (array_key_exists('commission_fixed_cents_default', $d)) {
                EventsSettings::set($db, 'commission_fixed_cents_default', (string)max(0, min(1000, (int)$d['commission_fixed_cents_default'])), $adminId);
            }
            if (array_key_exists('platform_terms_version', $d)) {
                $v = substr(trim((string)$d['platform_terms_version']), 0, 20);
                if ($v === '') jsonResponse(['error' => 'platform_terms_version is required'], 422);
                EventsSettings::set($db, 'platform_terms_version', $v, $adminId);
            }
            if (array_key_exists('platform_terms_url', $d)) {
                $v = trim((string)$d['platform_terms_url']);
                if ($v !== '' && !preg_match('#^https?://#i', $v)) jsonResponse(['error' => 'validation', 'errors' => ['platform_terms_url' => 'invalid_url']], 422);
                EventsSettings::set($db, 'platform_terms_url', substr($v, 0, 500), $adminId);
            }
            if (array_key_exists('invoice_series_prefix', $d)) {
                $v = strtoupper(preg_replace('/[^A-Za-z0-9-]/', '', (string)$d['invoice_series_prefix']));
                EventsSettings::set($db, 'invoice_series_prefix', substr($v ?: 'TH-COM', 0, 20), $adminId);
            }
            if (array_key_exists('invoice_issuer', $d) && is_array($d['invoice_issuer'])) {
                $keep = ['legal_name', 'legal_form', 'capital', 'siret', 'rcs', 'vat_number', 'address_line1',
                         'address_line2', 'postal_code', 'city', 'country', 'email', 'phone', 'iban', 'bic'];
                $issuer = [];
                foreach ($keep as $k) {
                    if (isset($d['invoice_issuer'][$k])) $issuer[$k] = mb_substr(trim((string)$d['invoice_issuer'][$k]), 0, 190);
                }
                EventsSettings::set($db, 'invoice_issuer', json_encode($issuer, JSON_UNESCAPED_UNICODE), $adminId);
            }
            Logger::log('events_admin', 'POST', 'settings_save', $adminId, [], ['success' => true], 200);
            jsonResponse(['data' => settingsPayload($db)]);
            break;

        case 'licensee':
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            jsonResponse(['data' => licenseePayload($db, (int)($_GET['client_id'] ?? 0))]);
            break;

        case 'licensee_save':
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $d = getRequestData();
            $clientId = (int)($d['client_id'] ?? 0);
            if (!$db->fetch('SELECT id FROM clients WHERE id = ?', [$clientId])) jsonResponse(['error' => 'Client not found'], 404);

            $sets = [];
            $vals = [];
            if (array_key_exists('events_enabled', $d)) {
                $sets[] = 'events_enabled = ?';
                $vals[] = $d['events_enabled'] ? 1 : 0;
            }
            if (array_key_exists('commission_bp', $d)) {
                $sets[] = 'events_commission_bp = ?';
                $vals[] = nullableInt($d['commission_bp'], 5000);
            }
            if (array_key_exists('commission_fixed_cents', $d)) {
                $sets[] = 'events_commission_fixed_cents = ?';
                $vals[] = nullableInt($d['commission_fixed_cents'], 1000);
            }
            if (array_key_exists('slug', $d)) {
                $raw = trim((string)($d['slug'] ?? ''));
                if ($raw === '') {
                    $sets[] = 'slug = NULL';
                } else {
                    $slug = Slug::normalize($raw);
                    $err = Slug::error($slug);
                    if (!$err && !Slug::clientSlugFree($db, $slug, $clientId)) $err = 'slug_taken';
                    if ($err) jsonResponse(['error' => 'validation', 'errors' => ['slug' => $err]], 422);
                    $sets[] = 'slug = ?';
                    $vals[] = $slug;
                }
            }
            if ($sets) {
                $vals[] = $clientId;
                $db->query('UPDATE clients SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
            }
            Logger::log('events_admin', 'POST', 'licensee_save', $adminId, ['client_id' => $clientId] + $d, ['success' => true], 200);
            jsonResponse(['data' => licenseePayload($db, $clientId)]);
            break;

        case 'vies_recheck':
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $d = getRequestData();
            $clientId = (int)($d['client_id'] ?? 0);
            $c = $db->fetch('SELECT vat_number FROM clients WHERE id = ?', [$clientId]);
            if (!$c) jsonResponse(['error' => 'Client not found'], 404);
            if (!empty($c['vat_number'])) {
                $valid = LegalInfo::viesCheck($c['vat_number']);
                if ($valid !== null) {
                    $db->query('UPDATE clients SET vat_valid = ?, vat_checked_at = UTC_TIMESTAMP() WHERE id = ?', [$valid ? 1 : 0, $clientId]);
                } else {
                    jsonResponse(['error' => 'vies_unavailable'], 503);
                }
            }
            jsonResponse(['data' => licenseePayload($db, $clientId)]);
            break;

        case 'revenue':
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            $year = (int)($_GET['year'] ?? gmdate('Y'));
            jsonResponse(['year' => $year, 'rows' => EventsInvoices::revenue($db, $year)]);
            break;

        case 'invoices':
            if ($method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
            $period = (string)($_GET['period'] ?? '');
            $rows = preg_match('/^\d{4}-\d{2}$/', $period)
                ? $db->fetchAll('SELECT i.*, COALESCE(c.legal_name, c.company, c.name) AS licensee FROM commission_invoices i JOIN clients c ON c.id = i.client_id WHERE i.period_start = ? ORDER BY i.id DESC', [$period . '-01'])
                : $db->fetchAll('SELECT i.*, COALESCE(c.legal_name, c.company, c.name) AS licensee FROM commission_invoices i JOIN clients c ON c.id = i.client_id ORDER BY i.id DESC LIMIT 500');
            jsonResponse(['invoices' => array_map(fn($r) => EventsInvoices::toApi($r) + ['licensee' => $r['licensee']], $rows)]);
            break;

        case 'invoices_generate':
            if ($method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
            $d = getRequestData();
            $period = (string)($d['period'] ?? '');
            if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period)) jsonResponse(['error' => 'validation', 'errors' => ['period' => 'invalid']], 422);
            // Only finished months: a running month would be invoiced too early.
            if ($period >= gmdate('Y-m')) jsonResponse(['error' => 'validation', 'errors' => ['period' => 'not_finished']], 422);
            $ids = EventsInvoices::generate($db, $period, isset($d['client_id']) ? (int)$d['client_id'] : null);
            Logger::log('events_admin', 'POST', 'invoices_generate', $adminId, ['period' => $period], ['issued' => count($ids)], 200);
            jsonResponse(['issued' => count($ids)]);
            break;

        case 'invoice_download':
            $inv = $db->fetch('SELECT * FROM commission_invoices WHERE id = ?', [(int)($_GET['id'] ?? 0)]);
            if (!$inv) jsonResponse(['error' => 'not_found'], 404);
            EventsInvoices::stream($inv, ($_GET['what'] ?? 'pdf') === 'csv' ? 'csv' : 'pdf');
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Throwable $e) {
    error_log('[events_admin] ' . $e->getMessage());
    jsonResponse(['error' => 'Server error'], 500);
}
