<?php
/**
 * Pure pricing for Events bookings (no DB, no clock: everything is passed in),
 * so it is unit-tested by tests/events_pricing_test.php.
 *
 * Ticket price: a ticket type has a regular price (base_price_cents) and
 * earlier, cheaper tiers (steps). A tier applies while BOTH of its limits hold:
 * now < ends_at, and tickets of this type already sold < ends_after_sold. The
 * first applicable tier by position wins. Tickets of one booking are priced one
 * after the other, so a booking can straddle two tiers.
 *
 * Booking fee (Taghunter commission, paid by the buyer, VAT included):
 *   fee = round_half_up(commission_bp * net / 10000) + commission_fixed * paid tickets
 * where net = tickets (+ add-ons, phase 3) - discount. No fee when net is 0.
 */
class EventsPricing {
    /** Stripe's smallest EUR charge. A paid total under this cannot be checked out. */
    const MIN_CHARGE_CENTS = 50;

    /**
     * Current unit price of one ticket type.
     * @param array $type  ['id', 'base_price_cents', 'steps' => [['id','price_cents','ends_at'(ts|null),'ends_after_sold'(int|null)], ...]] (steps sorted by position)
     * @return array ['price_cents' => int, 'step_id' => ?int]
     */
    public static function unitPrice(array $type, int $soldSoFar, int $now): array {
        foreach ($type['steps'] ?? [] as $step) {
            $dateOk = $step['ends_at'] === null || $now < (int)$step['ends_at'];
            $soldOk = $step['ends_after_sold'] === null || $soldSoFar < (int)$step['ends_after_sold'];
            if ($dateOk && $soldOk) {
                return ['price_cents' => (int)$step['price_cents'], 'step_id' => (int)$step['id']];
            }
        }
        return ['price_cents' => (int)$type['base_price_cents'], 'step_id' => null];
    }

    /**
     * Price a list of requested tickets.
     * @param array $types     ticket_type_id => type (see unitPrice)
     * @param array $sold      ticket_type_id => tickets of that type already sold/held event-wide
     * @param array $requested [ticket_type_id, ticket_type_id, ...] in booking order
     * @return array tickets: [['ticket_type_id','unit_price_cents','step_id'], ...]
     */
    public static function priceTickets(array $types, array $sold, array $requested, int $now): array {
        $out = [];
        foreach ($requested as $typeId) {
            $typeId = (int)$typeId;
            $type = $types[$typeId] ?? null;
            if (!$type) throw new InvalidArgumentException('unknown_ticket_type');
            $count = (int)($sold[$typeId] ?? 0);
            $p = self::unitPrice($type, $count, $now);
            $sold[$typeId] = $count + 1;
            $out[] = ['ticket_type_id' => $typeId, 'unit_price_cents' => $p['price_cents'], 'step_id' => $p['step_id']];
        }
        return $out;
    }

    /** Half-up integer division of a non-negative numerator. */
    public static function roundDiv(int $num, int $den): int {
        return intdiv(2 * $num + $den, 2 * $den);
    }

    /**
     * Order totals.
     * @param array $tickets   output of priceTickets()
     * @param int   $addonsCents  add-ons subtotal (phase 3)
     * @param int   $discountCents promo discount, capped at the subtotal
     * @return array subtotal, discount, net, paid_tickets, fee, total
     */
    public static function totals(array $tickets, int $addonsCents, int $discountCents, int $commissionBp, int $commissionFixed): array {
        $ticketsCents = 0;
        $paid = 0;
        foreach ($tickets as $t) {
            $ticketsCents += (int)$t['unit_price_cents'];
            if ((int)$t['unit_price_cents'] > 0) $paid++;
        }
        $subtotal = $ticketsCents + $addonsCents;
        $discount = max(0, min($discountCents, $subtotal));
        $net = $subtotal - $discount;
        $fee = $net > 0 ? self::roundDiv($commissionBp * $net, 10000) + $commissionFixed * $paid : 0;
        return [
            'subtotal_cents' => $subtotal,
            'discount_cents' => $discount,
            'net_cents' => $net,
            'paid_tickets' => $paid,
            'booking_fee_cents' => $fee,
            'total_cents' => $net + $fee,
        ];
    }

    /**
     * Group tickets into display / Stripe lines: one line per (type, unit price).
     * @return array [['ticket_type_id','unit_price_cents','quantity','amount_cents'], ...]
     */
    public static function lines(array $tickets): array {
        $lines = [];
        foreach ($tickets as $t) {
            $key = $t['ticket_type_id'] . ':' . $t['unit_price_cents'];
            if (!isset($lines[$key])) {
                $lines[$key] = ['ticket_type_id' => (int)$t['ticket_type_id'], 'unit_price_cents' => (int)$t['unit_price_cents'], 'quantity' => 0, 'amount_cents' => 0];
            }
            $lines[$key]['quantity']++;
            $lines[$key]['amount_cents'] += (int)$t['unit_price_cents'];
        }
        return array_values($lines);
    }

    /** Promo discount on a subtotal: percent (value in bp) or fixed (cents), never above the subtotal. */
    public static function promoDiscount(string $kind, int $value, int $subtotalCents): int {
        if ($subtotalCents <= 0 || $value <= 0) return 0;
        $d = $kind === 'fixed' ? $value : self::roundDiv(min($value, 10000) * $subtotalCents, 10000);
        return min($d, $subtotalCents);
    }

    /**
     * Spread a discount over line amounts in proportion (largest remainder),
     * so each line stays >= 0 and the sum is exact. Returns the NET amounts.
     * Stripe Checkout has no negative lines: we charge these net amounts.
     */
    public static function spread(array $amounts, int $discount): array {
        $total = array_sum($amounts);
        if ($discount <= 0 || $total <= 0) return array_values($amounts);
        $discount = min($discount, $total);
        $cuts = [];
        $rema = [];
        $given = 0;
        foreach (array_values($amounts) as $i => $a) {
            $exact = $discount * $a;
            $cuts[$i] = intdiv($exact, $total);
            $rema[$i] = $exact % $total;
            $given += $cuts[$i];
        }
        arsort($rema);
        foreach (array_keys($rema) as $i) {
            if ($given >= $discount) break;
            $cuts[$i]++;
            $given++;
        }
        $out = [];
        foreach (array_values($amounts) as $i => $a) $out[] = $a - $cuts[$i];
        return $out;
    }

    /** VAT contained in a VAT-inclusive amount: ttc - round(ttc / (1 + rate)). */
    public static function vatOf(int $ttcCents, int $vatBp): int {
        if ($vatBp <= 0 || $ttcCents <= 0) return 0;
        return $ttcCents - self::roundDiv($ttcCents * 10000, 10000 + $vatBp);
    }

    /** Error code when the total cannot be charged, else null. */
    public static function chargeError(int $totalCents): ?string {
        if ($totalCents > 0 && $totalCents < self::MIN_CHARGE_CENTS) return 'amount_too_small';
        return null;
    }
}
