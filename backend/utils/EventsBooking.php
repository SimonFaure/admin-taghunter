<?php
/**
 * Booking lifecycle for Events: validate -> hold places -> Stripe Checkout
 * (direct charge on the licensee's account, application fee = our booking
 * fee) -> fulfil on payment, or confirm at once when free. Phase 3 adds
 * add-ons (stock per variant), promo codes and manual (offline) bookings.
 *
 * Capacity race: the hold runs in ONE transaction that locks the event row,
 * then the slot row, then the promo row (always in that order), counts taken
 * places / stock / promo uses, prices everything and inserts the booking. Two
 * buyers can never both take the last places. Stripe is called after commit.
 */
require_once __DIR__ . '/EventsRepo.php';
require_once __DIR__ . '/EventsPricing.php';
require_once __DIR__ . '/EventsSettings.php';
require_once __DIR__ . '/EventsTokens.php';
require_once __DIR__ . '/StripeConnect.php';
require_once __DIR__ . '/PaymentsConfig.php';

class BookingError extends RuntimeException {
    public int $status;
    public array $details;

    public function __construct(string $code, int $status = 422, array $details = []) {
        parent::__construct($code);
        $this->status = $status;
        $this->details = $details;
    }
}

class EventsBooking {
    const MAX_TICKETS = 30;
    const MAX_ADDON_UNITS = 50;
    const HOLD_MINUTES = 36;            // > the 31-minute Checkout session, so the session always expires first
    const CHECKOUT_MINUTES = 31;        // Stripe minimum is 30
    const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const MANUAL_SOURCES = ['manual_onsite', 'manual_invoice', 'manual_free'];

    // ── Validation ───────────────────────────────────────────────────────

    private static function str($v, int $max): string {
        return mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$v)), 0, $max);
    }

    /**
     * Validate players (names/ages, team size, ages, minor rule) for a list of
     * tickets. Shared by new bookings and later edits. Adds to $errors.
     * @param array $tickets [['ticket_type_id', 'first_name', 'age'], ...]
     */
    public static function validatePlayers(array $event, array $types, array $tickets, bool $details, array &$errors, string $prefix = 'tickets'): void {
        $ages = [];
        foreach ($tickets as $i => $t) {
            $type = $types[(int)$t['ticket_type_id']] ?? null;
            if (!$type) continue;
            $age = $t['age'];
            if ($details) {
                if (($t['first_name'] ?? '') === '' || $t['first_name'] === null) $errors["$prefix.$i.first_name"] = 'required';
                if ($age === null) $errors["$prefix.$i.age"] = 'required';
                elseif ($age < 0 || $age > 120) $errors["$prefix.$i.age"] = 'invalid';
                elseif ($type['min_age'] !== null && $age < (int)$type['min_age']) $errors["$prefix.$i.age"] = 'too_young';
            }
            if ($age !== null && $type['role'] === 'player') $ages[] = (int)$age;
        }
        // "Players under N must be with an adult in the same booking."
        $threshold = $event['minor_age_threshold'];
        if ($details && $threshold !== null && $ages) {
            if (min($ages) < (int)$threshold && max($ages) < (int)$event['adult_age']) $errors[$prefix] = 'minor_needs_adult';
        }
    }

    /**
     * Normalise + validate a booking request against the event rules.
     * $manual: licensee-entered booking (no consents, contact details optional).
     * Returns a clean structure; throws BookingError('validation', 422, [field => code]).
     */
    public static function validate(array $event, array $slot, array $types, array $questions, array $addons, array $in, bool $manual = false): array {
        $errors = [];
        $clean = ['tickets' => [], 'answers' => [], 'consents' => [], 'addons' => []];

        $tickets = is_array($in['tickets'] ?? null) ? array_values($in['tickets']) : [];
        if (!$tickets) $errors['tickets'] = 'required';
        if (count($tickets) > self::MAX_TICKETS) $errors['tickets'] = 'too_many';

        $details = (int)$event['require_player_details'] === 1 && !$manual;
        $perType = [];
        $players = 0;
        $needsAgeDeclaration = false;
        foreach ($tickets as $i => $t) {
            $typeId = (int)($t['ticket_type_id'] ?? 0);
            $type = $types[$typeId] ?? null;
            if (!$type || ((int)$type['active'] !== 1 && !$manual) || !array_key_exists($typeId, $slot['types'])) {
                $errors["tickets.$i.ticket_type_id"] = 'not_sold_on_slot';
                continue;
            }
            $perType[$typeId] = ($perType[$typeId] ?? 0) + 1;
            if ($type['role'] === 'player') $players++;
            $first = self::str($t['first_name'] ?? '', 80);
            $age = isset($t['age']) && $t['age'] !== '' && $t['age'] !== null ? (int)$t['age'] : null;
            if (!$details && $type['min_age'] !== null) $needsAgeDeclaration = true;
            $clean['tickets'][] = ['ticket_type_id' => $typeId, 'first_name' => $first !== '' ? $first : null, 'age' => $age];
        }
        self::validatePlayers($event, $types, $clean['tickets'], $details, $errors);
        foreach ($perType as $typeId => $n) {
            $max = $types[$typeId]['max_per_booking'];
            if ($max !== null && $n > (int)$max && !$manual) $errors["type.$typeId"] = 'max_per_booking';
        }

        if ($players > 0) {
            if (!$manual && $players < (int)$event['team_size_min']) $errors['tickets'] = 'team_too_small';
            if (!$manual && $players > (int)$event['team_size_max']) $errors['tickets'] = 'team_too_large';
            $team = self::str($in['team_name'] ?? '', 60);
            if ($team === '' && !$manual) $errors['team_name'] = 'required';
            $clean['team_name'] = $team !== '' ? $team : null;
        } else {
            $clean['team_name'] = null;
        }

        $buyer = is_array($in['buyer'] ?? null) ? $in['buyer'] : [];
        $clean['buyer'] = [
            'first_name' => self::str($buyer['first_name'] ?? '', 80),
            'last_name' => self::str($buyer['last_name'] ?? '', 80),
            'email' => strtolower(self::str($buyer['email'] ?? '', 190)),
            'phone' => self::str($buyer['phone'] ?? '', 40),
        ];
        // Online: name + phone required. Manual (licensee-entered): a contact name is enough.
        foreach (['first_name', 'last_name', 'phone'] as $k) {
            if ($clean['buyer'][$k] === '' && (!$manual || $k === 'first_name')) $errors["buyer.$k"] = 'required';
        }
        if ($clean['buyer']['email'] !== '' || !$manual) {
            if (!filter_var($clean['buyer']['email'], FILTER_VALIDATE_EMAIL)) $errors['buyer.email'] = 'invalid_email';
        }
        if ($clean['buyer']['phone'] !== '' && !preg_match('/^[0-9+().\s-]{6,40}$/', $clean['buyer']['phone'])) $errors['buyer.phone'] = 'invalid_phone';

        $clean['answers'] = self::validateAnswers($questions, is_array($in['answers'] ?? null) ? $in['answers'] : [], $errors, !$manual);

        // Add-ons: [{variant_id, qty}]
        $units = 0;
        foreach (is_array($in['addons'] ?? null) ? $in['addons'] : [] as $i => $a) {
            $vid = (int)($a['variant_id'] ?? 0);
            $qty = (int)($a['qty'] ?? 0);
            if ($qty <= 0) continue;
            $found = null;
            foreach ($addons as $ad) {
                if (isset($ad['variants'][$vid])) { $found = $ad; break; }
            }
            if (!$found || ((int)$found['active'] !== 1 && !$manual) || ((int)$found['variants'][$vid]['active'] !== 1 && !$manual)) {
                $errors["addons.$i"] = 'unknown_addon';
                continue;
            }
            $units += $qty;
            $clean['addons'][] = ['addon_id' => $found['id'], 'variant_id' => $vid, 'qty' => $qty];
        }
        $perAddon = [];
        foreach ($clean['addons'] as $a) $perAddon[$a['addon_id']] = ($perAddon[$a['addon_id']] ?? 0) + $a['qty'];
        foreach ($perAddon as $aid => $n) {
            $max = $addons[$aid]['max_per_booking'];
            if ($max !== null && $n > (int)$max && !$manual) $errors["addon.$aid"] = 'max_per_booking';
        }
        if ($units > self::MAX_ADDON_UNITS) $errors['addons'] = 'too_many';

        $consents = is_array($in['consents'] ?? null) ? $in['consents'] : [];
        if (!$manual) {
            if (empty($consents['terms'])) $errors['consents.terms'] = 'required';
            if (empty($consents['platform'])) $errors['consents.platform'] = 'required';
            if ($needsAgeDeclaration && empty($consents['age_declaration'])) $errors['consents.age_declaration'] = 'required';
        }
        $clean['consents'] = $manual ? ['manual' => true, 'at' => gmdate('c')] : [
            'terms' => true,
            'platform' => true,
            'platform_terms_version' => null, // filled by createHold
            'age_declaration' => $needsAgeDeclaration ? true : null,
            'image_rights' => (int)$event['image_rights_enabled'] === 1 ? !empty($consents['image_rights']) : null,
            'newsletter' => (int)$event['newsletter_enabled'] === 1 ? !empty($consents['newsletter']) : null,
            'at' => gmdate('c'),
        ];
        $clean['promo_code'] = strtoupper(self::str($in['promo_code'] ?? '', 40));

        if ($errors) throw new BookingError('validation', 422, $errors);
        return $clean;
    }

    /** Answers to custom questions: question id => value. */
    public static function validateAnswers(array $questions, array $answers, array &$errors, bool $enforceRequired = true): array {
        $out = [];
        foreach ($questions as $q) {
            $raw = $answers[$q['id']] ?? $answers[(string)$q['id']] ?? null;
            $val = null;
            if ($q['kind'] === 'checkbox') {
                $val = !empty($raw) ? '1' : null;
            } elseif ($q['kind'] === 'choice') {
                if ($raw !== null && $raw !== '' && ctype_digit((string)$raw) && (int)$raw < count($q['options_i18n'])) $val = (string)(int)$raw;
            } else {
                $s = mb_substr(trim((string)$raw), 0, 1000);
                $val = $s !== '' ? $s : null;
            }
            if ($enforceRequired && $q['required'] && $val === null) $errors["answers.{$q['id']}"] = 'required';
            if ($val !== null) $out[$q['id']] = $val;
        }
        return $out;
    }

    // ── Pricing (shared by quote and hold) ───────────────────────────────

    private static function reference($db): string {
        for ($i = 0; $i < 10; $i++) {
            $ref = 'TH-';
            for ($j = 0; $j < 6; $j++) $ref .= self::REF_ALPHABET[random_int(0, strlen(self::REF_ALPHABET) - 1)];
            if (!$db->fetch('SELECT id FROM bookings WHERE reference = ?', [$ref])) return $ref;
        }
        throw new RuntimeException('could not allocate a booking reference');
    }

    /**
     * Price tickets + add-ons + promo + fee.
     * @param array $ticketTypeIds [type_id, ...] in booking order
     * @param array $addonReq [['addon_id', 'variant_id', 'qty'], ...]
     * @param ?array $promo a usable promo row (already checked) or null
     * @return array ['tickets' => priced, 'addons' => priced, 'totals' => ..., 'lines' => display lines]
     */
    public static function price($db, array $event, array $types, array $addons, array $ticketTypeIds, array $addonReq, ?array $promo, array $commission, string $lang): array {
        $tickets = EventsPricing::priceTickets($types, EventsRepo::takenByType($db, (int)$event['id']), $ticketTypeIds, time());
        $addonLines = [];
        $addonsCents = 0;
        foreach ($addonReq as $a) {
            $ad = $addons[$a['addon_id']];
            $v = $ad['variants'][$a['variant_id']];
            $label = EventsRepo::tr($ad['label_i18n'], $lang, $event['main_language']);
            $vl = EventsRepo::tr($v['label_i18n'], $lang, $event['main_language']);
            $addonLines[] = $a + ['unit_price_cents' => $v['unit_price_cents'], 'amount_cents' => $v['unit_price_cents'] * $a['qty'],
                'label' => $vl !== '' ? "$label ($vl)" : $label, 'vat_bp' => $ad['vat_bp'] !== null ? (int)$ad['vat_bp'] : null];
            $addonsCents += $v['unit_price_cents'] * $a['qty'];
        }
        $ticketsCents = array_sum(array_column($tickets, 'unit_price_cents'));
        $discount = $promo ? EventsPricing::promoDiscount($promo['kind'], (int)$promo['value'], $ticketsCents + $addonsCents) : 0;
        $totals = EventsPricing::totals($tickets, $addonsCents, $discount, $commission['bp'], $commission['fixed_cents']);

        $lines = [];
        foreach (EventsPricing::lines($tickets) as $l) {
            $l['label'] = EventsRepo::tr($types[$l['ticket_type_id']]['label_i18n'], $lang, $event['main_language']);
            $l['kind'] = 'ticket';
            $lines[] = $l;
        }
        foreach ($addonLines as $l) {
            $lines[] = ['kind' => 'addon', 'variant_id' => $l['variant_id'], 'unit_price_cents' => $l['unit_price_cents'], 'quantity' => $l['qty'], 'amount_cents' => $l['amount_cents'], 'label' => $l['label']];
        }
        return ['tickets' => $tickets, 'addons' => $addonLines, 'totals' => $totals, 'lines' => $lines];
    }

    public static function client($db, int $clientId): array {
        $c = $db->fetch(
            'SELECT id, email, name, company, legal_name, legal_email, siret, vat_number, vat_regime, vat_default_bp,
                    address_line1, address_line2, postal_code, city, country, public_phone,
                    events_commission_bp, events_commission_fixed_cents
               FROM clients WHERE id = ?',
            [$clientId]
        );
        if (!$c) throw new BookingError('unknown_client', 404);
        return $c;
    }

    /**
     * Price a request without holding anything (public "quote"). Returns the
     * summary plus `promo` = {code, error|null} when a code was given.
     */
    public static function quote($db, array $event, int $slotId, array $requestedTypeIds, array $addonReq, string $promoCode, string $lang): array {
        $slots = EventsRepo::slots($db, (int)$event['id']);
        $slot = $slots[$slotId] ?? null;
        if (!$slot) throw new BookingError('unknown_slot', 404);
        $types = EventsRepo::ticketTypes($db, (int)$event['id']);
        foreach ($requestedTypeIds as $id) {
            if (!isset($types[(int)$id]) || !array_key_exists((int)$id, $slot['types'])) throw new BookingError('not_sold_on_slot');
        }
        $addons = EventsRepo::addons($db, (int)$event['id'], true);
        $req = [];
        foreach ($addonReq as $a) {
            $vid = (int)($a['variant_id'] ?? 0);
            $qty = max(0, min(self::MAX_ADDON_UNITS, (int)($a['qty'] ?? 0)));
            foreach ($addons as $ad) {
                if (isset($ad['variants'][$vid]) && $qty > 0) $req[] = ['addon_id' => $ad['id'], 'variant_id' => $vid, 'qty' => $qty];
            }
        }
        $promo = null;
        $promoOut = null;
        $promoCode = strtoupper(trim($promoCode));
        if ($promoCode !== '') {
            $row = EventsRepo::promoByCode($db, (int)$event['id'], $promoCode);
            $err = EventsRepo::promoError($db, $row);
            if (!$err) $promo = $row;
            $promoOut = ['code' => $promoCode, 'error' => $err];
        }
        $client = self::client($db, (int)$event['client_id']);
        $p = self::price($db, $event, $types, $addons, array_map('intval', $requestedTypeIds), $req, $promo, EventsSettings::commissionFor($db, $client), $lang);
        return ['lines' => $p['lines'], 'currency' => $event['currency'], 'promo' => $promoOut] + $p['totals'];
    }

    // ── Hold ─────────────────────────────────────────────────────────────

    /**
     * Validate, lock, check capacity / stock / promo, price and insert a booking.
     * A paid online booking is 'pending' with a hold; a free one, or a manual one
     * entered by the licensee, is confirmed immediately.
     *
     * $opts (manual bookings): manual => true, source => manual_onsite|manual_invoice|manual_free,
     *   paid => bool (offline money already received), actor_id => int, notes => ?string
     * @return array the inserted booking row
     */
    public static function createHold($db, array $event, array $in, string $lang, array $opts = []): array {
        $manual = !empty($opts['manual']);
        $eventId = (int)$event['id'];
        if ($manual) {
            if ($event['status'] === 'archived' || !empty($event['cancelled_at'])) throw new BookingError('event_closed', 409);
            if (!EventsSettings::clientEnabled($db, (int)$event['client_id'])) throw new BookingError('events_disabled', 403);
        } else {
            if ($event['status'] !== 'published' || !empty($event['cancelled_at'])) throw new BookingError('event_closed', 409);
            if ((int)$event['sales_paused'] === 1) throw new BookingError('sales_paused', 409);
            $gate = EventsSettings::salesGateReason($db, (int)$event['client_id'], false);
            if ($gate) throw new BookingError($gate, 409);
        }

        $slotId = (int)($in['slot_id'] ?? 0);
        $client = self::client($db, (int)$event['client_id']);
        $com = $manual ? ['bp' => 0, 'fixed_cents' => 0] : EventsSettings::commissionFor($db, $client);
        $exempt = ($client['vat_regime'] ?? 'subject') === 'exempt';
        $defaultVat = $exempt ? 0 : (int)$client['vat_default_bp'];
        $termsVersion = EventsSettings::get($db, 'platform_terms_version', '');

        $db->begin();
        try {
            // Lock order: event, slot, promo, then add-on variants.
            $db->fetch('SELECT id FROM events WHERE id = ? FOR UPDATE', [$eventId]);
            $slotRow = $db->fetch('SELECT * FROM event_slots WHERE id = ? AND event_id = ? FOR UPDATE', [$slotId, $eventId]);
            if (!$slotRow) throw new BookingError('unknown_slot', 404);
            $slot = EventsRepo::slots($db, $eventId)[$slotId];
            if ($manual ? $slot['status'] === 'cancelled' : !EventsRepo::slotOnSale($event, $slot, time())) throw new BookingError('slot_closed', 409);

            $types = EventsRepo::ticketTypes($db, $eventId);
            $questions = EventsRepo::questions($db, $eventId);
            $addons = EventsRepo::addons($db, $eventId);
            $clean = self::validate($event, $slot, $types, $questions, $addons, $in, $manual);
            if (!$manual) $clean['consents']['platform_terms_version'] = $termsVersion;

            // Capacity: slot total, then per-type caps.
            $taken = EventsRepo::takenBySlot($db, $eventId)[$slotId] ?? ['total' => 0, 'by_type' => []];
            $want = count($clean['tickets']);
            if ($taken['total'] + $want > $slot['capacity']) {
                throw new BookingError('sold_out', 409, ['remaining' => max(0, $slot['capacity'] - $taken['total'])]);
            }
            $wantByType = [];
            foreach ($clean['tickets'] as $t) $wantByType[$t['ticket_type_id']] = ($wantByType[$t['ticket_type_id']] ?? 0) + 1;
            foreach ($wantByType as $typeId => $n) {
                $cap = EventsRepo::typeCap($slot, $types[$typeId]);
                if ($cap !== null && ($taken['by_type'][$typeId] ?? 0) + $n > $cap) {
                    throw new BookingError('type_sold_out', 409, ['ticket_type_id' => $typeId, 'remaining' => max(0, $cap - ($taken['by_type'][$typeId] ?? 0))]);
                }
            }

            // Promo (locked: max uses).
            $promo = null;
            if ($clean['promo_code'] !== '' && !$manual) {
                $promo = EventsRepo::promoByCode($db, $eventId, $clean['promo_code'], true);
                if ($err = EventsRepo::promoError($db, $promo)) throw new BookingError('validation', 422, ['promo_code' => $err]);
            }

            // Add-on stock (locked).
            if ($clean['addons']) {
                $vids = implode(',', array_map('intval', array_column($clean['addons'], 'variant_id')));
                $db->fetchAll("SELECT id FROM event_addon_variants WHERE id IN ($vids) ORDER BY id FOR UPDATE");
                $stockTaken = EventsRepo::addonTaken($db, $eventId);
                $wantV = [];
                foreach ($clean['addons'] as $a) $wantV[$a['variant_id']] = ($wantV[$a['variant_id']] ?? 0) + $a['qty'];
                foreach ($wantV as $vid => $n) {
                    foreach ($addons as $ad) {
                        if (!isset($ad['variants'][$vid])) continue;
                        $stock = $ad['variants'][$vid]['stock'];
                        if ($stock !== null && ($stockTaken[$vid] ?? 0) + $n > (int)$stock) {
                            throw new BookingError('addon_sold_out', 409, ['variant_id' => $vid, 'remaining' => max(0, (int)$stock - ($stockTaken[$vid] ?? 0))]);
                        }
                    }
                }
            }

            $p = self::price($db, $event, $types, $addons, array_column($clean['tickets'], 'ticket_type_id'), $clean['addons'], $promo, $com, $lang);
            $totals = $p['totals'];
            if (!$manual && ($err = EventsPricing::chargeError($totals['total_cents']))) throw new BookingError($err);

            $paid = !$manual && $totals['total_cents'] > 0;
            if ($paid && ($g = EventsSettings::salesGateReason($db, (int)$event['client_id'], true))) throw new BookingError($g, 409);
            $acct = $paid ? StripeConnect::row($db, (int)$event['client_id']) : null;

            if ($manual) {
                $source = in_array($opts['source'] ?? '', self::MANUAL_SOURCES, true) ? $opts['source'] : 'manual_onsite';
                $paymentStatus = $source === 'manual_free' || $totals['total_cents'] === 0 ? 'free' : (!empty($opts['paid']) ? 'offline_paid' : 'offline_due');
                $status = 'confirmed';
            } else {
                $source = 'online';
                $paymentStatus = $paid ? 'none' : 'free';
                $status = $paid ? 'pending' : 'confirmed';
            }
            $uuid = EventsRepo::uuid();
            $vatSnapshot = ['regime' => $exempt ? 'exempt' : 'subject', 'default_bp' => $defaultVat, 'fee_bp' => $defaultVat];
            $db->query(
                'INSERT INTO bookings (uuid, reference, event_id, slot_id, client_id, status, payment_status, source, language,
                    team_name, buyer_first_name, buyer_last_name, buyer_email, buyer_phone, consents,
                    subtotal_cents, discount_cents, promo_code_id, booking_fee_cents, total_cents, currency,
                    commission_bp_snapshot, commission_fixed_snapshot, vat_snapshot, stripe_account_id,
                    expires_at, paid_at, token_nonce, created_by_user_id, internal_notes)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '
                    . ($paid ? 'UTC_TIMESTAMP() + INTERVAL ' . self::HOLD_MINUTES . ' MINUTE' : 'NULL') . ', '
                    . (in_array($paymentStatus, ['free', 'offline_paid'], true) ? 'UTC_TIMESTAMP()' : 'NULL') . ', ?, ?, ?)',
                [
                    $uuid, self::reference($db), $eventId, $slotId, (int)$event['client_id'],
                    $status, $paymentStatus, $source, $lang,
                    $clean['team_name'], $clean['buyer']['first_name'], $clean['buyer']['last_name'] ?: null,
                    $clean['buyer']['email'] ?: null, $clean['buyer']['phone'] ?: null, json_encode($clean['consents']),
                    $totals['subtotal_cents'], $totals['discount_cents'], $promo['id'] ?? null, $totals['booking_fee_cents'], $totals['total_cents'],
                    $event['currency'], $com['bp'], $com['fixed_cents'], json_encode($vatSnapshot),
                    $acct['stripe_account_id'] ?? null, EventsTokens::nonce(), $manual ? ($opts['actor_id'] ?? null) : null,
                    $manual && !empty($opts['notes']) ? mb_substr((string)$opts['notes'], 0, 2000) : null,
                ]
            );
            $bookingId = (int)$db->lastInsertId();
            foreach ($clean['tickets'] as $i => $t) {
                $type = $types[$t['ticket_type_id']];
                $db->query(
                    'INSERT INTO booking_tickets (booking_id, ticket_type_id, role, label_snapshot, unit_price_cents, vat_bp,
                        price_step_id, participant_first_name, participant_age, position)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        $bookingId, $t['ticket_type_id'], $type['role'],
                        mb_substr(EventsRepo::tr($type['label_i18n'], $event['main_language']), 0, 190),
                        $p['tickets'][$i]['unit_price_cents'], $exempt ? 0 : ($type['vat_bp'] !== null ? (int)$type['vat_bp'] : $defaultVat),
                        $p['tickets'][$i]['step_id'], $t['first_name'], $t['age'], $i,
                    ]
                );
            }
            foreach ($p['addons'] as $a) {
                $db->query(
                    'INSERT INTO booking_addons (booking_id, addon_id, variant_id, qty, unit_price_cents, vat_bp, label_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$bookingId, $a['addon_id'], $a['variant_id'], $a['qty'], $a['unit_price_cents'],
                     $exempt ? 0 : ($a['vat_bp'] ?? $defaultVat), mb_substr($a['label'], 0, 190)]
                );
            }
            foreach ($clean['answers'] as $qid => $val) {
                $db->query('INSERT INTO booking_answers (booking_id, question_id, value) VALUES (?, ?, ?)', [$bookingId, $qid, $val]);
            }
            self::log($db, $bookingId, $manual ? 'manual_created' : ($paid ? 'hold_created' : 'confirmed_free'),
                $manual ? 'licensee' : 'buyer', $manual ? ($opts['actor_id'] ?? null) : null,
                ['total' => $totals['total_cents'], 'promo' => $promo['code'] ?? null, 'source' => $source]);
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
        return $db->fetch('SELECT * FROM bookings WHERE id = ?', [$bookingId]);
    }

    // ── Stripe Checkout ──────────────────────────────────────────────────

    /**
     * Charged lines of a booking, discount already spread (Stripe has no negative
     * lines). Each group is one line "N × label" with its NET amount.
     * @return array [['name', 'amount_cents'], ...] excluding the booking fee
     */
    public static function chargeLines($db, array $booking, array $event, string $lang): array {
        $types = EventsRepo::ticketTypes($db, (int)$event['id']);
        $groups = [];
        foreach ($db->fetchAll(
            'SELECT ticket_type_id, label_snapshot, unit_price_cents, COUNT(*) AS q FROM booking_tickets WHERE booking_id = ?
              GROUP BY ticket_type_id, label_snapshot, unit_price_cents ORDER BY MIN(position)', [$booking['id']]) as $r) {
            if ((int)$r['unit_price_cents'] <= 0) continue;
            $type = $types[(int)$r['ticket_type_id']] ?? null;
            $label = $type ? EventsRepo::tr($type['label_i18n'], $lang, $event['main_language']) : $r['label_snapshot'];
            $groups[] = ['name' => $r['q'] . ' × ' . $label, 'amount_cents' => (int)$r['unit_price_cents'] * (int)$r['q']];
        }
        foreach ($db->fetchAll('SELECT label_snapshot, unit_price_cents, qty FROM booking_addons WHERE booking_id = ? ORDER BY id', [$booking['id']]) as $r) {
            if ((int)$r['unit_price_cents'] <= 0) continue;
            $groups[] = ['name' => $r['qty'] . ' × ' . $r['label_snapshot'], 'amount_cents' => (int)$r['unit_price_cents'] * (int)$r['qty']];
        }
        $net = EventsPricing::spread(array_column($groups, 'amount_cents'), (int)$booking['discount_cents']);
        $out = [];
        foreach ($groups as $i => $g) {
            if ($net[$i] > 0) $out[] = ['name' => $g['name'], 'amount_cents' => $net[$i]];
        }
        return $out;
    }

    /** Create the Checkout Session on the licensee's account; returns its URL. */
    public static function startCheckout($db, array $booking, array $event, string $lang, string $title): string {
        $stripe = StripeConnect::client();
        if (!$stripe || empty($booking['stripe_account_id'])) throw new BookingError('payments_unavailable', 409);

        $cur = strtolower($event['currency']);
        $lines = [];
        foreach (self::chargeLines($db, $booking, $event, $lang) as $l) {
            $lines[] = ['price_data' => ['currency' => $cur, 'unit_amount' => $l['amount_cents'],
                'product_data' => ['name' => mb_substr("$title – {$l['name']}", 0, 250)]], 'quantity' => 1];
        }
        if ((int)$booking['booking_fee_cents'] > 0) {
            $lines[] = ['price_data' => ['currency' => $cur, 'unit_amount' => (int)$booking['booking_fee_cents'],
                'product_data' => ['name' => EventsEmails::str($lang, 'booking_fee')]], 'quantity' => 1];
        }

        $base = PaymentsConfig::eventsPublicBase();
        $returnToken = EventsTokens::make(EventsTokens::RETURN, $booking['uuid'], $booking['token_nonce']);
        $session = $stripe->checkout->sessions->create([
            'mode' => 'payment',
            'payment_method_types' => ['card'],
            'line_items' => $lines,
            'customer_email' => $booking['buyer_email'],
            'client_reference_id' => $booking['uuid'],
            'locale' => in_array($lang, ['fr', 'en', 'es'], true) ? $lang : 'auto',
            'expires_at' => time() + self::CHECKOUT_MINUTES * 60,
            'metadata' => ['booking_uuid' => $booking['uuid'], 'reference' => $booking['reference'], 'event_id' => (string)$event['id']],
            'payment_intent_data' => [
                'application_fee_amount' => (int)$booking['booking_fee_cents'],
                'description' => mb_substr("$title – {$booking['reference']}", 0, 250),
                'metadata' => ['booking_uuid' => $booking['uuid'], 'reference' => $booking['reference']],
            ],
            'success_url' => $base . '/booking/return?b=' . rawurlencode($returnToken) . '&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url' => $base . '/' . rawurlencode($event['slug']) . '/book?slot=' . (int)$booking['slot_id'] . '&cancelled=' . rawurlencode($returnToken),
        ], ['stripe_account' => $booking['stripe_account_id'], 'idempotency_key' => 'cs-' . $booking['uuid']]);

        $db->query('UPDATE bookings SET stripe_checkout_session_id = ? WHERE id = ?', [$session->id, $booking['id']]);
        return $session->url;
    }

    /**
     * Payment confirmed by Stripe (webhook, return page or cron). Idempotent.
     * $session: Checkout Session (object). Returns the booking status after.
     */
    public static function fulfil($db, string $uuid, $session, string $actor): string {
        if (($session->payment_status ?? '') !== 'paid') return 'unpaid';
        $soldOut = false;
        $db->begin();
        try {
            $b = $db->fetch('SELECT * FROM bookings WHERE uuid = ? FOR UPDATE', [$uuid]);
            if (!$b) {
                $db->rollBack();
                return 'unknown';
            }
            if ($b['status'] === 'confirmed' || $b['status'] === 'cancelled') {
                $db->commit();
                return $b['status'];
            }
            if ($b['status'] === 'expired') {
                // Paid after the hold lapsed: the places may have been sold since.
                $db->fetch('SELECT id FROM events WHERE id = ? FOR UPDATE', [$b['event_id']]);
                $slot = $db->fetch('SELECT capacity FROM event_slots WHERE id = ? FOR UPDATE', [$b['slot_id']]);
                $mine = (int)$db->fetch('SELECT COUNT(*) n FROM booking_tickets WHERE booking_id = ?', [$b['id']])['n'];
                $taken = EventsRepo::takenBySlot($db, (int)$b['event_id'])[(int)$b['slot_id']]['total'] ?? 0;
                $soldOut = $taken + $mine > (int)$slot['capacity'];
            }
            if ($soldOut) {
                $db->query(
                    "UPDATE bookings SET status = 'cancelled', payment_status = 'paid', cancelled_at = UTC_TIMESTAMP(),
                        cancel_reason = 'sold_out_after_expiry', paid_at = UTC_TIMESTAMP(), stripe_payment_intent_id = ?
                      WHERE id = ?",
                    [$session->payment_intent ?? null, $b['id']]
                );
            } else {
                $db->query(
                    "UPDATE bookings SET status = 'confirmed', payment_status = 'paid', paid_at = UTC_TIMESTAMP(),
                        expires_at = NULL, stripe_payment_intent_id = ?, stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, ?)
                      WHERE id = ?",
                    [$session->payment_intent ?? null, $session->id ?? null, $b['id']]
                );
            }
            self::log($db, (int)$b['id'], $soldOut ? 'paid_after_sold_out' : 'paid', $actor, null, ['session' => $session->id ?? null]);
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }

        if ($soldOut) {
            // Full refund including our fee; the buyer is told why.
            try {
                $b = $db->fetch('SELECT * FROM bookings WHERE id = ?', [$b['id']]);
                EventsBackoffice::stripeRefund($db, $b, (int)$b['total_cents'], true, 'sold_out_after_expiry', 'system', null);
            } catch (Throwable $e) {
                error_log('[EventsBooking] sold-out refund failed for ' . $b['uuid'] . ': ' . $e->getMessage());
            }
            EventsEmails::queue($db, 'sold_out_refund', (int)$b['id']);
            return 'cancelled';
        }
        EventsEmails::queueConfirmation($db, (int)$b['id']);
        return 'confirmed';
    }

    /** Release a pending hold (Checkout expired / abandoned). */
    public static function expire($db, int $bookingId, string $actor, string $why): bool {
        $n = $db->query("UPDATE bookings SET status = 'expired' WHERE id = ? AND status = 'pending'", [$bookingId])->rowCount();
        if ($n) self::log($db, $bookingId, 'expired', $actor, null, ['why' => $why]);
        return $n > 0;
    }

    public static function log($db, int $bookingId, string $type, ?string $actorType, ?int $actorId, array $data = []): void {
        $db->query(
            'INSERT INTO booking_log (booking_id, type, actor_type, actor_id, data) VALUES (?, ?, ?, ?, ?)',
            [$bookingId, $type, $actorType, $actorId, $data ? json_encode($data, JSON_UNESCAPED_UNICODE) : null]
        );
        // Playground caches today's bookings: any change must reach it.
        if ($type !== 'hold_created' && $type !== 'expired') EventsCheckin::bumpForBooking($db, $bookingId);
    }
}

require_once __DIR__ . '/EventsEmails.php';
require_once __DIR__ . '/EventsBackoffice.php';
require_once __DIR__ . '/EventsCheckin.php';
