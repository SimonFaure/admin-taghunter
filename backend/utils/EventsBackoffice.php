<?php
/**
 * Events back-office (phase 3): refunds, cancellations, slot / event
 * cancellation jobs, booking edits (licensee + buyer), Stripe refund / dispute
 * sync, reminders and GDPR anonymisation.
 *
 * Money rules (decision 8):
 *  - A licensee refund never gives back Taghunter's booking fee
 *    (refund_application_fee = false); max = paid - fee - already refunded.
 *  - Cancelling a whole slot / event refunds EVERYTHING incl. the fee
 *    (refund_application_fee = true).
 */
require_once __DIR__ . '/EventsRepo.php';
require_once __DIR__ . '/EventsPricing.php';
require_once __DIR__ . '/StripeConnect.php';
require_once __DIR__ . '/EventsBooking.php';
require_once __DIR__ . '/EventsEmails.php';

class EventsBackoffice {
    const JOB_BATCH = 20;

    // ── Refunds ──────────────────────────────────────────────────────────

    /** What the licensee can still give back (fee excluded). */
    public static function licenseeRefundable(array $b): int {
        if (!in_array($b['payment_status'], ['paid', 'partially_refunded'], true)) return 0;
        $paidWithoutFee = (int)$b['total_cents'] - (int)$b['booking_fee_cents'];
        $refundedWithoutFee = (int)$b['refunded_cents'] - (int)$b['fee_refunded_cents'];
        return max(0, $paidWithoutFee - $refundedWithoutFee);
    }

    /** Everything still on the buyer's card (fee included). */
    public static function totalRefundable(array $b): int {
        if (!in_array($b['payment_status'], ['paid', 'partially_refunded'], true)) return 0;
        return max(0, (int)$b['total_cents'] - (int)$b['refunded_cents']);
    }

    /**
     * Refund on the licensee's Stripe account and record it.
     * $withFee: also give back Taghunter's fee (Stripe takes it back pro rata).
     */
    public static function stripeRefund($db, array $b, int $amount, bool $withFee, string $reason, string $initiatedBy, ?int $actorId): array {
        if ($amount <= 0) throw new BookingError('nothing_to_refund', 409);
        if (empty($b['stripe_payment_intent_id']) || empty($b['stripe_account_id'])) throw new BookingError('not_refundable_online', 409);
        $stripe = StripeConnect::client();
        if (!$stripe) throw new BookingError('payments_unavailable', 503);

        $seq = (int)$db->fetch('SELECT COUNT(*) n FROM booking_refunds WHERE booking_id = ?', [$b['id']])['n'] + 1;
        $refund = $stripe->refunds->create([
            'payment_intent' => $b['stripe_payment_intent_id'],
            'amount' => $amount,
            'refund_application_fee' => $withFee,
            'metadata' => ['booking_uuid' => $b['uuid'], 'reference' => $b['reference'], 'reason' => mb_substr($reason, 0, 200)],
        ], ['stripe_account' => $b['stripe_account_id'], 'idempotency_key' => "rf-{$b['uuid']}-$seq-$amount"]);

        // Stripe refunds the application fee in proportion to the amount refunded.
        $feePart = $withFee && (int)$b['total_cents'] > 0
            ? min((int)$b['booking_fee_cents'] - (int)$b['fee_refunded_cents'], EventsPricing::roundDiv((int)$b['booking_fee_cents'] * $amount, (int)$b['total_cents']))
            : 0;
        self::recordRefund($db, (int)$b['id'], $refund->id, $amount, max(0, $feePart), $reason, $initiatedBy, $actorId, $refund->status ?? 'succeeded');
        return ['refund_id' => $refund->id, 'amount_cents' => $amount, 'fee_refunded_cents' => $feePart];
    }

    /** Insert a refund row (idempotent on the Stripe id) and update the booking totals. */
    public static function recordRefund($db, int $bookingId, ?string $stripeId, int $amount, int $feePart, string $reason, string $initiatedBy, ?int $actorId, string $status = 'succeeded'): void {
        if ($stripeId && $db->fetch('SELECT id FROM booking_refunds WHERE stripe_refund_id = ?', [$stripeId])) return;
        $db->query(
            'INSERT INTO booking_refunds (booking_id, stripe_refund_id, amount_cents, fee_refunded_cents, reason, initiated_by, status, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$bookingId, $stripeId, $amount, $feePart, mb_substr($reason, 0, 255), $initiatedBy, $status, $actorId]
        );
        $db->query(
            "UPDATE bookings SET refunded_cents = refunded_cents + ?, fee_refunded_cents = fee_refunded_cents + ?,
                payment_status = IF(refunded_cents >= total_cents, 'refunded', 'partially_refunded')
              WHERE id = ?",
            [$amount, $feePart, $bookingId]
        );
        EventsBooking::log($db, $bookingId, 'refund', $initiatedBy, $actorId, ['amount' => $amount, 'fee' => $feePart, 'stripe' => $stripeId, 'reason' => $reason]);
    }

    /** Licensee refund from Studio (full or partial, fee never included). */
    public static function licenseeRefund($db, array $b, int $amount, string $reason, string $actorType, ?int $actorId, bool $notify = true): array {
        $max = self::licenseeRefundable($b);
        if ($amount <= 0 || $amount > $max) throw new BookingError('invalid_amount', 422, ['max_cents' => $max]);
        $res = self::stripeRefund($db, $b, $amount, false, $reason, $actorType, $actorId);
        if ($notify && $b['buyer_email']) EventsEmails::queue($db, 'refund_notice', (int)$b['id']);
        return $res;
    }

    // ── Cancellation ─────────────────────────────────────────────────────

    /**
     * Cancel one booking. $refund: give back what was paid online (fee kept,
     * unless $withFee for a slot / event cancellation). Places are freed.
     */
    public static function cancel($db, array $b, bool $refund, bool $withFee, string $reason, bool $notify, string $actorType, ?int $actorId): array {
        if ($b['status'] === 'cancelled') return ['already' => true];
        $refunded = 0;
        if ($b['status'] === 'pending') {
            if ($b['stripe_checkout_session_id'] && PaymentsConfig::stripeConfigured()) {
                try {
                    StripeConnect::client()->checkout->sessions->expire($b['stripe_checkout_session_id'], [], ['stripe_account' => $b['stripe_account_id']]);
                } catch (Throwable $e) { /* already completed or expired */ }
            }
        } elseif ($refund && $b['source'] === 'online') {
            $amount = $withFee ? self::totalRefundable($b) : self::licenseeRefundable($b);
            if ($amount > 0) {
                self::stripeRefund($db, $b, $amount, $withFee, $reason ?: 'cancelled', $withFee ? 'cancellation' : $actorType, $actorId);
                $refunded = $amount;
            }
        }
        $db->query(
            "UPDATE bookings SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP(), cancel_reason = ?, expires_at = NULL WHERE id = ?",
            [mb_substr($reason ?: 'cancelled', 0, 255), $b['id']]
        );
        EventsBooking::log($db, (int)$b['id'], 'cancelled', $actorType, $actorId, ['reason' => $reason, 'refunded' => $refunded]);
        if ($notify && $b['buyer_email'] && $b['status'] === 'confirmed') EventsEmails::queue($db, 'cancellation_notice', (int)$b['id']);
        return ['refunded_cents' => $refunded];
    }

    /** Start cancelling a slot or a whole event: sales stop now, refunds run in batches. */
    public static function startCancelJob($db, array $event, ?int $slotId, string $reason, string $actorType, ?int $actorId): int {
        if ($slotId) {
            $db->query("UPDATE event_slots SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP() WHERE id = ? AND event_id = ?", [$slotId, $event['id']]);
        } else {
            $db->query("UPDATE events SET cancelled_at = UTC_TIMESTAMP(), sales_paused = 1 WHERE id = ?", [$event['id']]);
            $db->query("UPDATE event_slots SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, UTC_TIMESTAMP()) WHERE event_id = ?", [$event['id']]);
        }
        EventsRepo::refreshSlotCache($db, (int)$event['id']);
        $total = (int)$db->fetch(
            "SELECT COUNT(*) n FROM bookings WHERE event_id = ? AND status IN ('confirmed','pending')" . ($slotId ? ' AND slot_id = ' . (int)$slotId : ''),
            [$event['id']]
        )['n'];
        $db->query(
            'INSERT INTO event_jobs (kind, event_id, ref_id, status, progress, reason, created_by_type, created_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$slotId ? 'cancel_slot' : 'cancel_event', $event['id'], $slotId, 'queued', json_encode(['total' => $total, 'done' => 0, 'failed' => 0, 'refunded_cents' => 0]),
             mb_substr($reason, 0, 255), $actorType, $actorId]
        );
        return (int)$db->lastInsertId();
    }

    /** Process up to $limit bookings of a job. Returns the job row after. */
    public static function processJob($db, int $jobId, int $limit = self::JOB_BATCH): array {
        $job = $db->fetch('SELECT * FROM event_jobs WHERE id = ?', [$jobId]);
        if (!$job || in_array($job['status'], ['done', 'error'], true)) return $job ?: [];
        $db->query("UPDATE event_jobs SET status = 'running' WHERE id = ?", [$jobId]);
        $progress = json_decode($job['progress'] ?? '{}', true) ?: ['total' => 0, 'done' => 0, 'failed' => 0, 'refunded_cents' => 0];
        $failedIds = $progress['failed_ids'] ?? [];
        $rows = $db->fetchAll(
            "SELECT * FROM bookings WHERE event_id = ? AND status IN ('confirmed','pending')"
            . ($job['ref_id'] ? ' AND slot_id = ' . (int)$job['ref_id'] : '')
            . ($failedIds ? ' AND id NOT IN (' . implode(',', array_map('intval', $failedIds)) . ')' : '')
            . ' ORDER BY id LIMIT ' . (int)$limit,
            [$job['event_id']]
        );
        foreach ($rows as $b) {
            try {
                $r = self::cancel($db, $b, true, true, $job['reason'] ?: ($job['kind'] === 'cancel_slot' ? 'slot_cancelled' : 'event_cancelled'),
                    true, $job['created_by_type'] ?: 'licensee', $job['created_by_id'] !== null ? (int)$job['created_by_id'] : null);
                $progress['done']++;
                $progress['refunded_cents'] += $r['refunded_cents'] ?? 0;
            } catch (Throwable $e) {
                $progress['failed']++;
                $failedIds[] = (int)$b['id'];
                $progress['last_error'] = mb_substr($e->getMessage(), 0, 300);
                error_log('[EventsBackoffice] job ' . $jobId . ' booking ' . $b['id'] . ': ' . $e->getMessage());
            }
        }
        $progress['failed_ids'] = $failedIds;
        $left = (int)$db->fetch(
            "SELECT COUNT(*) n FROM bookings WHERE event_id = ? AND status IN ('confirmed','pending')" . ($job['ref_id'] ? ' AND slot_id = ' . (int)$job['ref_id'] : ''),
            [$job['event_id']]
        )['n'];
        $status = $left - count($failedIds) <= 0 ? ($failedIds ? 'error' : 'done') : 'running';
        $db->query('UPDATE event_jobs SET status = ?, progress = ? WHERE id = ?', [$status, json_encode($progress), $jobId]);
        return $db->fetch('SELECT * FROM event_jobs WHERE id = ?', [$jobId]);
    }

    /** Cron: advance every unfinished job. */
    public static function processJobs($db): array {
        $out = [];
        foreach ($db->fetchAll("SELECT id FROM event_jobs WHERE status IN ('queued','running') ORDER BY id LIMIT 10") as $j) {
            $r = self::processJob($db, (int)$j['id']);
            $out[$j['id']] = $r['status'] ?? null;
        }
        return $out;
    }

    // ── Edits ────────────────────────────────────────────────────────────

    /**
     * Update names / ages / team / answers. $byBuyer: rules enforced as at
     * booking time, and only until the sales cut-off.
     */
    public static function updateDetails($db, array $b, array $data, bool $byBuyer, string $actorType, ?int $actorId): void {
        $event = EventsRepo::eventById($db, (int)$b['event_id']);
        if ($byBuyer) {
            $slot = $db->fetch('SELECT starts_at FROM event_slots WHERE id = ?', [$b['slot_id']]);
            if ($b['status'] !== 'confirmed') throw new BookingError('not_editable', 409);
            if (time() >= strtotime($slot['starts_at'] . ' UTC') - (int)$event['sales_cutoff_minutes'] * 60) throw new BookingError('edit_closed', 409);
        }
        $types = EventsRepo::ticketTypes($db, (int)$event['id']);
        $rows = $db->fetchAll('SELECT * FROM booking_tickets WHERE booking_id = ? ORDER BY position', [$b['id']]);
        $errors = [];
        $tickets = [];
        $in = is_array($data['tickets'] ?? null) ? array_values($data['tickets']) : null;
        foreach ($rows as $i => $r) {
            $t = $in[$i] ?? null;
            $first = $t !== null && array_key_exists('first_name', $t) ? mb_substr(trim((string)$t['first_name']), 0, 80) : $r['participant_first_name'];
            $age = $t !== null && array_key_exists('age', $t) ? (($t['age'] === '' || $t['age'] === null) ? null : (int)$t['age']) : ($r['participant_age'] !== null ? (int)$r['participant_age'] : null);
            $tickets[] = ['id' => (int)$r['id'], 'ticket_type_id' => (int)$r['ticket_type_id'], 'first_name' => $first === '' ? null : $first, 'age' => $age];
        }
        EventsBooking::validatePlayers($event, $types, $tickets, $byBuyer && (int)$event['require_player_details'] === 1, $errors);

        $team = array_key_exists('team_name', $data) ? mb_substr(trim((string)$data['team_name']), 0, 60) : $b['team_name'];
        $hasPlayers = (bool)array_filter($rows, fn($r) => $r['role'] === 'player');
        if ($byBuyer && $hasPlayers && ($team === '' || $team === null)) $errors['team_name'] = 'required';

        $answers = null;
        if (array_key_exists('answers', $data) && is_array($data['answers'])) {
            $answers = EventsBooking::validateAnswers(EventsRepo::questions($db, (int)$event['id']), $data['answers'], $errors, $byBuyer);
        }
        $buyer = null;
        if (!$byBuyer && is_array($data['buyer'] ?? null)) {
            $bu = $data['buyer'];
            $buyer = [];
            foreach (['first_name' => 80, 'last_name' => 80, 'phone' => 40] as $k => $max) {
                if (array_key_exists($k, $bu)) $buyer["buyer_$k"] = mb_substr(trim((string)$bu[$k]), 0, $max) ?: null;
            }
            if (array_key_exists('email', $bu)) {
                $em = strtolower(trim((string)$bu['email']));
                if ($em !== '' && !filter_var($em, FILTER_VALIDATE_EMAIL)) $errors['buyer.email'] = 'invalid_email';
                $buyer['buyer_email'] = $em ?: null;
            }
        }
        if ($errors) throw new BookingError('validation', 422, $errors);

        $db->begin();
        try {
            foreach ($tickets as $t) {
                $db->query('UPDATE booking_tickets SET participant_first_name = ?, participant_age = ? WHERE id = ?', [$t['first_name'], $t['age'], $t['id']]);
            }
            $sets = ['team_name = ?'];
            $vals = [$team === '' ? null : $team];
            foreach ($buyer ?? [] as $col => $v) { $sets[] = "$col = ?"; $vals[] = $v; }
            if (!$byBuyer && array_key_exists('internal_notes', $data)) { $sets[] = 'internal_notes = ?'; $vals[] = mb_substr((string)$data['internal_notes'], 0, 2000) ?: null; }
            if (!$byBuyer && isset($data['payment_status']) && in_array($b['payment_status'], ['offline_due', 'offline_paid'], true)
                && in_array($data['payment_status'], ['offline_due', 'offline_paid'], true)) {
                $sets[] = 'payment_status = ?';
                $vals[] = $data['payment_status'];
                $sets[] = $data['payment_status'] === 'offline_paid' ? 'paid_at = COALESCE(paid_at, UTC_TIMESTAMP())' : 'paid_at = NULL';
            }
            $vals[] = $b['id'];
            $db->query('UPDATE bookings SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
            if ($answers !== null) {
                $db->query('DELETE FROM booking_answers WHERE booking_id = ?', [$b['id']]);
                foreach ($answers as $qid => $val) $db->query('INSERT INTO booking_answers (booking_id, question_id, value) VALUES (?, ?, ?)', [$b['id'], $qid, $val]);
            }
            EventsBooking::log($db, (int)$b['id'], 'edited', $actorType, $actorId, ['fields' => array_keys($data)]);
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }

    // ── Stripe sync (webhook) ────────────────────────────────────────────

    /**
     * charge.refunded: align our totals with Stripe (refunds made from the
     * licensee's own Stripe dashboard land here too).
     */
    public static function syncChargeRefunds($db, ?string $account, $charge): void {
        $pi = is_string($charge->payment_intent ?? null) ? $charge->payment_intent : ($charge->payment_intent->id ?? null);
        if (!$pi) return;
        $b = $db->fetch('SELECT * FROM bookings WHERE stripe_payment_intent_id = ?', [$pi]);
        if (!$b) return;
        $stripeTotal = (int)($charge->amount_refunded ?? 0);
        $missing = $stripeTotal - (int)$b['refunded_cents'];
        if ($missing > 0) {
            // A refund we did not make ourselves (Stripe dashboard): fee not refunded by default.
            self::recordRefund($db, (int)$b['id'], null, $missing, 0, 'stripe_dashboard', 'stripe_dashboard', null);
        }
        if (!$b['stripe_charge_id'] && !empty($charge->id)) $db->query('UPDATE bookings SET stripe_charge_id = ? WHERE id = ?', [$charge->id, $b['id']]);
    }

    public static function disputeOpened($db, $dispute): void {
        $pi = is_string($dispute->payment_intent ?? null) ? $dispute->payment_intent : null;
        $b = $pi ? $db->fetch('SELECT * FROM bookings WHERE stripe_payment_intent_id = ?', [$pi]) : null;
        if (!$b) return;
        $db->query('UPDATE bookings SET disputed_at = COALESCE(disputed_at, UTC_TIMESTAMP()) WHERE id = ?', [$b['id']]);
        EventsBooking::log($db, (int)$b['id'], 'dispute_opened', 'stripe', null, ['dispute' => $dispute->id ?? null, 'reason' => $dispute->reason ?? null]);
        $alert = $db->fetch('SELECT COALESCE(e.licensee_alert_email, c.legal_email, c.email) AS e FROM events e JOIN clients c ON c.id = e.client_id WHERE e.id = ?', [$b['event_id']]);
        if (!empty($alert['e'])) EventsEmails::queue($db, 'dispute_alert', (int)$b['id'], $alert['e']);
    }

    public static function disputeClosed($db, $dispute): void {
        $pi = is_string($dispute->payment_intent ?? null) ? $dispute->payment_intent : null;
        $b = $pi ? $db->fetch('SELECT id FROM bookings WHERE stripe_payment_intent_id = ?', [$pi]) : null;
        if ($b) EventsBooking::log($db, (int)$b['id'], 'dispute_closed', 'stripe', null, ['status' => $dispute->status ?? null]);
    }

    // ── Cron jobs ────────────────────────────────────────────────────────

    /** 48 h reminder, once, for bookings made before the 48 h window. */
    public static function sendReminders($db): int {
        $rows = $db->fetchAll(
            "SELECT b.id FROM bookings b JOIN event_slots s ON s.id = b.slot_id
              WHERE b.status = 'confirmed' AND b.reminder_sent_at IS NULL AND b.buyer_email IS NOT NULL AND b.anonymised_at IS NULL
                AND s.status <> 'cancelled' AND s.starts_at > UTC_TIMESTAMP() AND s.starts_at <= UTC_TIMESTAMP() + INTERVAL 48 HOUR
                AND b.created_at < s.starts_at - INTERVAL 48 HOUR
              LIMIT 200"
        );
        foreach ($rows as $r) {
            $n = $db->query('UPDATE bookings SET reminder_sent_at = UTC_TIMESTAMP() WHERE id = ? AND reminder_sent_at IS NULL', [$r['id']])->rowCount();
            if ($n) EventsEmails::queue($db, 'reminder_48h', (int)$r['id']);
        }
        return count($rows);
    }

    /**
     * GDPR: 12 months after an event's last session, wipe buyers' personal data.
     * Amounts, references, Stripe ids and consent flags stay (accounting).
     */
    public static function anonymise($db): int {
        $events = $db->fetchAll(
            "SELECT id FROM events WHERE anonymised_at IS NULL AND last_slot_end_at IS NOT NULL AND last_slot_end_at < UTC_TIMESTAMP() - INTERVAL 12 MONTH LIMIT 20"
        );
        foreach ($events as $e) {
            $db->begin();
            try {
                $db->query(
                    "UPDATE bookings SET buyer_first_name = NULL, buyer_last_name = NULL, buyer_email = NULL, buyer_phone = NULL,
                        team_name = IF(team_name IS NULL, NULL, '—'), internal_notes = NULL, anonymised_at = UTC_TIMESTAMP()
                      WHERE event_id = ? AND anonymised_at IS NULL",
                    [$e['id']]
                );
                $db->query('UPDATE booking_tickets bt JOIN bookings b ON b.id = bt.booking_id SET bt.participant_first_name = NULL, bt.participant_age = NULL WHERE b.event_id = ?', [$e['id']]);
                $db->query('DELETE ba FROM booking_answers ba JOIN bookings b ON b.id = ba.booking_id WHERE b.event_id = ?', [$e['id']]);
                $db->query("UPDATE email_outbox SET to_email = 'anonymised' WHERE event_id = ?", [$e['id']]);
                $db->query('UPDATE events SET anonymised_at = UTC_TIMESTAMP() WHERE id = ?', [$e['id']]);
                $db->commit();
            } catch (Throwable $ex) {
                $db->rollBack();
                throw $ex;
            }
        }
        return count($events);
    }
}
