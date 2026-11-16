<?php
/**
 * Licensee addresses (Mon compte + admin licensee page).
 *  - main: the company address, the existing clients.company / address_line1 /
 *    address_line2 / postal_code / city / country / phone columns. Shared with the
 *    Events legal identity (LegalInfo keeps its own stricter checks for Events).
 *  - shipping: clients.shipping_* (add_client_shipping_address.sql), or "same as
 *    main" (shipping_same_as_main = 1).
 * Commandes prefills the delivery address from shipping (else main) and copies the
 * main address onto each request as the billing address.
 */
class ClientAddresses {
    const MAIN = ['company' => 190, 'address_line1' => 190, 'address_line2' => 190, 'postal_code' => 20, 'city' => 120, 'country' => 2, 'phone' => 50];
    const SHIPPING = ['name' => 190, 'company' => 190, 'address_line1' => 190, 'address_line2' => 190, 'postal_code' => 20, 'city' => 120, 'country' => 2, 'phone' => 50];
    /** Fields an address needs once any address field is filled in. */
    const REQUIRED = ['address_line1', 'postal_code', 'city', 'country'];

    public static function toApi(array $c): array {
        $main = [];
        foreach (self::MAIN as $k => $_) $main[$k] = $c[$k] ?? null;
        $ship = [];
        foreach (self::SHIPPING as $k => $_) $ship[$k] = $c['shipping_' . $k] ?? null;
        return [
            'main' => $main,
            'shipping_same_as_main' => (int)($c['shipping_same_as_main'] ?? 1) === 1,
            'shipping' => $ship,
        ];
    }

    private static function clean(array $in, array $spec): array {
        $out = [];
        foreach ($spec as $k => $max) {
            $v = isset($in[$k]) && (is_string($in[$k]) || is_numeric($in[$k])) ? preg_replace('/\s+/u', ' ', trim((string)$in[$k])) : '';
            $out[$k] = $v === '' ? null : mb_substr($v, 0, $max);
        }
        if ($out['country'] !== null) $out['country'] = strtoupper($out['country']);
        return $out;
    }

    /** @return array [$main, $sameAsMain, $shipping, $errors] - errors keyed "main.city", "shipping.country"... */
    public static function validate(array $in): array {
        $main = self::clean(is_array($in['main'] ?? null) ? $in['main'] : [], self::MAIN);
        $same = !empty($in['shipping_same_as_main']);
        $ship = self::clean(is_array($in['shipping'] ?? null) ? $in['shipping'] : [], self::SHIPPING);
        $errors = [];
        $addressKeys = ['address_line1', 'address_line2', 'postal_code', 'city', 'country'];
        // Main address: optional, but complete once started.
        if (array_filter(array_intersect_key($main, array_flip($addressKeys)))) {
            foreach (self::REQUIRED as $k) if ($main[$k] === null) $errors["main.$k"] = 'required';
        }
        if (!$same) {
            foreach (self::REQUIRED as $k) if ($ship[$k] === null) $errors["shipping.$k"] = 'required';
            if ($ship['name'] === null && $ship['company'] === null) $errors['shipping.name'] = 'required';
        }
        foreach (['main' => $main, 'shipping' => $ship] as $prefix => $a) {
            if ($a['country'] !== null && !preg_match('/^[A-Z]{2}$/', $a['country'])) $errors["$prefix.country"] = 'invalid';
        }
        return [$main, $same, $ship, $errors];
    }

    public static function save($db, int $clientId, array $main, bool $same, array $ship): void {
        $sets = [];
        $vals = [];
        foreach ($main as $k => $v) { $sets[] = "$k = ?"; $vals[] = $v; }
        $sets[] = 'shipping_same_as_main = ?';
        $vals[] = $same ? 1 : 0;
        // Keep the stored shipping fields when "same as main" is ticked, so unticking restores them.
        foreach ($ship as $k => $v) { $sets[] = "shipping_$k = ?"; $vals[] = $v; }
        $vals[] = $clientId;
        $db->execute('UPDATE clients SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
    }

    /** True when the main address has its required fields. */
    public static function mainComplete(array $c): bool {
        foreach (self::REQUIRED as $k) if (empty($c[$k])) return false;
        return true;
    }

    /** Delivery prefill for an order: the shipping address when set, else the main address. */
    public static function delivery(array $c): array {
        $useShipping = (int)($c['shipping_same_as_main'] ?? 1) === 0 && !empty($c['shipping_address_line1']);
        if ($useShipping) {
            return [
                'company' => $c['shipping_company'] ?? null,
                'contact_name' => ($c['shipping_name'] ?? null) ?: ($c['name'] ?? null),
                'contact_phone' => ($c['shipping_phone'] ?? null) ?: ($c['phone'] ?? null),
                'address_line1' => $c['shipping_address_line1'],
                'address_line2' => $c['shipping_address_line2'] ?? null,
                'postal_code' => $c['shipping_postal_code'] ?? null,
                'city' => $c['shipping_city'] ?? null,
                'country' => $c['shipping_country'] ?? null,
                'source' => 'shipping',
            ];
        }
        return [
            'company' => ($c['company'] ?? null) ?: ($c['legal_name'] ?? null),
            'contact_name' => $c['name'] ?? null,
            'contact_phone' => ($c['phone'] ?? null) ?: ($c['public_phone'] ?? null),
            'address_line1' => $c['address_line1'] ?? null,
            'address_line2' => $c['address_line2'] ?? null,
            'postal_code' => $c['postal_code'] ?? null,
            'city' => $c['city'] ?? null,
            'country' => $c['country'] ?? null,
            'source' => self::mainComplete($c) ? 'main' : 'none',
        ];
    }

    /** Billing snapshot for an order request (the main address). */
    public static function billing(array $c): array {
        return [
            'billing_company' => ($c['legal_name'] ?? null) ?: ($c['company'] ?? null),
            'billing_address_line1' => $c['address_line1'] ?? null,
            'billing_address_line2' => $c['address_line2'] ?? null,
            'billing_postal_code' => $c['postal_code'] ?? null,
            'billing_city' => $c['city'] ?? null,
            'billing_country' => $c['country'] ?? null,
        ];
    }
}
