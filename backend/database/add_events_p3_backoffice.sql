-- Events & online booking, phase 3: add-ons (+ variants / stock), promo codes,
-- refunds, background jobs (slot / event cancellation), monthly commission
-- invoices. Design: Claude plan "ok-i-need-a-moonlit-goose".
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) AFTER
-- add_events_p2_core.sql and BEFORE deploying the phase-3 PHP. Only
-- CREATE TABLE IF NOT EXISTS, so it is safe to re-run.
-- Money = integer cents, rates = basis points, dates = UTC.

CREATE TABLE IF NOT EXISTS event_addons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    label_i18n JSON NOT NULL,
    description_i18n JSON NULL,
    image VARCHAR(190) NULL,
    price_cents INT NOT NULL DEFAULT 0,
    vat_bp INT NULL,                             -- NULL = licensee default rate
    max_per_booking INT NULL,
    position INT NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    KEY idx_ea_event (event_id, position),
    CONSTRAINT fk_ea_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every add-on has at least one variant (a T-shirt has sizes; a single option
-- has one unnamed variant). Stock is per variant, NULL = unlimited.
CREATE TABLE IF NOT EXISTS event_addon_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    addon_id INT NOT NULL,
    label_i18n JSON NULL,
    price_cents INT NULL,                        -- NULL = the add-on's price
    stock INT NULL,
    position INT NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    KEY idx_eav_addon (addon_id, position),
    CONSTRAINT fk_eav_addon FOREIGN KEY (addon_id) REFERENCES event_addons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_addons (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    addon_id INT NOT NULL,
    variant_id INT NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    unit_price_cents INT NOT NULL,
    vat_bp INT NOT NULL DEFAULT 0,
    label_snapshot VARCHAR(190) NOT NULL,
    KEY idx_bad_booking (booking_id),
    KEY idx_bad_variant (variant_id),
    CONSTRAINT fk_bad_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uses are counted from bookings (confirmed + live holds), never stored, so
-- the limit can't drift.
CREATE TABLE IF NOT EXISTS event_promo_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    code VARCHAR(40) NOT NULL,                   -- stored upper-case
    kind VARCHAR(10) NOT NULL DEFAULT 'percent', -- percent (value in bp) | fixed (value in cents)
    value INT NOT NULL,
    max_uses INT NULL,
    valid_from DATETIME NULL,
    valid_until DATETIME NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_epc_code (event_id, code),
    CONSTRAINT fk_epc_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per money movement back to a buyer.
CREATE TABLE IF NOT EXISTS booking_refunds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    stripe_refund_id VARCHAR(255) NULL,
    amount_cents INT NOT NULL,                   -- total given back (incl. fee part)
    fee_refunded_cents INT NOT NULL DEFAULT 0,   -- part of it taken back from Taghunter's fee
    reason VARCHAR(255) NULL,
    initiated_by VARCHAR(20) NOT NULL,           -- licensee | admin | cancellation | stripe_dashboard | system
    status VARCHAR(20) NOT NULL DEFAULT 'succeeded',
    created_by_user_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_br_stripe (stripe_refund_id),
    KEY idx_br_booking (booking_id),
    KEY idx_br_created (created_at),
    CONSTRAINT fk_br_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Long operations done in batches (cancel a slot / an event = refund everyone).
CREATE TABLE IF NOT EXISTS event_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(20) NOT NULL,                   -- cancel_slot | cancel_event
    event_id INT NOT NULL,
    ref_id INT NULL,                             -- slot id for cancel_slot
    status VARCHAR(10) NOT NULL DEFAULT 'queued', -- queued | running | done | error
    progress JSON NULL,
    reason VARCHAR(255) NULL,
    created_by_type VARCHAR(10) NULL,
    created_by_id INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_ej_status (status),
    KEY idx_ej_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gapless invoice numbering per series (row locked while numbering).
CREATE TABLE IF NOT EXISTS invoice_sequences (
    series VARCHAR(40) NOT NULL PRIMARY KEY,
    last_number INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Monthly commission invoice (or credit note) from Taghunter to a licensee.
CREATE TABLE IF NOT EXISTS commission_invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    number VARCHAR(40) NOT NULL,
    client_id INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    kind VARCHAR(12) NOT NULL DEFAULT 'invoice', -- invoice | credit_note
    fees_ttc_cents INT NOT NULL,                 -- fees collected - fees refunded in the period (absolute value)
    ht_cents INT NOT NULL,
    vat_cents INT NOT NULL,
    vat_rate_bp INT NOT NULL,
    vat_scheme VARCHAR(12) NOT NULL,             -- fr | eu_reverse
    bookings_count INT NOT NULL DEFAULT 0,
    issuer JSON NULL,                            -- Taghunter identity at issue time
    customer JSON NULL,                          -- licensee legal identity at issue time
    pdf_path VARCHAR(255) NULL,
    csv_path VARCHAR(255) NULL,
    issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    emailed_at DATETIME NULL,
    UNIQUE KEY uq_ci_number (number),
    UNIQUE KEY uq_ci_period (client_id, period_start, kind),
    CONSTRAINT fk_ci_client FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- email_outbox.ref_id: what a non-booking email is about (invoice id for
-- invoice_available). Guarded add (MySQL 8.4-safe).
SET @dbname = DATABASE();
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'email_outbox' AND COLUMN_NAME = 'ref_id') > 0,
    'SELECT 1',
    'ALTER TABLE email_outbox ADD COLUMN ref_id INT NULL AFTER booking_id'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- booking_log.actor_type must fit 'stripe_dashboard' / 'cancellation' (was 12).
ALTER TABLE booking_log MODIFY actor_type VARCHAR(20) NULL;

-- Cancellation reasons typed by the organiser (same length as event_jobs.reason).
ALTER TABLE bookings MODIFY cancel_reason VARCHAR(255) NULL;
