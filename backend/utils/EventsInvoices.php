<?php
/**
 * Monthly commission invoices from Taghunter to each licensee (decision 16).
 *
 * Period = a calendar month in Europe/Paris. Amount = booking fees of online
 * bookings PAID in the month, minus fees given back in the month (slot / event
 * cancellations). Rates are VAT-inclusive (TTC):
 *   - licensee in France, or EU without a VIES-valid VAT number: French VAT 20 %
 *   - EU licensee with a valid VAT number: reverse charge (no VAT)
 * Negative month -> credit note. One document per (licensee, month, kind),
 * gapless numbering per year ("TH-COM-2026-0001"). PDF + CSV detail stored in
 * backend/storage/invoices/<client_id>/ (never under media/).
 */
require_once __DIR__ . '/EventsSettings.php';
require_once __DIR__ . '/EventsPricing.php';
require_once __DIR__ . '/EventsEmails.php';

class EventsInvoices {
    const FR_VAT_BP = 2000;
    const TZ = 'Europe/Paris';

    public static function storageDir(int $clientId): string {
        return __DIR__ . '/../storage/invoices/' . $clientId;
    }

    /** [start UTC, end UTC, period_start date, period_end date] of a 'YYYY-MM' month in Paris time. */
    public static function bounds(string $period): array {
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period)) throw new InvalidArgumentException('invalid_period');
        $tz = new DateTimeZone(self::TZ);
        $start = new DateTime($period . '-01 00:00:00', $tz);
        $end = (clone $start)->modify('+1 month');
        $last = (clone $end)->modify('-1 day');
        $utc = new DateTimeZone('UTC');
        return [
            (clone $start)->setTimezone($utc)->format('Y-m-d H:i:s'),
            (clone $end)->setTimezone($utc)->format('Y-m-d H:i:s'),
            $start->format('Y-m-d'),
            $last->format('Y-m-d'),
        ];
    }

    /** Fee movements of one licensee in a period (detail rows + totals). */
    public static function movements($db, int $clientId, string $startUtc, string $endUtc): array {
        $paid = $db->fetchAll(
            "SELECT b.id, b.reference, b.paid_at AS at, b.total_cents, b.booking_fee_cents AS fee, e.slug
               FROM bookings b JOIN events e ON e.id = b.event_id
              WHERE b.client_id = ? AND b.source = 'online' AND b.booking_fee_cents > 0
                AND b.paid_at >= ? AND b.paid_at < ? AND b.payment_status IN ('paid','partially_refunded','refunded')
              ORDER BY b.paid_at",
            [$clientId, $startUtc, $endUtc]
        );
        $back = $db->fetchAll(
            "SELECT b.id, b.reference, r.created_at AS at, r.amount_cents, r.fee_refunded_cents AS fee, e.slug
               FROM booking_refunds r JOIN bookings b ON b.id = r.booking_id JOIN events e ON e.id = b.event_id
              WHERE b.client_id = ? AND r.fee_refunded_cents > 0 AND r.created_at >= ? AND r.created_at < ?
              ORDER BY r.created_at",
            [$clientId, $startUtc, $endUtc]
        );
        $in = array_sum(array_map(fn($r) => (int)$r['fee'], $paid));
        $out = array_sum(array_map(fn($r) => (int)$r['fee'], $back));
        return ['paid' => $paid, 'refunds' => $back, 'fees_in' => $in, 'fees_out' => $out, 'net' => $in - $out];
    }

    /** VAT treatment of a licensee: ['scheme' => fr|eu_reverse, 'rate_bp' => int]. */
    public static function vatScheme(array $client): array {
        $country = strtoupper((string)($client['country'] ?? 'FR'));
        if ($country !== 'FR' && (int)($client['vat_valid'] ?? 0) === 1 && !empty($client['vat_number'])) {
            return ['scheme' => 'eu_reverse', 'rate_bp' => 0];
        }
        return ['scheme' => 'fr', 'rate_bp' => self::FR_VAT_BP];
    }

    private static function nextNumber($db, string $series): string {
        $db->query('INSERT IGNORE INTO invoice_sequences (series, last_number) VALUES (?, 0)', [$series]);
        $row = $db->fetch('SELECT last_number FROM invoice_sequences WHERE series = ? FOR UPDATE', [$series]);
        $n = (int)$row['last_number'] + 1;
        $db->query('UPDATE invoice_sequences SET last_number = ? WHERE series = ?', [$n, $series]);
        return $series . '-' . str_pad((string)$n, 4, '0', STR_PAD_LEFT);
    }

    /**
     * Issue the documents of a month (all licensees, or one). Idempotent: a
     * (licensee, month, kind) already issued is skipped.
     * @return array issued invoice ids
     */
    public static function generate($db, string $period, ?int $onlyClientId = null, bool $email = true): array {
        [$startUtc, $endUtc, $pStart, $pEnd] = self::bounds($period);
        $clients = $db->fetchAll(
            "SELECT DISTINCT c.* FROM clients c
              WHERE (? IS NULL OR c.id = ?) AND (
                EXISTS (SELECT 1 FROM bookings b WHERE b.client_id = c.id AND b.source = 'online' AND b.booking_fee_cents > 0 AND b.paid_at >= ? AND b.paid_at < ?)
                OR EXISTS (SELECT 1 FROM booking_refunds r JOIN bookings b ON b.id = r.booking_id WHERE b.client_id = c.id AND r.fee_refunded_cents > 0 AND r.created_at >= ? AND r.created_at < ?))",
            [$onlyClientId, $onlyClientId, $startUtc, $endUtc, $startUtc, $endUtc]
        );
        $settings = EventsSettings::all($db);
        $issuer = json_decode($settings['invoice_issuer'] ?? '{}', true) ?: [];
        $prefix = $settings['invoice_series_prefix'] ?? 'TH-COM';
        $issued = [];
        foreach ($clients as $c) {
            $m = self::movements($db, (int)$c['id'], $startUtc, $endUtc);
            if ($m['net'] === 0) continue;
            $kind = $m['net'] > 0 ? 'invoice' : 'credit_note';
            if ($db->fetch('SELECT id FROM commission_invoices WHERE client_id = ? AND period_start = ? AND kind = ?', [$c['id'], $pStart, $kind])) continue;

            $ttc = abs($m['net']);
            $vat = self::vatScheme($c);
            $ht = $vat['rate_bp'] > 0 ? EventsPricing::roundDiv($ttc * 10000, 10000 + $vat['rate_bp']) : $ttc;
            $customer = [
                'legal_name' => $c['legal_name'] ?: ($c['company'] ?: $c['name']),
                'address' => trim(implode(', ', array_filter([$c['address_line1'], $c['address_line2'], trim(($c['postal_code'] ?? '') . ' ' . ($c['city'] ?? '')), $c['country']]))),
                'siret' => $c['siret'], 'vat_number' => $c['vat_number'], 'email' => $c['legal_email'] ?: $c['email'],
            ];
            $db->begin();
            try {
                $number = self::nextNumber($db, $prefix . '-' . gmdate('Y'));
                $db->query(
                    'INSERT INTO commission_invoices (number, client_id, period_start, period_end, kind, fees_ttc_cents, ht_cents, vat_cents, vat_rate_bp,
                        vat_scheme, bookings_count, issuer, customer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$number, $c['id'], $pStart, $pEnd, $kind, $ttc, $ht, $ttc - $ht, $vat['rate_bp'], $vat['scheme'],
                     count($m['paid']), json_encode($issuer, JSON_UNESCAPED_UNICODE), json_encode($customer, JSON_UNESCAPED_UNICODE)]
                );
                $id = (int)$db->lastInsertId();
                $db->commit();
            } catch (Throwable $e) {
                $db->rollBack();
                throw $e;
            }
            $inv = $db->fetch('SELECT * FROM commission_invoices WHERE id = ?', [$id]);
            [$pdf, $csv] = self::writeFiles($inv, $m, $period);
            $db->query('UPDATE commission_invoices SET pdf_path = ?, csv_path = ? WHERE id = ?', [$pdf, $csv, $id]);
            if ($email && !empty($customer['email'])) EventsEmails::queueRef($db, 'invoice_available', (int)$c['id'], $id, $customer['email']);
            $issued[] = $id;
        }
        return $issued;
    }

    private static function money(int $cents): string {
        return number_format($cents / 100, 2, ',', ' ') . ' €';
    }

    private static function e($s): string {
        return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    }

    /** Render the PDF + CSV, returns paths relative to backend/storage/. */
    public static function writeFiles(array $inv, array $m, string $period): array {
        $dir = self::storageDir((int)$inv['client_id']);
        if (!is_dir($dir)) mkdir($dir, 0775, true);
        $safe = preg_replace('/[^A-Za-z0-9-]/', '', $inv['number']);

        $fh = fopen("$dir/$safe.csv", 'w');
        fwrite($fh, "\xEF\xBB\xBF");
        fputcsv($fh, ['type', 'reference', 'evenement', 'date_utc', 'montant_paye_ttc', 'frais_reservation_ttc'], ';');
        foreach ($m['paid'] as $r) fputcsv($fh, ['vente', $r['reference'], $r['slug'], $r['at'], number_format($r['total_cents'] / 100, 2, ',', ''), number_format($r['fee'] / 100, 2, ',', '')], ';');
        foreach ($m['refunds'] as $r) fputcsv($fh, ['remboursement', $r['reference'], $r['slug'], $r['at'], number_format(-$r['amount_cents'] / 100, 2, ',', ''), number_format(-$r['fee'] / 100, 2, ',', '')], ';');
        fputcsv($fh, ['total', '', '', '', '', number_format($m['net'] / 100, 2, ',', '')], ';');
        fclose($fh);

        $issuer = json_decode($inv['issuer'] ?? '{}', true) ?: [];
        $cust = json_decode($inv['customer'] ?? '{}', true) ?: [];
        $isCredit = $inv['kind'] === 'credit_note';
        $title = $isCredit ? 'Avoir' : 'Facture';
        $monthLabel = self::monthFr($period);
        $issuerLines = array_filter([
            $issuer['legal_name'] ?? 'Tag Hunter',
            trim(($issuer['legal_form'] ?? '') . (!empty($issuer['capital']) ? ' au capital de ' . $issuer['capital'] : '')),
            $issuer['address_line1'] ?? null, $issuer['address_line2'] ?? null,
            trim(($issuer['postal_code'] ?? '') . ' ' . ($issuer['city'] ?? '')),
            !empty($issuer['siret']) ? 'SIRET ' . $issuer['siret'] : null,
            !empty($issuer['rcs']) ? 'RCS ' . $issuer['rcs'] : null,
            !empty($issuer['vat_number']) ? 'TVA ' . $issuer['vat_number'] : null,
            $issuer['email'] ?? null,
        ]);
        $vatLine = $inv['vat_scheme'] === 'eu_reverse'
            ? '<tr><td colspan="2" class="note">Autoliquidation : TVA due par le preneur (art. 196 de la directive 2006/112/CE).</td></tr>'
            : '<tr><td>TVA ' . ((int)$inv['vat_rate_bp'] / 100) . ' %</td><td class="r">' . self::money((int)$inv['vat_cents']) . '</td></tr>';
        $html = '<!doctype html><html><head><meta charset="utf-8"><style>
            body{font-family:DejaVu Sans,sans-serif;font-size:11px;color:#0f172a}
            h1{font-size:22px;margin:0 0 4px} .muted{color:#64748b} table{width:100%;border-collapse:collapse}
            .box td{vertical-align:top;width:50%} .lines td,.lines th{border-bottom:1px solid #e2e8f0;padding:8px 6px}
            .lines th{text-align:left;background:#f1f5f9} .r{text-align:right} .tot td{padding:4px 6px} .tot .big td{font-weight:bold;font-size:13px;border-top:2px solid #0f172a}
            .note{font-size:10px;color:#475569;padding-top:6px}</style></head><body>'
            . '<table class="box"><tr><td>' . implode('<br>', array_map([self::class, 'e'], $issuerLines)) . '</td>'
            . '<td class="r"><h1>' . $title . '</h1><div>N° <b>' . self::e($inv['number']) . '</b></div>'
            . '<div class="muted">Date : ' . self::e(date('d/m/Y', strtotime($inv['issued_at']))) . '</div>'
            . '<div class="muted">Période : ' . self::e($monthLabel) . '</div></td></tr></table><br>'
            . '<table class="box"><tr><td></td><td><b>' . self::e($cust['legal_name'] ?? '') . '</b><br>' . self::e($cust['address'] ?? '')
            . (!empty($cust['siret']) ? '<br>SIRET ' . self::e($cust['siret']) : '') . (!empty($cust['vat_number']) ? '<br>TVA ' . self::e($cust['vat_number']) : '') . '</td></tr></table><br><br>'
            . '<table class="lines"><tr><th>Désignation</th><th class="r">Montant HT</th></tr>'
            . '<tr><td>' . ($isCredit ? 'Remboursement de commissions de billetterie' : 'Commissions de billetterie en ligne (frais de réservation)')
            . ' – ' . self::e($monthLabel) . '<br><span class="muted">' . count($m['paid']) . ' réservation(s) payée(s) : ' . self::money($m['fees_in'])
            . ($m['fees_out'] ? ' · frais remboursés : ' . self::money($m['fees_out']) : '') . ' (TTC). Détail dans le fichier CSV joint.</span></td>'
            . '<td class="r">' . self::money((int)$inv['ht_cents']) . '</td></tr></table><br>'
            . '<table class="tot" style="width:45%;margin-left:55%"><tr><td>Total HT</td><td class="r">' . self::money((int)$inv['ht_cents']) . '</td></tr>'
            . $vatLine
            . '<tr class="big"><td>' . ($isCredit ? 'Total de l\'avoir TTC' : 'Total TTC') . '</td><td class="r">' . self::money((int)$inv['fees_ttc_cents']) . '</td></tr></table><br><br>'
            . '<div class="note">' . ($isCredit ? 'Avoir imputé sur les prochaines commissions.' : 'Facture acquittée : les commissions ont été prélevées automatiquement sur chaque paiement (Stripe Connect). Aucun règlement n\'est à effectuer.') . '</div>'
            . '<div class="note">Pas d\'escompte pour paiement anticipé. En cas de retard de paiement : pénalités au taux d\'intérêt légal majoré de 10 points et indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 du Code de commerce).</div>'
            . '</body></html>';

        require_once __DIR__ . '/../vendor/autoload.php';
        $opt = new \Dompdf\Options();
        $opt->set('isRemoteEnabled', false);
        $opt->set('defaultFont', 'DejaVu Sans');
        $pdf = new \Dompdf\Dompdf($opt);
        $pdf->loadHtml($html, 'UTF-8');
        $pdf->setPaper('A4');
        $pdf->render();
        file_put_contents("$dir/$safe.pdf", $pdf->output());
        return ["invoices/{$inv['client_id']}/$safe.pdf", "invoices/{$inv['client_id']}/$safe.csv"];
    }

    private static function monthFr(string $period): string {
        $months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
        return $months[(int)substr($period, 5, 2) - 1] . ' ' . substr($period, 0, 4);
    }

    /** API shape. */
    public static function toApi(array $r): array {
        return [
            'id' => (int)$r['id'], 'number' => $r['number'], 'kind' => $r['kind'],
            'period_start' => $r['period_start'], 'period_end' => $r['period_end'],
            'fees_ttc_cents' => (int)$r['fees_ttc_cents'], 'ht_cents' => (int)$r['ht_cents'], 'vat_cents' => (int)$r['vat_cents'],
            'vat_scheme' => $r['vat_scheme'], 'bookings_count' => (int)$r['bookings_count'], 'issued_at' => $r['issued_at'],
            'client_id' => (int)$r['client_id'],
        ];
    }

    /** Stream a stored file (pdf|csv) of an invoice. */
    public static function stream(array $inv, string $what): void {
        $rel = $what === 'csv' ? $inv['csv_path'] : $inv['pdf_path'];
        $path = $rel ? realpath(__DIR__ . '/../storage/' . $rel) : false;
        $root = realpath(__DIR__ . '/../storage');
        if (!$path || !$root || strpos($path, $root) !== 0 || !is_file($path)) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'not_found']);
            exit;
        }
        header('Content-Type: ' . ($what === 'csv' ? 'text/csv; charset=utf-8' : 'application/pdf'));
        header('Content-Disposition: attachment; filename="' . preg_replace('/[^A-Za-z0-9.-]/', '', basename($path)) . '"');
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: private, no-store');
        readfile($path);
        exit;
    }

    /** Admin dashboard: sales, fees, refunds per licensee for a year (by Paris month). */
    public static function revenue($db, int $year): array {
        $rows = $db->fetchAll(
            "SELECT b.client_id, COALESCE(c.legal_name, c.company, c.name) AS licensee,
                    DATE_FORMAT(CONVERT_TZ(b.paid_at, '+00:00', 'Europe/Paris'), '%Y-%m') AS month_paris,
                    DATE_FORMAT(b.paid_at, '%Y-%m') AS month_utc,
                    COUNT(*) AS bookings, SUM(b.total_cents) AS gmv, SUM(b.booking_fee_cents) AS fees,
                    SUM(b.refunded_cents) AS refunded, SUM(b.fee_refunded_cents) AS fees_refunded
               FROM bookings b JOIN clients c ON c.id = b.client_id
              WHERE b.source = 'online' AND b.paid_at IS NOT NULL AND b.payment_status IN ('paid','partially_refunded','refunded')
                AND YEAR(b.paid_at) = ?
              GROUP BY b.client_id, licensee, month_paris, month_utc ORDER BY month_utc, licensee",
            [$year]
        );
        $out = [];
        foreach ($rows as $r) {
            $out[] = [
                'client_id' => (int)$r['client_id'], 'licensee' => $r['licensee'],
                // CONVERT_TZ needs MySQL time zone tables; fall back to the UTC month.
                'month' => $r['month_paris'] ?: $r['month_utc'],
                'bookings' => (int)$r['bookings'], 'gmv_cents' => (int)$r['gmv'], 'fees_cents' => (int)$r['fees'],
                'refunded_cents' => (int)$r['refunded'], 'fees_refunded_cents' => (int)$r['fees_refunded'],
            ];
        }
        return $out;
    }
}
