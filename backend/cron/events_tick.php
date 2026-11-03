<?php
// Events scheduled jobs. Run every 5 minutes:
//   */5 * * * * php /path/to/backend/cron/events_tick.php
// Without crontab, an external pinger can call it over HTTP:
//   https://studio.taghunter.fr/backend/cron/events_tick.php?key=<cron_http_key>
//   (backend/.htaccess denies /cron/ - expose it with a dedicated rule only if needed.)
// Options (CLI): --job=holds|outbox|purge|jobs|reminders|results|invoices|anonymise   run one job only
//                --period=YYYY-MM          with --job=invoices: issue that month (default: last month)
//
// Phase 2 jobs: expire lapsed holds (asking Stripe first: a paid session is
// fulfilled, never expired), retry the email outbox, purge rate-limit rows.
// Correctness never depends on this cron: an expired hold stops counting by itself.

$isCli = PHP_SAPI === 'cli';
require_once __DIR__ . '/../utils/PaymentsConfig.php';
if (!$isCli) {
    $key = (string)PaymentsConfig::get('cron_http_key', '');
    if ($key === '' || !hash_equals($key, (string)($_GET['key'] ?? ''))) {
        http_response_code(403);
        exit;
    }
    header('Content-Type: application/json');
}

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/EventsSettings.php';
require_once __DIR__ . '/../utils/EventsRepo.php';
require_once __DIR__ . '/../utils/EventsBooking.php';
require_once __DIR__ . '/../utils/EventsEmails.php';
require_once __DIR__ . '/../utils/PublicRateLimit.php';
require_once __DIR__ . '/../utils/StripeConnect.php';
require_once __DIR__ . '/../utils/EventsBackoffice.php';
require_once __DIR__ . '/../utils/EventsInvoices.php';
require_once __DIR__ . '/../utils/EventsCheckin.php';

$db = Database::getInstance();
if (!EventsSettings::migrated($db)) exit(0);
EventsRepo::utcSession($db);

$only = null;
$period = null;
foreach ($argv ?? [] as $a) {
    if (str_starts_with($a, '--job=')) $only = substr($a, 6);
    if (str_starts_with($a, '--period=')) $period = substr($a, 9);
}
if (!$isCli && isset($_GET['job'])) $only = (string)$_GET['job'];

$lock = $db->fetch("SELECT GET_LOCK('events_tick', 0) AS l");
if ((int)($lock['l'] ?? 0) !== 1) {
    echo json_encode(['skipped' => 'already_running']) . "\n";
    exit(0);
}

$report = [];
$run = function (string $job, callable $fn) use ($db, $only, &$report) {
    if ($only !== null && $only !== $job) return;
    $db->query('INSERT INTO cron_runs (job) VALUES (?)', [$job]);
    $runId = (int)$db->lastInsertId();
    try {
        $details = $fn();
        $db->query("UPDATE cron_runs SET finished_at = UTC_TIMESTAMP(), status = 'ok', details = ? WHERE id = ?", [json_encode($details), $runId]);
        $report[$job] = $details;
    } catch (Throwable $e) {
        error_log("[events_tick] $job: " . $e->getMessage());
        $db->query("UPDATE cron_runs SET finished_at = UTC_TIMESTAMP(), status = 'error', details = ? WHERE id = ?", [json_encode(['error' => $e->getMessage()]), $runId]);
        $report[$job] = ['error' => $e->getMessage()];
    }
};

// Pending bookings whose hold lapsed (5 min grace). Ask Stripe first: the buyer
// may have paid and the webhook may be late.
$run('holds', function () use ($db) {
    $fulfilled = 0;
    $expired = 0;
    $rows = $db->fetchAll("SELECT * FROM bookings WHERE status = 'pending' AND expires_at < UTC_TIMESTAMP() - INTERVAL 5 MINUTE LIMIT 100");
    foreach ($rows as $b) {
        if ($b['stripe_checkout_session_id'] && PaymentsConfig::stripeConfigured()) {
            try {
                $s = StripeConnect::client()->checkout->sessions->retrieve($b['stripe_checkout_session_id'], [], ['stripe_account' => $b['stripe_account_id']]);
                if (($s->payment_status ?? '') === 'paid') {
                    EventsBooking::fulfil($db, $b['uuid'], $s, 'cron');
                    $fulfilled++;
                    continue;
                }
                if (($s->status ?? '') === 'open') {
                    StripeConnect::client()->checkout->sessions->expire($s->id, [], ['stripe_account' => $b['stripe_account_id']]);
                }
            } catch (Throwable $e) {
                error_log('[events_tick] holds ' . $b['uuid'] . ': ' . $e->getMessage());
                continue; // try again next run rather than expiring a possibly paid booking
            }
        }
        if (EventsBooking::expire($db, (int)$b['id'], 'system', 'hold_lapsed')) $expired++;
    }
    return ['checked' => count($rows), 'fulfilled' => $fulfilled, 'expired' => $expired];
});

$run('outbox', function () use ($db) {
    [$sent, $failed] = EventsEmails::processQueue($db, 100);
    return ['sent' => $sent, 'failed' => $failed];
});

// Slot / event cancellations: refund the next batch of each running job.
$run('jobs', function () use ($db) {
    return EventsBackoffice::processJobs($db);
});

$run('reminders', function () use ($db) {
    return ['queued' => EventsBackoffice::sendReminders($db)];
});

// Booked teams' game results (pushed by Playground), 15 min after the last update.
$run('results', function () use ($db) {
    return EventsCheckin::migrated($db) ? ['queued' => EventsCheckin::sendResults($db)] : ['skipped' => 'not_migrated'];
});

// Commission invoices of the previous month (Paris time), from the 1st at 02:00.
// Idempotent: an already issued (licensee, month) is skipped, so running daily is harmless.
$run('invoices', function () use ($db, $only, $period) {
    $paris = new DateTime('now', new DateTimeZone('Europe/Paris'));
    if ($only !== 'invoices' && ((int)$paris->format('j') > 5 || ((int)$paris->format('j') === 1 && (int)$paris->format('G') < 2))) {
        return ['skipped' => 'not_invoice_day'];
    }
    $p = $period ?: (clone $paris)->modify('first day of last month')->format('Y-m');
    return ['period' => $p, 'issued' => count(EventsInvoices::generate($db, $p))];
});

$run('anonymise', function () use ($db) {
    return ['events' => EventsBackoffice::anonymise($db)];
});

$run('purge', function () use ($db) {
    return [
        'rate_limits' => PublicRateLimit::purge($db),
        'stripe_events' => $db->query('DELETE FROM stripe_events WHERE processed_at IS NOT NULL AND received_at < UTC_TIMESTAMP() - INTERVAL 90 DAY')->rowCount(),
        'cron_runs' => $db->query('DELETE FROM cron_runs WHERE started_at < UTC_TIMESTAMP() - INTERVAL 30 DAY')->rowCount(),
        'staff_sessions' => EventsCheckin::migrated($db) ? EventsCheckin::purgeSessions($db) : 0,
    ];
});

$db->fetch("SELECT RELEASE_LOCK('events_tick')");
echo json_encode($report) . "\n";
