<?php
/**
 * Events transactional emails. Every email is a row in email_outbox (kind +
 * booking), rendered at SEND time from the current data, sent right after the
 * HTTP response and retried by cron/events_tick.php (5 attempts, backoff).
 *
 * Sender: "<Licensee> via Tag Hunter" <billetterie@taghunter.fr>,
 * Reply-To: the licensee's contact email (decision 12).
 * Strings: backend/i18n/emails/{fr,en,es}.json.
 */
require_once __DIR__ . '/EventsRepo.php';
require_once __DIR__ . '/EventsPricing.php';
require_once __DIR__ . '/EventsTokens.php';
require_once __DIR__ . '/Mailer.php';
require_once __DIR__ . '/Ics.php';
require_once __DIR__ . '/PaymentsConfig.php';

class EventsEmails {
    const MAX_ATTEMPTS = 5;
    private static array $strings = [];
    private static array $pending = [];
    private static bool $flushRegistered = false;

    // ── Strings & formatting ─────────────────────────────────────────────

    public static function str(string $lang, string $key, array $vars = []): string {
        foreach ([$lang, 'en', 'fr'] as $l) {
            if (!isset(self::$strings[$l])) {
                $f = __DIR__ . '/../i18n/emails/' . $l . '.json';
                self::$strings[$l] = is_file($f) ? (json_decode(file_get_contents($f), true) ?: []) : [];
            }
            if (isset(self::$strings[$l][$key])) {
                $s = self::$strings[$l][$key];
                foreach ($vars as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
                return $s;
            }
        }
        return $key;
    }

    private static function locale(string $lang): string {
        return ['fr' => 'fr_FR', 'en' => 'en_GB', 'es' => 'es_ES'][$lang] ?? 'fr_FR';
    }

    public static function money(int $cents, string $currency, string $lang): string {
        if (class_exists('NumberFormatter')) {
            $f = new NumberFormatter(self::locale($lang), NumberFormatter::CURRENCY);
            $s = $f->formatCurrency($cents / 100, $currency);
            if ($s !== false) return $s;
        }
        return number_format($cents / 100, 2, ',', ' ') . ' ' . ($currency === 'EUR' ? '€' : $currency);
    }

    public static function percent(int $bp, string $lang): string {
        $v = $bp / 100;
        $s = rtrim(rtrim(number_format($v, 2, $lang === 'en' ? '.' : ',', ''), '0'), '.,');
        return $s . ' %';
    }

    /** "samedi 31 octobre 2026 à 14:00" in the event's time zone. */
    public static function dateTime(int $ts, string $tz, string $lang): string {
        if (class_exists('IntlDateFormatter')) {
            $f = new IntlDateFormatter(self::locale($lang), IntlDateFormatter::FULL, IntlDateFormatter::SHORT, $tz);
            $s = $f->format($ts);
            if ($s !== false) return $s;
        }
        $d = new DateTime('@' . $ts);
        $d->setTimezone(new DateTimeZone($tz));
        return $d->format('d/m/Y H:i');
    }

    private static function e($s): string {
        return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    }

    // ── Queue ────────────────────────────────────────────────────────────

    /** Queue one email and send it after the response. */
    public static function queue($db, string $kind, int $bookingId, ?string $to = null, ?string $lang = null): ?int {
        $b = $db->fetch('SELECT b.id, b.client_id, b.event_id, b.buyer_email, b.language, e.licensee_alert_email, e.main_language
                           FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.id = ?', [$bookingId]);
        if (!$b) return null;
        if ($kind === 'licensee_new_booking') {
            $to = $to ?? $b['licensee_alert_email'];
            $lang = $lang ?? self::clientLang($db, (int)$b['client_id']);
        }
        $to = $to ?? $b['buyer_email'];
        if (!$to) return null;
        $db->query(
            'INSERT INTO email_outbox (client_id, event_id, booking_id, kind, to_email, lang) VALUES (?, ?, ?, ?, ?, ?)',
            [$b['client_id'], $b['event_id'], $bookingId, $kind, $to, $lang ?? $b['language']]
        );
        $id = (int)$db->lastInsertId();
        self::$pending[] = $id;
        self::registerFlush($db);
        return $id;
    }

    /** Queue an email that is about something else than a booking (invoice). */
    public static function queueRef($db, string $kind, int $clientId, int $refId, string $to): int {
        $db->query(
            'INSERT INTO email_outbox (client_id, ref_id, kind, to_email, lang) VALUES (?, ?, ?, ?, ?)',
            [$clientId, $refId, $kind, $to, self::clientLang($db, $clientId)]
        );
        $id = (int)$db->lastInsertId();
        self::$pending[] = $id;
        self::registerFlush($db);
        return $id;
    }

    /** Buyer confirmation + optional licensee alert. */
    public static function queueConfirmation($db, int $bookingId): void {
        self::queue($db, 'booking_confirmation', $bookingId);
        $alert = $db->fetch('SELECT e.licensee_alert_email FROM bookings b JOIN events e ON e.id = b.event_id WHERE b.id = ?', [$bookingId]);
        if (!empty($alert['licensee_alert_email'])) self::queue($db, 'licensee_new_booking', $bookingId);
    }

    private static function clientLang($db, int $clientId): string {
        $r = $db->fetch('SELECT language FROM clients WHERE id = ?', [$clientId]);
        return in_array($r['language'] ?? 'fr', EventsRepo::LANGS, true) ? ($r['language'] ?? 'fr') : 'fr';
    }

    /** Send the emails queued during this request once the response is out. */
    private static function registerFlush($db): void {
        if (self::$flushRegistered) return;
        self::$flushRegistered = true;
        register_shutdown_function(function () use ($db) {
            if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
            foreach (self::$pending as $id) {
                try {
                    self::sendOne($db, $id);
                } catch (Throwable $e) {
                    error_log('[EventsEmails] send ' . $id . ': ' . $e->getMessage());
                }
            }
            self::$pending = [];
        });
    }

    /** Cron: retry due rows. Returns [sent, failed]. */
    public static function processQueue($db, int $limit = 50): array {
        $sent = 0;
        $failed = 0;
        $rows = $db->fetchAll(
            "SELECT id FROM email_outbox WHERE status = 'queued' AND next_attempt_at <= UTC_TIMESTAMP() ORDER BY id LIMIT " . (int)$limit
        );
        foreach ($rows as $r) {
            self::sendOne($db, (int)$r['id']) ? $sent++ : $failed++;
        }
        return [$sent, $failed];
    }

    public static function sendOne($db, int $outboxId): bool {
        $row = $db->fetch("SELECT * FROM email_outbox WHERE id = ? AND status = 'queued'", [$outboxId]);
        if (!$row) return false;
        try {
            $msg = self::render($db, $row);
            $res = $msg ? Mailer::send($msg + ['custom_id' => 'eo-' . $row['id'] . '-' . $row['kind']]) : ['ok' => false, 'error' => 'render_failed'];
        } catch (Throwable $e) {
            $res = ['ok' => false, 'error' => 'render: ' . $e->getMessage()];
        }
        if ($res['ok']) {
            $db->query("UPDATE email_outbox SET status = 'sent', sent_at = UTC_TIMESTAMP(), attempts = attempts + 1, provider_message_id = ?, last_error = NULL WHERE id = ?", [$res['message_id'], $outboxId]);
            return true;
        }
        $attempts = (int)$row['attempts'] + 1;
        $final = $attempts >= self::MAX_ATTEMPTS;
        $delayMin = [1 => 5, 2 => 15, 3 => 60, 4 => 240][$attempts] ?? 240;
        $db->query(
            'UPDATE email_outbox SET attempts = ?, last_error = ?, status = ?, next_attempt_at = UTC_TIMESTAMP() + INTERVAL ' . $delayMin . ' MINUTE WHERE id = ?',
            [$attempts, mb_substr((string)$res['error'], 0, 2000), $final ? 'failed' : 'queued', $outboxId]
        );
        return false;
    }

    // ── Rendering ────────────────────────────────────────────────────────

    /** Everything a booking email needs, in the email's language. */
    public static function context($db, int $bookingId, string $lang): ?array {
        $b = $db->fetch('SELECT * FROM bookings WHERE id = ?', [$bookingId]);
        if (!$b) return null;
        $event = EventsRepo::eventById($db, (int)$b['event_id']);
        $slot = $db->fetch('SELECT * FROM event_slots WHERE id = ?', [$b['slot_id']]);
        $client = $db->fetch('SELECT * FROM clients WHERE id = ?', [$b['client_id']]);
        $content = EventsRepo::content(EventsRepo::contents($db, (int)$event['id']), $lang, $event['main_language']);
        $tickets = $db->fetchAll('SELECT * FROM booking_tickets WHERE booking_id = ? ORDER BY position', [$bookingId]);
        $types = EventsRepo::ticketTypes($db, (int)$event['id']);
        $theme = EventsRepo::json($event['theme']) ?: [];
        $color = preg_match('/^#[0-9a-fA-F]{6}$/', $theme['primary'] ?? '') ? $theme['primary'] : '#0f172a';
        $start = strtotime($slot['starts_at'] . ' UTC');
        $org = $client['legal_name'] ?: ($client['company'] ?: $client['name']);
        try {
            $addons = $db->fetchAll('SELECT * FROM booking_addons WHERE booking_id = ? ORDER BY id', [$bookingId]);
            $promo = $b['promo_code_id'] ? ($db->fetch('SELECT code FROM event_promo_codes WHERE id = ?', [$b['promo_code_id']])['code'] ?? '') : '';
        } catch (Throwable $e) {
            $addons = [];
            $promo = '';
        }
        return compact('b', 'event', 'slot', 'client', 'content', 'tickets', 'types', 'theme', 'color', 'start', 'org') + [
            'title' => $content['title'] ?? $event['slug'],
            'when' => self::dateTime($start, $event['timezone'], $lang),
            'logo' => EventsRepo::mediaUrl($event, $theme['logo'] ?? null),
            'addons' => $addons,
            'promo_code' => $promo,
        ];
    }

    private static function render($db, array $row): ?array {
        $lang = in_array($row['lang'], EventsRepo::LANGS, true) ? $row['lang'] : 'fr';
        if ($row['kind'] === 'invoice_available') return self::renderInvoice($db, $row, $lang);
        $c = self::context($db, (int)$row['booking_id'], $lang);
        if (!$c) return null;
        $common = [
            'to' => $row['to_email'],
            'from_name' => mb_substr($c['org'], 0, 60) . ' via Tag Hunter',
            'reply_to' => $c['client']['legal_email'] ?: $c['client']['email'],
            'reply_to_name' => $c['org'],
        ];
        switch ($row['kind']) {
            case 'booking_confirmation':
                return $common + self::renderConfirmation($c, $lang);
            case 'licensee_new_booking':
                return array_merge($common, ['from_name' => 'Tag Hunter', 'reply_to' => $c['b']['buyer_email'], 'reply_to_name' => trim($c['b']['buyer_first_name'] . ' ' . $c['b']['buyer_last_name'])], self::renderAlert($db, $c, $lang));
            case 'sold_out_refund':
                return $common + self::renderSoldOut($c, $lang);
            case 'refund_notice':
                return $common + self::renderRefund($db, $c, $lang);
            case 'cancellation_notice':
                return $common + self::renderCancellation($db, $c, $lang);
            case 'reminder_48h':
                return $common + self::renderConfirmation($c, $lang, true);
            case 'game_results':
                return $common + self::renderResults($db, $c, $lang);
            case 'dispute_alert':
                return array_merge($common, ['from_name' => 'Tag Hunter', 'reply_to' => null], self::renderSimple($c, $lang, 'dispute'));
        }
        return null;
    }

    private static function layout(array $c, string $lang, string $title, string $body): string {
        $logo = $c['logo'] ? '<img src="' . self::e($c['logo']) . '" alt="" style="max-height:56px;max-width:200px;display:block;margin:0 auto 12px">' : '';
        $cl = $c['client'];
        $legal = array_filter([
            self::str($lang, 'sold_by', ['org' => $c['org']]),
            trim(implode(', ', array_filter([$cl['address_line1'], $cl['address_line2'], trim(($cl['postal_code'] ?? '') . ' ' . ($cl['city'] ?? ''))]))),
            $cl['siret'] ? self::str($lang, 'siret', ['siret' => $cl['siret']]) : null,
            ($cl['vat_regime'] ?? 'subject') === 'exempt' ? self::str($lang, 'vat_exempt') : ($cl['vat_number'] ? self::str($lang, 'vat_number', ['vat' => $cl['vat_number']]) : null),
        ]);
        return '<!doctype html><html lang="' . $lang . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>'
            . '<body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">'
            . '<tr><td style="background:' . $c['color'] . ';padding:24px;text-align:center;color:#ffffff">' . $logo
            . '<div style="font-size:20px;font-weight:700">' . self::e($c['title']) . '</div>'
            . '<div style="font-size:15px;opacity:.9;margin-top:4px">' . self::e($title) . '</div></td></tr>'
            . '<tr><td style="padding:24px;font-size:15px;line-height:1.5">' . $body . '</td></tr>'
            . '<tr><td style="padding:16px 24px;background:#f8fafc;font-size:12px;color:#64748b;line-height:1.5">'
            . implode('<br>', array_map([self::class, 'e'], $legal))
            . '<br><br>' . self::e(self::str($lang, 'powered')) . '</td></tr>'
            . '</table></td></tr></table></body></html>';
    }

    private static function row(string $k, string $v): string {
        return '<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap;vertical-align:top">' . self::e($k) . '</td><td style="padding:4px 0">' . $v . '</td></tr>';
    }

    private static function ticketTable(array $c, string $lang): string {
        $b = $c['b'];
        $cur = $b['currency'];
        $groups = [];
        foreach ($c['tickets'] as $t) {
            $type = $c['types'][(int)$t['ticket_type_id']] ?? null;
            $label = $type ? EventsRepo::tr($type['label_i18n'], $lang, $c['event']['main_language']) : $t['label_snapshot'];
            $k = $label . '|' . $t['unit_price_cents'];
            $groups[$k] ??= ['label' => $label, 'unit' => (int)$t['unit_price_cents'], 'q' => 0, 'vat' => (int)$t['vat_bp']];
            $groups[$k]['q']++;
        }
        $vatByRate = [];
        $h = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:14px">';
        foreach ($groups as $g) {
            $amount = $g['unit'] * $g['q'];
            $vatByRate[$g['vat']] = ($vatByRate[$g['vat']] ?? 0) + EventsPricing::vatOf($amount, $g['vat']);
            $h .= '<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">' . $g['q'] . ' × ' . self::e($g['label']) . '</td>'
                . '<td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">'
                . ($amount > 0 ? self::money($amount, $cur, $lang) : self::e(self::str($lang, 'free'))) . '</td></tr>';
        }
        foreach ($c['addons'] ?? [] as $a) {
            $amount = (int)$a['unit_price_cents'] * (int)$a['qty'];
            $vatByRate[(int)$a['vat_bp']] = ($vatByRate[(int)$a['vat_bp']] ?? 0) + EventsPricing::vatOf($amount, (int)$a['vat_bp']);
            $h .= '<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">' . (int)$a['qty'] . ' × ' . self::e($a['label_snapshot']) . '</td>'
                . '<td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">' . self::money($amount, $cur, $lang) . '</td></tr>';
        }
        if ((int)$b['discount_cents'] > 0) {
            // VAT lines above are computed before discount; scale them to what was really paid.
            $gross = 0;
            foreach ($groups as $g) $gross += $g['unit'] * $g['q'];
            foreach ($c['addons'] ?? [] as $a) $gross += (int)$a['unit_price_cents'] * (int)$a['qty'];
            if ($gross > 0) {
                foreach ($vatByRate as $rate => $v) $vatByRate[$rate] = EventsPricing::roundDiv($v * ($gross - (int)$b['discount_cents']), $gross);
            }
            $h .= '<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">' . self::e(self::str($lang, 'discount', ['code' => $c['promo_code'] ?? ''])) . '</td>'
                . '<td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right">−' . self::money((int)$b['discount_cents'], $cur, $lang) . '</td></tr>';
        }
        if ((int)$b['booking_fee_cents'] > 0) {
            $snap = EventsRepo::json($b['vat_snapshot']) ?: [];
            $feeVat = (int)($snap['fee_bp'] ?? 0);
            $vatByRate[$feeVat] = ($vatByRate[$feeVat] ?? 0) + EventsPricing::vatOf((int)$b['booking_fee_cents'], $feeVat);
            $h .= '<tr><td style="padding:6px 0;border-bottom:1px solid #e2e8f0">' . self::e(self::str($lang, 'booking_fee')) . '</td>'
                . '<td style="padding:6px 0;border-bottom:1px solid #e2e8f0;text-align:right">' . self::money((int)$b['booking_fee_cents'], $cur, $lang) . '</td></tr>';
        }
        $totalKey = (int)$b['total_cents'] === 0 ? 'total_free'
            : ($b['payment_status'] === 'offline_due' ? 'amount_due' : ($b['payment_status'] === 'offline_paid' ? 'amount_paid_offline' : 'total'));
        $h .= '<tr><td style="padding:8px 0;font-weight:700">' . self::e(self::str($lang, $totalKey)) . '</td>'
            . '<td style="padding:8px 0;text-align:right;font-weight:700">' . ((int)$b['total_cents'] > 0 ? self::money((int)$b['total_cents'], $cur, $lang) : self::e(self::str($lang, 'free'))) . '</td></tr>';
        $vatLines = [];
        if (($c['client']['vat_regime'] ?? 'subject') === 'exempt') {
            $vatLines[] = self::str($lang, 'vat_exempt');
        } else {
            ksort($vatByRate);
            foreach ($vatByRate as $rate => $vat) {
                if ($rate > 0 && $vat > 0) $vatLines[] = self::str($lang, 'vat_included', ['rate' => self::percent($rate, $lang), 'amount' => self::money($vat, $cur, $lang)]);
            }
        }
        if ((int)$b['refunded_cents'] > 0) {
            $h .= '<tr><td style="padding:4px 0;color:#059669">' . self::e(self::str($lang, 'refunded_total')) . '</td>'
                . '<td style="padding:4px 0;text-align:right;color:#059669">' . self::money((int)$b['refunded_cents'], $cur, $lang) . '</td></tr>';
        }
        if ($vatLines && (int)$b['total_cents'] > 0) {
            $h .= '<tr><td colspan="2" style="padding:0;font-size:12px;color:#64748b;text-align:right">' . implode('<br>', array_map([self::class, 'e'], $vatLines)) . '</td></tr>';
        }
        return $h . '</table>';
    }

    private static function refundText(array $event, string $lang): string {
        switch ($event['refund_policy']) {
            case 'full_until':
                return self::str($lang, 'refund_full_until', ['days' => (int)$event['refund_days_before']]);
            case 'partial':
                return self::str($lang, 'refund_partial', ['rate' => self::percent((int)$event['refund_retention_bp'], $lang)]);
            default:
                return self::str($lang, 'refund_none');
        }
    }

    private static function venue(array $event): array {
        $addr = trim(implode(', ', array_filter([$event['venue_name'], $event['venue_address'], trim(($event['venue_postal_code'] ?? '') . ' ' . ($event['venue_city'] ?? ''))])));
        $map = $event['lat'] !== null && $event['lng'] !== null
            ? 'https://www.openstreetmap.org/?mlat=' . $event['lat'] . '&mlon=' . $event['lng'] . '#map=16/' . $event['lat'] . '/' . $event['lng']
            : ($addr !== '' ? 'https://www.openstreetmap.org/search?query=' . rawurlencode($addr) : null);
        return [$addr, $map];
    }

    private static function renderConfirmation(array $c, string $lang, bool $reminder = false): array {
        $b = $c['b'];
        $event = $c['event'];
        $base = PaymentsConfig::eventsPublicBase();
        $manage = $base . '/booking/' . EventsTokens::make(EventsTokens::MANAGE, $b['uuid'], $b['token_nonce']);
        $qrUrl = $base . '/t/' . EventsTokens::make(EventsTokens::QR, $b['uuid'], $b['token_nonce']);
        [$addr, $map] = self::venue($event);
        $names = array_filter(array_map(fn($t) => trim(($t['participant_first_name'] ?? '') . ($t['participant_age'] !== null ? ' (' . $t['participant_age'] . ')' : '')), $c['tickets']));

        $details = '<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">'
            . self::row(self::str($lang, 'when'), '<b>' . self::e(ucfirst($c['when'])) . '</b>')
            . self::row(self::str($lang, 'duration'), self::e(self::str($lang, 'minutes', ['n' => (int)$c['slot']['duration_minutes']])))
            . ($addr !== '' ? self::row(self::str($lang, 'where'), self::e($addr) . ($map ? ' · <a href="' . self::e($map) . '" style="color:' . $c['color'] . '">' . self::e(self::str($lang, 'map')) . '</a>' : '')) : '')
            . ($b['team_name'] ? self::row(self::str($lang, 'team'), self::e($b['team_name'])) : '')
            . ($names ? self::row(self::str($lang, 'participants'), self::e(implode(', ', $names))) : '')
            . self::row(self::str($lang, 'reference'), '<b>' . self::e($b['reference']) . '</b>')
            . '</table>';

        $body = '<p>' . self::e(self::str($lang, 'hello', ['name' => $b['buyer_first_name']])) . '</p>'
            . '<p>' . self::e(self::str($lang, $reminder ? 'reminder_intro' : 'confirm_intro')) . '</p>'
            . $details
            . '<div style="text-align:center;margin:20px 0"><img src="cid:ticketqr" width="200" height="200" alt="QR" style="display:inline-block">'
            . '<div style="font-size:13px;color:#64748b">' . self::e(self::str($lang, 'qr_help')) . '</div></div>'
            . self::ticketTable($c, $lang)
            . '<p style="text-align:center;margin:24px 0"><a href="' . self::e($manage) . '" style="background:' . $c['color'] . ';color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">'
            . self::e(self::str($lang, 'manage')) . '</a></p>'
            . '<p style="font-size:13px;color:#64748b">' . self::e(self::str($lang, 'calendar')) . '</p>'
            . '<p style="font-size:13px"><b>' . self::e(self::str($lang, 'refund_title')) . '</b><br>' . self::e(self::refundText($event, $lang)) . '</p>'
            . '<p style="font-size:13px;color:#64748b">' . self::e(self::str($lang, 'contact', ['org' => $c['org']])) . '</p>';

        $end = $c['start'] + (int)$c['slot']['duration_minutes'] * 60;
        $ics = Ics::event($b['uuid'], $c['start'], $end, $c['title'], $addr, $b['reference'] . ' · ' . $manage, $manage);
        require_once __DIR__ . '/Qr.php';
        return [
            'to_name' => trim($b['buyer_first_name'] . ' ' . $b['buyer_last_name']),
            'subject' => $reminder
                ? self::str($lang, 'reminder_subject', ['event' => $c['title'], 'when' => $c['when']])
                : self::str($lang, 'confirm_subject', ['event' => $c['title'], 'ref' => $b['reference']]),
            'html' => self::layout($c, $lang, self::str($lang, $reminder ? 'reminder_title' : 'confirm_title'), $body),
            'inline' => [['filename' => 'billet.png', 'content_type' => 'image/png', 'content' => Qr::png($qrUrl, 6), 'cid' => 'ticketqr']],
            'attachments' => [['filename' => 'session.ics', 'content_type' => 'text/calendar', 'content' => $ics]],
        ];
    }

    private static function renderAlert($db, array $c, string $lang): array {
        $b = $c['b'];
        $answers = $db->fetchAll('SELECT question_id, value FROM booking_answers WHERE booking_id = ?', [$b['id']]);
        $qs = [];
        foreach (EventsRepo::questions($db, (int)$c['event']['id'], false) as $q) $qs[$q['id']] = $q;
        $ans = '';
        foreach ($answers as $a) {
            $q = $qs[(int)$a['question_id']] ?? null;
            if (!$q) continue;
            $v = $q['kind'] === 'checkbox' ? self::str($lang, 'yes')
                : ($q['kind'] === 'choice' ? EventsRepo::tr($q['options_i18n'][(int)$a['value']] ?? [], $lang, $c['event']['main_language']) : $a['value']);
            $ans .= self::row(EventsRepo::tr($q['label_i18n'], $lang, $c['event']['main_language']), self::e($v));
        }
        $body = '<p>' . self::e(self::str($lang, 'alert_intro', ['name' => trim($b['buyer_first_name'] . ' ' . $b['buyer_last_name']), 'count' => count($c['tickets'])])) . '</p>'
            . '<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">'
            . self::row(self::str($lang, 'when'), '<b>' . self::e(ucfirst($c['when'])) . '</b>')
            . ($b['team_name'] ? self::row(self::str($lang, 'team'), self::e($b['team_name'])) : '')
            . self::row(self::str($lang, 'buyer'), self::e(trim($b['buyer_first_name'] . ' ' . $b['buyer_last_name'])) . '<br>' . self::e($b['buyer_email']) . '<br>' . self::e($b['buyer_phone']))
            . self::row(self::str($lang, 'reference'), self::e($b['reference']))
            . $ans . '</table>' . self::ticketTable($c, $lang);
        return [
            'subject' => self::str($lang, 'alert_subject', ['event' => $c['title'], 'slot' => $c['when']]),
            'html' => self::layout($c, $lang, self::str($lang, 'alert_title'), $body),
        ];
    }

    private static function renderRefund($db, array $c, string $lang): array {
        $b = $c['b'];
        $last = $db->fetch('SELECT amount_cents FROM booking_refunds WHERE booking_id = ? ORDER BY id DESC LIMIT 1', [$b['id']]);
        $amount = self::money((int)($last['amount_cents'] ?? $b['refunded_cents']), $b['currency'], $lang);
        $body = '<p>' . self::e(self::str($lang, 'hello', ['name' => $b['buyer_first_name']])) . '</p>'
            . '<p>' . self::e(self::str($lang, 'refund_text', ['org' => $c['org'], 'amount' => $amount, 'ref' => $b['reference']])) . '</p>'
            . self::ticketTable($c, $lang)
            . '<p style="font-size:13px;color:#64748b">' . self::e(self::str($lang, 'contact', ['org' => $c['org']])) . '</p>';
        return [
            'to_name' => trim($b['buyer_first_name'] . ' ' . $b['buyer_last_name']),
            'subject' => self::str($lang, 'refund_subject', ['event' => $c['title'], 'amount' => $amount]),
            'html' => self::layout($c, $lang, self::str($lang, 'refund_done_title'), $body),
        ];
    }

    private static function renderCancellation($db, array $c, string $lang): array {
        $b = $c['b'];
        $body = '<p>' . self::e(self::str($lang, 'hello', ['name' => $b['buyer_first_name']])) . '</p>'
            . '<p>' . self::e(self::str($lang, 'cancel_text', ['ref' => $b['reference']])) . '</p>'
            . ((int)$b['refunded_cents'] > 0 ? '<p>' . self::e(self::str($lang, 'cancel_refund', ['amount' => self::money((int)$b['refunded_cents'], $b['currency'], $lang)])) . '</p>' : '')
            . '<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">'
            . self::row(self::str($lang, 'when'), self::e(ucfirst($c['when'])))
            . self::row(self::str($lang, 'reference'), self::e($b['reference'])) . '</table>'
            . '<p style="font-size:13px;color:#64748b">' . self::e(self::str($lang, 'contact', ['org' => $c['org']])) . '</p>';
        return [
            'to_name' => trim($b['buyer_first_name'] . ' ' . $b['buyer_last_name']),
            'subject' => self::str($lang, 'cancel_subject', ['event' => $c['title'], 'ref' => $b['reference']]),
            'html' => self::layout($c, $lang, self::str($lang, 'cancel_title'), $body),
        ];
    }

    /** One-paragraph notice to the licensee ($key_subject / $key_title / $key_text). */
    private static function renderSimple(array $c, string $lang, string $key): array {
        $b = $c['b'];
        $vars = ['event' => $c['title'], 'ref' => $b['reference']];
        $body = '<p>' . self::e(self::str($lang, $key . '_text', $vars)) . '</p>'
            . '<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">'
            . self::row(self::str($lang, 'when'), self::e(ucfirst($c['when'])))
            . self::row(self::str($lang, 'buyer'), self::e(trim($b['buyer_first_name'] . ' ' . $b['buyer_last_name'])) . '<br>' . self::e($b['buyer_email']))
            . '</table>' . self::ticketTable($c, $lang);
        return [
            'subject' => self::str($lang, $key . '_subject', $vars),
            'html' => self::layout($c, $lang, self::str($lang, $key . '_title'), $body),
        ];
    }

    private static function renderInvoice($db, array $row, string $lang): ?array {
        $inv = $db->fetch('SELECT * FROM commission_invoices WHERE id = ?', [$row['ref_id']]);
        if (!$inv) return null;
        $doc = self::str($lang, $inv['kind'] === 'credit_note' ? 'doc_credit_note' : 'doc_invoice');
        $vars = ['doc' => $doc, 'number' => $inv['number'], 'period' => substr($inv['period_start'], 0, 7),
                 'amount' => self::money((int)$inv['fees_ttc_cents'], 'EUR', $lang)];
        $link = PaymentsConfig::studioBase() . '/my/payments';
        $body = '<p>' . self::e(self::str($lang, 'invoice_text', $vars)) . '</p>'
            . '<p style="text-align:center;margin:24px 0"><a href="' . self::e($link) . '" style="background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Studio</a></p>';
        $title = self::str($lang, 'invoice_title', $vars);
        $html = '<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">'
            . '<table role="presentation" width="100%" style="max-width:600px;background:#fff;border-radius:12px"><tr><td style="padding:24px;font-size:15px;line-height:1.5">'
            . '<h2 style="margin:0 0 12px">' . self::e($title) . '</h2>' . $body . '</td></tr></table></td></tr></table></body></html>';
        return ['to' => $row['to_email'], 'from_name' => 'Tag Hunter', 'subject' => self::str($lang, 'invoice_subject', $vars), 'html' => $html];
    }

    private static function renderResults($db, array $c, string $lang): array {
        $b = $c['b'];
        $r = $db->fetch('SELECT * FROM booking_results WHERE booking_id = ?', [$b['id']]) ?: [];
        $team = $b['team_name'] ?: trim($b['buyer_first_name'] . ' ' . $b['buyer_last_name']);
        $rows = '';
        if (isset($r['score']) && $r['score'] !== null) $rows .= self::row(self::str($lang, 'results_score'), '<b>' . (int)$r['score'] . '</b>');
        if (!empty($r['rank'])) $rows .= self::row(self::str($lang, 'results_rank'), '<b>' . self::e(self::str($lang, 'results_rank_of', ['rank' => (int)$r['rank'], 'of' => (int)($r['teams_count'] ?? 0)])) . '</b>');
        if (!empty($r['elapsed_seconds'])) {
            $s = (int)$r['elapsed_seconds'];
            $rows .= self::row(self::str($lang, 'results_time'), self::e(sprintf('%d:%02d:%02d', intdiv($s, 3600), intdiv($s % 3600, 60), $s % 60)));
        }
        $eventUrl = PaymentsConfig::eventsPublicBase() . '/' . rawurlencode($c['event']['slug']);
        $body = '<p>' . self::e(self::str($lang, 'results_intro', ['team' => $team])) . '</p>'
            . ($rows ? '<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:16px;margin:16px 0">' . $rows . '</table>' : '')
            . '<p>' . self::e(self::str($lang, 'results_thanks', ['org' => $c['org']])) . '</p>'
            . '<p style="text-align:center;margin:24px 0"><a href="' . self::e($eventUrl) . '" style="background:' . $c['color'] . ';color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">'
            . self::e(self::str($lang, 'results_cta')) . '</a></p>';
        return [
            'to_name' => trim($b['buyer_first_name'] . ' ' . $b['buyer_last_name']),
            'subject' => self::str($lang, 'results_subject', ['event' => $c['title'], 'team' => $team]),
            'html' => self::layout($c, $lang, self::str($lang, 'results_title'), $body),
        ];
    }

    private static function renderSoldOut(array $c, string $lang): array {
        $b = $c['b'];
        $body = '<p>' . self::e(self::str($lang, 'hello', ['name' => $b['buyer_first_name']])) . '</p>'
            . '<p>' . self::e(self::str($lang, 'soldout_text')) . '</p>'
            . '<p style="font-size:13px;color:#64748b">' . self::e(self::str($lang, 'contact', ['org' => $c['org']])) . '</p>';
        return [
            'to_name' => trim($b['buyer_first_name'] . ' ' . $b['buyer_last_name']),
            'subject' => self::str($lang, 'soldout_subject', ['event' => $c['title']]),
            'html' => self::layout($c, $lang, self::str($lang, 'soldout_title'), $body),
        ];
    }
}
