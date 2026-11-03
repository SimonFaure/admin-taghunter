<?php
// Run: php backend/tests/events_pricing_test.php   (exit code 1 on failure)
require __DIR__ . '/../utils/EventsPricing.php';

$fails = 0;
function check($name, $got, $want) {
    global $fails;
    $ok = $got === $want;
    if (!$ok) $fails++;
    echo ($ok ? 'PASS ' : 'FAIL ') . $name . ($ok ? '' : ' -> got ' . json_encode($got) . ', want ' . json_encode($want)) . "\n";
}

$now = strtotime('2026-10-01 12:00:00 UTC');
$types = [
    1 => ['id' => 1, 'base_price_cents' => 3000, 'steps' => [
        ['id' => 11, 'price_cents' => 1800, 'ends_at' => null, 'ends_after_sold' => 50],
        ['id' => 12, 'price_cents' => 2200, 'ends_at' => strtotime('2026-10-10 00:00:00 UTC'), 'ends_after_sold' => 150],
        ['id' => 13, 'price_cents' => 2700, 'ends_at' => strtotime('2026-10-26 00:00:00 UTC'), 'ends_after_sold' => null],
    ]],
    2 => ['id' => 2, 'base_price_cents' => 1500, 'steps' => []],
    3 => ['id' => 3, 'base_price_cents' => 0, 'steps' => []],
];

// Tier selection
check('first tier while < 50 sold', EventsPricing::unitPrice($types[1], 0, $now)['price_cents'], 1800);
check('second tier from 50 sold', EventsPricing::unitPrice($types[1], 50, $now)['price_cents'], 2200);
check('third tier from 150 sold', EventsPricing::unitPrice($types[1], 150, $now)['price_cents'], 2700);
check('third tier after 10/10 date', EventsPricing::unitPrice($types[1], 60, strtotime('2026-10-11 UTC'))['price_cents'], 2700);
check('base after every tier', EventsPricing::unitPrice($types[1], 60, strtotime('2026-10-27 UTC'))['price_cents'], 3000);
check('base price, no tiers', EventsPricing::unitPrice($types[2], 999, $now), ['price_cents' => 1500, 'step_id' => null]);

// A booking straddling a tier: 48 sold, 4 tickets -> 2 x 18 + 2 x 22
$t = EventsPricing::priceTickets($types, [1 => 48], [1, 1, 1, 1], $now);
check('straddle prices', array_column($t, 'unit_price_cents'), [1800, 1800, 2200, 2200]);
check('straddle lines', EventsPricing::lines($t), [
    ['ticket_type_id' => 1, 'unit_price_cents' => 1800, 'quantity' => 2, 'amount_cents' => 3600],
    ['ticket_type_id' => 1, 'unit_price_cents' => 2200, 'quantity' => 2, 'amount_cents' => 4400],
]);

// Plan example: 3 x 15 EUR, -10 % (450) -> net 4050, fee 122 + 150 = 272, total 4322
$t = EventsPricing::priceTickets($types, [], [2, 2, 2], $now);
$tot = EventsPricing::totals($t, 0, 450, 300, 50);
check('plan example fee', $tot['booking_fee_cents'], 272);
check('plan example total', $tot['total_cents'], 4322);

// Coralie PDF example: 4 x 18 EUR, 3 % + 0.50 -> fee 416, total 7616
$t = EventsPricing::priceTickets([9 => ['id' => 9, 'base_price_cents' => 1800, 'steps' => []]], [], [9, 9, 9, 9], $now);
$tot = EventsPricing::totals($t, 0, 0, 300, 50);
check('PDF example fee', $tot['booking_fee_cents'], 416);
check('PDF example total', $tot['total_cents'], 7616);

// Fixed part only on PAID tickets; free tickets alone -> no fee at all
$t = EventsPricing::priceTickets($types, [], [2, 3], $now);
$tot = EventsPricing::totals($t, 0, 0, 300, 50);
check('fixed fee only on paid ticket', $tot['booking_fee_cents'], 45 + 50);
$t = EventsPricing::priceTickets($types, [], [3, 3], $now);
$tot = EventsPricing::totals($t, 0, 0, 300, 50);
check('free booking: no fee', [$tot['booking_fee_cents'], $tot['total_cents']], [0, 0]);

// Discount capped at subtotal
$tot = EventsPricing::totals(EventsPricing::priceTickets($types, [], [2], $now), 0, 99999, 300, 50);
check('100 % promo -> net 0, no fee', [$tot['discount_cents'], $tot['net_cents'], $tot['booking_fee_cents']], [1500, 0, 0]);

// Half-up rounding (3 % of 1250 = 37.5 -> 38)
check('half up', EventsPricing::roundDiv(300 * 1250, 10000), 38);

// VAT inside TTC: 20 % of 1200 TTC = 200; 5.5 % of 1055 = 55
check('vat 20 %', EventsPricing::vatOf(1200, 2000), 200);
check('vat 5.5 %', EventsPricing::vatOf(1055, 550), 55);
check('vat 0', EventsPricing::vatOf(1000, 0), 0);

// Stripe minimum
check('0.30 EUR refused', EventsPricing::chargeError(30), 'amount_too_small');
check('0 EUR ok (free)', EventsPricing::chargeError(0), null);
check('0.50 EUR ok', EventsPricing::chargeError(50), null);

// Unknown ticket type
try { EventsPricing::priceTickets($types, [], [42], $now); check('unknown type throws', false, true); }
catch (InvalidArgumentException $e) { check('unknown type throws', $e->getMessage(), 'unknown_ticket_type'); }

// Promo + spread (phase 3)
check('promo 10 %', EventsPricing::promoDiscount('percent', 1000, 4500), 450);
check('promo fixed capped', EventsPricing::promoDiscount('fixed', 9999, 4500), 4500);
check('promo 0 subtotal', EventsPricing::promoDiscount('percent', 1000, 0), 0);
check('spread exact sum', array_sum(EventsPricing::spread([3600, 4400, 2000], 1001)), 10000 - 1001);
check('spread proportional', EventsPricing::spread([3000, 1000], 400), [2700, 900]);
check('spread full', EventsPricing::spread([3000, 1000], 9999), [0, 0]);
check('spread none', EventsPricing::spread([3000, 1000], 0), [3000, 1000]);

echo $fails ? "\n$fails FAILED\n" : "\nALL PASSED\n";
exit($fails ? 1 : 0);
