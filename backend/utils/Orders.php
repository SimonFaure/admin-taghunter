<?php
/**
 * Commandes: equipment sale + rental order REQUESTS (no online payment).
 * Memory: project_studio_commandes_equipment_orders. Tables: add_orders_equipment.sql.
 *
 * Money is integer cents excl. VAT. A rental product line costs
 * qty x unit_price x days (days = rent_end - rent_start + 1, inclusive);
 * free admin lines (product_id NULL, e.g. shipping) are qty x unit_price.
 */
require_once __DIR__ . '/Mailer.php';
require_once __DIR__ . '/PaymentsConfig.php';

class Orders {
    public const APPS = ['playground', 'go', 'spot'];
    public const LANGS = ['fr', 'en', 'es'];
    public const STATUSES = ['new', 'confirmed', 'shipped', 'done', 'cancelled'];
    public const MODES = ['post', 'in_person'];
    public const MEDIA_SUBDIR = 'orders';

    public static function migrated($db): bool {
        try {
            $db->fetch('SELECT 1 FROM order_products LIMIT 1');
            return true;
        } catch (Throwable $e) {
            return false;
        }
    }

    // ── i18n helpers ─────────────────────────────────────────────────────

    /** {"fr":..,"en":..,"es":..} with trimmed strings / nulls; unknown keys dropped. */
    public static function cleanI18n($v, int $max): array {
        $out = [];
        foreach (self::LANGS as $l) {
            $s = is_array($v) && isset($v[$l]) && is_string($v[$l]) ? trim($v[$l]) : '';
            $out[$l] = $s === '' ? null : mb_substr($s, 0, $max);
        }
        return $out;
    }

    public static function decodeI18n(?string $json): array {
        $v = $json ? json_decode($json, true) : null;
        return self::cleanI18n(is_array($v) ? $v : [], 100000);
    }

    /** Text in $lang, else French, else the first non-empty one. */
    public static function pick(array $i18n, string $lang): string {
        foreach ([$lang, 'fr', 'en', 'es'] as $l) {
            if (!empty($i18n[$l])) return (string)$i18n[$l];
        }
        return '';
    }

    public static function lang(?string $l): string {
        return in_array($l, self::LANGS, true) ? $l : 'fr';
    }

    // ── Media ────────────────────────────────────────────────────────────

    public static function mediaDir(): string {
        return __DIR__ . '/../../media/' . self::MEDIA_SUBDIR;
    }

    /** Relative URL (frontend prefixes VITE_MEDIA_BASE_URL). */
    public static function mediaPath(string $file): string {
        return '/media/' . self::MEDIA_SUBDIR . '/' . rawurlencode(basename($file));
    }

    public static function mediaAbsUrl(string $file): string {
        return PaymentsConfig::studioBase() . self::mediaPath($file);
    }

    // ── Products ─────────────────────────────────────────────────────────

    /** Non-deleted variants grouped by product id (ordered). */
    public static function variantsByProduct($db, array $productIds): array {
        $productIds = array_values(array_unique(array_map('intval', $productIds)));
        if (!$productIds) return [];
        $in = implode(',', array_fill(0, count($productIds), '?'));
        $out = [];
        foreach ($db->fetchAll("SELECT * FROM order_product_variants WHERE deleted_at IS NULL AND product_id IN ($in) ORDER BY sort_order, id", $productIds) as $v) {
            $out[(int)$v['product_id']][] = self::variantOut($v);
        }
        return $out;
    }

    public static function variantOut(array $v): array {
        return [
            'id' => (int)$v['id'],
            'label_i18n' => self::decodeI18n($v['label_i18n']),
            'sku' => $v['sku'],
            'sale_price_cents' => $v['sale_price_cents'] !== null ? (int)$v['sale_price_cents'] : null,
            'rent_price_cents_per_day' => $v['rent_price_cents_per_day'] !== null ? (int)$v['rent_price_cents_per_day'] : null,
            'image' => $v['image'] ? ['file' => $v['image'], 'url' => self::mediaPath($v['image'])] : null,
            'sort_order' => (int)$v['sort_order'],
        ];
    }

    /** Products + their variants, in one extra query. */
    public static function productsOut($db, array $rows): array {
        $vars = self::variantsByProduct($db, array_column($rows, 'id'));
        return array_map(fn($r) => self::productOut($r, $vars[(int)$r['id']] ?? []), $rows);
    }

    /**
     * Unit price of a product (or one of its variants) for a kind; null = not orderable that way.
     * With variants, only variant prices count.
     */
    public static function unitPrice(array $p, string $kind, ?int $variantId): ?int {
        $field = $kind === 'rent' ? 'rent_price_cents_per_day' : 'sale_price_cents';
        if (!($kind === 'rent' ? $p['rent_enabled'] : $p['sale_enabled'])) return null;
        if ($p['variants']) {
            foreach ($p['variants'] as $v) if ($v['id'] === $variantId) return $v[$field];
            return null;
        }
        return $variantId ? null : $p[$field];
    }

    public static function productOut(array $r, array $variants = []): array {
        $apps = json_decode($r['apps'] ?? 'null', true);
        $images = json_decode($r['images'] ?? 'null', true);
        $images = is_array($images) ? array_values(array_filter($images, 'is_string')) : [];
        return [
            'id' => (int)$r['id'],
            'sku' => $r['sku'],
            'category_id' => $r['category_id'] !== null ? (int)$r['category_id'] : null,
            'name_i18n' => self::decodeI18n($r['name_i18n']),
            'sale_enabled' => (int)$r['sale_enabled'] === 1,
            'sale_price_cents' => $r['sale_price_cents'] !== null ? (int)$r['sale_price_cents'] : null,
            'sale_description_i18n' => self::decodeI18n($r['sale_description_i18n']),
            'rent_enabled' => (int)$r['rent_enabled'] === 1,
            'rent_price_cents_per_day' => $r['rent_price_cents_per_day'] !== null ? (int)$r['rent_price_cents_per_day'] : null,
            'rent_description_i18n' => self::decodeI18n($r['rent_description_i18n']),
            'apps' => is_array($apps) ? array_values(array_intersect(self::APPS, $apps)) : [],
            'images' => array_map(fn($f) => ['file' => $f, 'url' => self::mediaPath($f)], $images),
            'visible' => (int)$r['visible'] === 1,
            'sort_order' => (int)$r['sort_order'],
            'variants' => $variants,
        ];
    }

    public static function categoryOut(array $r): array {
        return [
            'id' => (int)$r['id'],
            'name_i18n' => self::decodeI18n($r['name_i18n']),
            'sort_order' => (int)$r['sort_order'],
        ];
    }

    /** Apps switched on for a licensee (clients.*_enabled, no billing check). */
    public static function clientApps(array $client): array {
        $apps = [];
        if ((int)($client['playground_enabled'] ?? 1) === 1) $apps[] = 'playground';
        if ((int)($client['go_enabled'] ?? 0) === 1) $apps[] = 'go';
        if ((int)($client['spot_enabled'] ?? 0) === 1) $apps[] = 'spot';
        return $apps;
    }

    /** Product visible to that licensee: no app ticked, or one ticked app is on. */
    public static function visibleToApps(array $productOut, array $clientApps): bool {
        return count($productOut['apps']) === 0 || count(array_intersect($productOut['apps'], $clientApps)) > 0;
    }

    /** Every visible, non-deleted product the licensee may see (both kinds). */
    public static function catalogForClient($db, array $client): array {
        $apps = self::clientApps($client);
        $rows = $db->fetchAll('SELECT * FROM order_products WHERE deleted_at IS NULL AND visible = 1 AND (sale_enabled = 1 OR rent_enabled = 1)');
        $out = [];
        foreach (self::productsOut($db, $rows) as $p) {
            if (!self::visibleToApps($p, $apps)) continue;
            // A side without a price is not orderable (with variants: no variant priced for it).
            if ($p['variants']) {
                $p['sale_enabled'] = $p['sale_enabled'] && count(array_filter($p['variants'], fn($v) => $v['sale_price_cents'] !== null)) > 0;
                $p['rent_enabled'] = $p['rent_enabled'] && count(array_filter($p['variants'], fn($v) => $v['rent_price_cents_per_day'] !== null)) > 0;
            } else {
                if ($p['sale_enabled'] && $p['sale_price_cents'] === null) $p['sale_enabled'] = false;
                if ($p['rent_enabled'] && $p['rent_price_cents_per_day'] === null) $p['rent_enabled'] = false;
            }
            if (!$p['sale_enabled'] && !$p['rent_enabled']) continue;
            unset($p['visible']);
            $out[] = $p;
        }
        return $out;
    }

    public static function categories($db): array {
        return array_map([self::class, 'categoryOut'], $db->fetchAll('SELECT * FROM order_product_categories WHERE deleted_at IS NULL ORDER BY sort_order, id'));
    }

    // ── Requests ─────────────────────────────────────────────────────────

    public static function days(?string $start, ?string $end): int {
        if (!$start || !$end) return 0;
        $a = DateTime::createFromFormat('!Y-m-d', $start);
        $b = DateTime::createFromFormat('!Y-m-d', $end);
        if (!$a || !$b || $b < $a) return 0;
        return (int)$a->diff($b)->days + 1;
    }

    public static function lineTotal(array $line, string $kind, int $days): int {
        $t = (int)$line['unit_price_cents'] * (int)$line['quantity'];
        return ($kind === 'rent' && $line['product_id'] !== null) ? $t * max(1, $days) : $t;
    }

    public static function nextNumber($db, string $kind): string {
        $prefix = $kind === 'rent' ? 'LOC' : 'CMD';
        $year = (int)gmdate('Y');
        $db->execute(
            'INSERT INTO order_number_seq (prefix, year, last) VALUES (?, ?, LAST_INSERT_ID(1))
             ON DUPLICATE KEY UPDATE last = LAST_INSERT_ID(last + 1)',
            [$prefix, $year]
        );
        $n = (int)$db->fetch('SELECT LAST_INSERT_ID() AS n')['n'];
        return sprintf('%s-%d-%04d', $prefix, $year, $n);
    }

    public static function requestOut($db, array $r, bool $withDetail, string $lang): array {
        $days = $r['kind'] === 'rent' ? self::days($r['rent_start'], $r['rent_end']) : 0;
        $lines = $db->fetchAll('SELECT * FROM order_request_lines WHERE request_id = ? ORDER BY sort_order, id', [$r['id']]);
        $total = 0;
        $linesOut = [];
        foreach ($lines as $l) {
            $l['product_id'] = $l['product_id'] !== null ? (int)$l['product_id'] : null;
            $lt = self::lineTotal($l, $r['kind'], $days);
            $total += $lt;
            $i18n = self::decodeI18n($l['name_i18n'] ?? null);
            $linesOut[] = [
                'id' => (int)$l['id'],
                'product_id' => $l['product_id'],
                'variant_id' => isset($l['variant_id']) && $l['variant_id'] !== null ? (int)$l['variant_id'] : null,
                'sku' => $l['sku'],
                'name' => $l['name'],
                'display_name' => self::pick($i18n, $lang) ?: $l['name'],
                'unit_price_cents' => (int)$l['unit_price_cents'],
                'quantity' => (int)$l['quantity'],
                'total_cents' => $lt,
            ];
        }
        $out = [
            'id' => (int)$r['id'],
            'number' => $r['number'],
            'kind' => $r['kind'],
            'status' => $r['status'],
            'client_id' => (int)$r['client_id'],
            'client_name' => $r['client_name'] ?? null,
            'rent_start' => $r['rent_start'],
            'rent_end' => $r['rent_end'],
            'days' => $days,
            'line_count' => count($linesOut),
            'total_cents' => $total,
            'created_at' => $r['created_at'],
            'updated_at' => $r['updated_at'],
        ];
        if ($withDetail) {
            $out['lines'] = $linesOut;
            foreach (['pickup_mode', 'return_mode', 'company', 'contact_name', 'contact_email', 'contact_phone',
                      'address_line1', 'address_line2', 'postal_code', 'city', 'country', 'message', 'language'] as $k) {
                $out[$k] = $r[$k];
            }
            $out['events'] = array_map(fn($e) => [
                'id' => (int)$e['id'], 'type' => $e['type'], 'status' => $e['status'], 'note' => $e['note'],
                'actor' => $e['actor'], 'created_at' => $e['created_at'],
            ], $db->fetchAll('SELECT * FROM order_request_events WHERE request_id = ? ORDER BY id', [$r['id']]));
        }
        return $out;
    }

    public static function logEvent($db, int $requestId, string $type, ?string $status, ?string $note, string $actor, ?int $actorId): void {
        $db->execute(
            'INSERT INTO order_request_events (request_id, type, status, note, actor, actor_id) VALUES (?, ?, ?, ?, ?, ?)',
            [$requestId, $type, $status, $note, $actor, $actorId]
        );
    }

    // ── Settings ─────────────────────────────────────────────────────────

    public static function notifyEmails($db): array {
        $row = $db->fetch("SELECT value FROM order_settings WHERE name = 'notify_emails'");
        $v = json_decode($row['value'] ?? '[]', true);
        return is_array($v) ? array_values(array_filter($v, fn($e) => is_string($e) && filter_var($e, FILTER_VALIDATE_EMAIL))) : [];
    }

    // ── Emails ───────────────────────────────────────────────────────────

    private const T = [
        'fr' => [
            'sale' => 'Matériel supplémentaire & back up', 'rent' => 'Location de matériel',
            'received_subject' => 'Demande {n} reçue', 'received_intro' => 'Nous avons bien reçu votre demande. Nous revenons vers vous rapidement pour la confirmer.',
            'status_subject' => 'Demande {n} : {s}', 'status_intro' => 'Le statut de votre demande a changé : {s}.',
            'note' => 'Message de Tag Hunter', 'product' => 'Article', 'qty' => 'Qté', 'unit' => 'Prix unitaire HT', 'total' => 'Total HT',
            'per_day' => '/jour', 'days' => 'Période : du {a} au {b} ({d} jours)', 'estimate' => 'Total estimé HT',
            'vat_note' => 'Frais de port et TVA en sus, confirmés par Tag Hunter.', 'view' => 'Voir ma demande',
            'new' => 'Nouvelle', 'confirmed' => 'Confirmée', 'shipped' => 'Expédiée', 'done' => 'Terminée', 'cancelled' => 'Annulée',
        ],
        'en' => [
            'sale' => 'Extra equipment & backup', 'rent' => 'Equipment rental',
            'received_subject' => 'Request {n} received', 'received_intro' => 'We have received your request. We will get back to you shortly to confirm it.',
            'status_subject' => 'Request {n}: {s}', 'status_intro' => 'The status of your request has changed: {s}.',
            'note' => 'Message from Tag Hunter', 'product' => 'Item', 'qty' => 'Qty', 'unit' => 'Unit price excl. VAT', 'total' => 'Total excl. VAT',
            'per_day' => '/day', 'days' => 'Period: {a} to {b} ({d} days)', 'estimate' => 'Estimated total excl. VAT',
            'vat_note' => 'Shipping and VAT extra, confirmed by Tag Hunter.', 'view' => 'View my request',
            'new' => 'New', 'confirmed' => 'Confirmed', 'shipped' => 'Shipped', 'done' => 'Completed', 'cancelled' => 'Cancelled',
        ],
        'es' => [
            'sale' => 'Material adicional y de reserva', 'rent' => 'Alquiler de material',
            'received_subject' => 'Solicitud {n} recibida', 'received_intro' => 'Hemos recibido su solicitud. Le contactaremos en breve para confirmarla.',
            'status_subject' => 'Solicitud {n}: {s}', 'status_intro' => 'El estado de su solicitud ha cambiado: {s}.',
            'note' => 'Mensaje de Tag Hunter', 'product' => 'Artículo', 'qty' => 'Cant.', 'unit' => 'Precio unitario sin IVA', 'total' => 'Total sin IVA',
            'per_day' => '/día', 'days' => 'Periodo: del {a} al {b} ({d} días)', 'estimate' => 'Total estimado sin IVA',
            'vat_note' => 'Gastos de envío e IVA aparte, confirmados por Tag Hunter.', 'view' => 'Ver mi solicitud',
            'new' => 'Nueva', 'confirmed' => 'Confirmada', 'shipped' => 'Enviada', 'done' => 'Finalizada', 'cancelled' => 'Cancelada',
        ],
    ];

    private static function t(string $lang, string $key, array $vars = []): string {
        $s = self::T[$lang][$key] ?? self::T['fr'][$key] ?? $key;
        foreach ($vars as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
        return $s;
    }

    public static function money(int $cents, string $lang = 'fr'): string {
        $n = number_format($cents / 100, 2, $lang === 'en' ? '.' : ',', $lang === 'en' ? ',' : "\u{202F}");
        return $lang === 'en' ? "€$n" : "$n\u{00A0}€";
    }

    private static function fmtDate(?string $d, string $lang): string {
        if (!$d) return '';
        $x = DateTime::createFromFormat('!Y-m-d', $d);
        if (!$x) return $d;
        return $lang === 'en' ? $x->format('Y-m-d') : $x->format('d/m/Y');
    }

    private static function h(?string $s): string {
        return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    }

    /** Lines table + total, as HTML, in $lang (display names) for $out (requestOut with detail). */
    private static function linesHtml(array $out, string $lang): string {
        $rent = $out['kind'] === 'rent';
        $th = 'style="text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px;color:#555"';
        $td = 'style="padding:6px 8px;border-bottom:1px solid #eee;font-size:14px"';
        $html = '<table style="border-collapse:collapse;width:100%;margin:12px 0">'
            . '<tr><th ' . $th . '>' . self::h(self::t($lang, 'product')) . '</th><th ' . $th . '>' . self::h(self::t($lang, 'qty'))
            . '</th><th ' . $th . '>' . self::h(self::t($lang, 'unit')) . '</th><th ' . $th . '>' . self::h(self::t($lang, 'total')) . '</th></tr>';
        foreach ($out['lines'] as $l) {
            $unit = self::money($l['unit_price_cents'], $lang) . ($rent && $l['product_id'] !== null ? self::t($lang, 'per_day') : '');
            $name = self::h($l['display_name']) . ($l['sku'] ? ' <span style="color:#888;font-size:12px">' . self::h($l['sku']) . '</span>' : '');
            $html .= "<tr><td $td>$name</td><td $td>{$l['quantity']}</td><td $td>" . self::h($unit) . "</td><td $td>" . self::h(self::money($l['total_cents'], $lang)) . '</td></tr>';
        }
        $html .= '</table>';
        if ($rent) {
            $html .= '<p style="margin:4px 0">' . self::h(self::t($lang, 'days', [
                'a' => self::fmtDate($out['rent_start'], $lang), 'b' => self::fmtDate($out['rent_end'], $lang), 'd' => $out['days'],
            ])) . '</p>';
        }
        $html .= '<p style="margin:4px 0;font-weight:bold">' . self::h(self::t($lang, 'estimate')) . ($lang === 'fr' ? ' : ' : ': ') . self::h(self::money($out['total_cents'], $lang)) . '</p>'
            . '<p style="margin:4px 0;color:#666;font-size:12px">' . self::h(self::t($lang, 'vat_note')) . '</p>';
        return $html;
    }

    private static function wrap(string $title, string $body): string {
        return '<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;background:#f8fafc;margin:0;padding:24px">'
            . '<div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:24px">'
            . '<h2 style="margin:0 0 12px;font-size:18px">' . self::h($title) . '</h2>' . $body . '</div></body></html>';
    }

    private static function button(string $url, string $label): string {
        return '<p style="margin:20px 0 0"><a href="' . self::h($url) . '" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">' . self::h($label) . '</a></p>';
    }

    /**
     * Mailjet when configured (Mailer also writes a preview on Windows dev);
     * otherwise PHP mail(), like OTP and bug-report emails.
     */
    public static function sendMail(string $to, string $subject, string $html, ?string $replyTo = null): bool {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return false;
        try {
            $res = Mailer::send(['to' => $to, 'subject' => $subject, 'html' => $html, 'from_name' => 'Tag Hunter', 'reply_to' => $replyTo,
                'custom_id' => 'orders-' . substr(md5($to . $subject . microtime()), 0, 10)]);
            if ($res['ok']) return true;
            if (($res['error'] ?? '') !== 'mailjet_not_configured' || stripos(PHP_OS, 'WIN') === 0) {
                if (($res['error'] ?? '') !== 'mailjet_not_configured') error_log('[orders] mail failed: ' . ($res['error'] ?? '?'));
                return false;
            }
            $headers = "From: Tag Hunter <noreply@taghunter.fr>\r\n"
                . ($replyTo ? "Reply-To: $replyTo\r\n" : '')
                . "MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n";
            return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $html, $headers);
        } catch (Throwable $e) {
            error_log('[orders] mail exception: ' . $e->getMessage());
            return false;
        }
    }

    private static function licenseeLink(array $out): string {
        return PaymentsConfig::studioBase() . '/my/orders/requests/' . $out['id'];
    }

    private static function adminLink(array $out): string {
        return PaymentsConfig::studioBase() . '/admin?tab=' . ($out['kind'] === 'rent' ? 'orders-rent' : 'orders-sale') . '&request=' . $out['id'];
    }

    private static function licenseeEmail(array $out, array $client): string {
        return (string)($out['contact_email'] ?: ($client['email'] ?? ''));
    }

    /** New request: notify Taghunter (French) + acknowledge to the licensee (their language). */
    public static function mailSubmitted($db, array $out, array $client): void {
        $fr = $out;
        foreach ($fr['lines'] as &$l) $l['display_name'] = $l['name'];
        unset($l);
        $kindLabel = self::t('fr', $out['kind']);
        $who = self::h($client['company'] ?: $client['name'] ?: $client['email']);
        $addr = array_filter([$out['company'], $out['contact_name'], $out['address_line1'], $out['address_line2'],
            trim(($out['postal_code'] ?? '') . ' ' . ($out['city'] ?? '')), $out['country']]);
        $body = '<p><strong>' . $who . '</strong> a envoyé une demande <strong>' . self::h($out['number']) . '</strong> (' . self::h($kindLabel) . ').</p>'
            . self::linesHtml($fr, 'fr');
        if ($out['kind'] === 'rent') {
            $mode = fn($m) => $m === 'in_person' ? 'en main propre' : ($m === 'post' ? 'par transporteur' : '-');
            $body .= '<p>Retrait / livraison : ' . self::h($mode($out['pickup_mode'])) . ' · Retour : ' . self::h($mode($out['return_mode'])) . '</p>';
        }
        $body .= '<p><strong>Contact</strong><br>' . implode('<br>', array_map([self::class, 'h'], $addr))
            . '<br>' . self::h($out['contact_email']) . ($out['contact_phone'] ? ' · ' . self::h($out['contact_phone']) : '') . '</p>';
        if ($out['message']) $body .= '<p><strong>Message</strong><br>' . nl2br(self::h($out['message'])) . '</p>';
        $body .= '<p style="color:#b45309;font-size:12px">Pas de contrôle de stock : vérifiez la disponibilité avant de confirmer.</p>'
            . self::button(self::adminLink($out), 'Ouvrir dans Studio');
        $html = self::wrap('Nouvelle demande ' . $out['number'], $body);
        $replyTo = self::licenseeEmail($out, $client) ?: null;
        foreach (self::notifyEmails($db) as $to) {
            self::sendMail($to, '[Commandes] ' . $out['number'] . ' - ' . html_entity_decode(strip_tags($who)), $html, $replyTo);
        }

        $lang = self::lang($out['language']);
        $lb = '<p>' . self::h(self::t($lang, 'received_intro')) . '</p>'
            . '<p><strong>' . self::h($out['number']) . '</strong> · ' . self::h(self::t($lang, $out['kind'])) . '</p>'
            . self::linesHtml($out, $lang) . self::button(self::licenseeLink($out), self::t($lang, 'view'));
        self::sendMail(self::licenseeEmail($out, $client), self::t($lang, 'received_subject', ['n' => $out['number']]),
            self::wrap(self::t($lang, 'received_subject', ['n' => $out['number']]), $lb), self::notifyEmails($db)[0] ?? null);
    }

    /** Admin changed the status: tell the licensee, with the note and current lines/total. */
    public static function mailStatus($db, array $out, array $client, ?string $note): void {
        $lang = self::lang($out['language']);
        $s = self::t($lang, $out['status']);
        $body = '<p>' . self::h(self::t($lang, 'status_intro', ['s' => $s])) . '</p>';
        if ($note) $body .= '<div style="background:#f1f5f9;border-radius:6px;padding:10px 12px;margin:12px 0"><strong>' . self::h(self::t($lang, 'note')) . '</strong><br>' . nl2br(self::h($note)) . '</div>';
        $body .= '<p><strong>' . self::h($out['number']) . '</strong> · ' . self::h(self::t($lang, $out['kind'])) . '</p>'
            . self::linesHtml($out, $lang) . self::button(self::licenseeLink($out), self::t($lang, 'view'));
        $subject = self::t($lang, 'status_subject', ['n' => $out['number'], 's' => $s]);
        self::sendMail(self::licenseeEmail($out, $client), $subject, self::wrap($subject, $body), self::notifyEmails($db)[0] ?? null);
    }

    /** Licensee cancelled a new request: tell Taghunter. */
    public static function mailCancelledByClient($db, array $out, array $client): void {
        $who = $client['company'] ?: $client['name'] ?: $client['email'];
        $html = self::wrap('Demande ' . $out['number'] . ' annulée',
            '<p><strong>' . self::h($who) . '</strong> a annulé sa demande <strong>' . self::h($out['number']) . '</strong>.</p>'
            . self::button(self::adminLink($out), 'Ouvrir dans Studio'));
        foreach (self::notifyEmails($db) as $to) {
            self::sendMail($to, '[Commandes] ' . $out['number'] . ' annulée par le licencié', $html);
        }
    }
}
