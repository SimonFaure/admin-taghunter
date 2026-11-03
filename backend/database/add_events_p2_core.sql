-- Events & online booking, phase 2: events, page content, ticket types + price
-- tiers, sessions (slots), checkout questions, bookings, email outbox, public
-- rate limits, cron log. Design: Claude plan "ok-i-need-a-moonlit-goose".
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) AFTER
-- add_events_p1_payments.sql and BEFORE deploying the phase-2 PHP. Only
-- CREATE TABLE IF NOT EXISTS, so it is safe to re-run.
--
-- Conventions: money = integer cents, rates = basis points (2000 = 20 %),
-- every DATETIME is UTC (events.timezone is only used to display/generate).
-- "Slot" = what licensees call a session (go_sessions is an unrelated table).

CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uniqid VARCHAR(20) NOT NULL,                 -- media folder media/evt_<uniqid>/
    client_id INT NOT NULL,
    slug VARCHAR(100) NOT NULL,                  -- events.taghunter.fr/<slug>, unique platform-wide
    status VARCHAR(12) NOT NULL DEFAULT 'draft', -- draft | published | archived
    listed TINYINT(1) NOT NULL DEFAULT 1,        -- shown in the public directory
    sales_paused TINYINT(1) NOT NULL DEFAULT 0,
    main_language CHAR(2) NOT NULL DEFAULT 'fr',
    languages JSON NULL,                         -- ["fr","en"], always contains main_language
    timezone VARCHAR(40) NOT NULL DEFAULT 'Europe/Paris',
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    venue_name VARCHAR(190) NULL,
    venue_address VARCHAR(255) NULL,
    venue_postal_code VARCHAR(20) NULL,
    venue_city VARCHAR(120) NULL,
    venue_country CHAR(2) NULL,
    lat DECIMAL(9,6) NULL,
    lng DECIMAL(9,6) NULL,
    region VARCHAR(10) NULL,                     -- directory filter (FR region code)
    audience VARCHAR(12) NOT NULL DEFAULT 'all', -- kids | family | adults | all
    layout JSON NULL,                            -- page sections on/off + order + media
    theme JSON NULL,                             -- colours, logo, heading font
    team_size_min INT NOT NULL DEFAULT 1,
    team_size_max INT NOT NULL DEFAULT 6,
    require_player_details TINYINT(1) NOT NULL DEFAULT 0,
    minor_age_threshold INT NULL,                -- "players under N need an adult in the booking"
    adult_age INT NOT NULL DEFAULT 18,
    sales_cutoff_minutes INT NOT NULL DEFAULT 60,
    refund_policy VARCHAR(12) NOT NULL DEFAULT 'none',  -- none | full_until | partial
    refund_days_before INT NULL,
    refund_retention_bp INT NULL,
    terms_pdf VARCHAR(190) NULL,
    image_rights_enabled TINYINT(1) NOT NULL DEFAULT 0,
    newsletter_enabled TINYINT(1) NOT NULL DEFAULT 0,
    licensee_alert_email VARCHAR(190) NULL,
    availability_display VARCHAR(10) NOT NULL DEFAULT 'status', -- status | exact
    few_left_bp INT NOT NULL DEFAULT 2000,
    last_tickets_banner TINYINT(1) NOT NULL DEFAULT 0,
    preview_nonce CHAR(16) NOT NULL,
    first_slot_at DATETIME NULL,                 -- cached from slots (listing, sorting)
    last_slot_end_at DATETIME NULL,
    published_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    anonymised_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_events_slug (slug),
    UNIQUE KEY uq_events_uniqid (uniqid),
    KEY idx_events_client (client_id, status),
    KEY idx_events_directory (status, listed, last_slot_end_at),
    CONSTRAINT fk_events_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Translatable page text, one row per language (title, description, FAQ...).
CREATE TABLE IF NOT EXISTS event_contents (
    event_id INT NOT NULL,
    lang CHAR(2) NOT NULL,
    content JSON NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, lang),
    CONSTRAINT fk_ec_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_ticket_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'player',  -- player (joins the team) | individual (zombie, volunteer)
    label_i18n JSON NOT NULL,                    -- {"fr": "...", "en": "..."}
    description_i18n JSON NULL,
    base_price_cents INT NOT NULL DEFAULT 0,     -- regular price, after every tier has ended
    vat_bp INT NULL,                             -- NULL = licensee default rate
    min_age INT NULL,
    cap_per_slot INT NULL,                       -- default per-slot cap for this type
    max_per_booking INT NULL,
    position INT NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,        -- 0 = kept for existing bookings, not sold
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ett_event (event_id, position),
    CONSTRAINT fk_ett_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Earlier, cheaper price tiers. A tier applies while BOTH its limits hold
-- (now < ends_at, sold < ends_after_sold); the first applicable tier by
-- position wins, otherwise base_price_cents.
CREATE TABLE IF NOT EXISTS event_price_steps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_type_id INT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    price_cents INT NOT NULL,
    ends_at DATETIME NULL,
    ends_after_sold INT NULL,
    label_i18n JSON NULL,
    KEY idx_eps_type (ticket_type_id, position),
    CONSTRAINT fk_eps_type FOREIGN KEY (ticket_type_id) REFERENCES event_ticket_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    starts_at DATETIME NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 90,
    capacity INT NOT NULL DEFAULT 30,            -- people
    status VARCHAR(10) NOT NULL DEFAULT 'open',  -- open | closed | cancelled
    scenario_id INT NULL,                        -- game played (Playground "Load teams", phase 4)
    label_i18n JSON NULL,
    cancelled_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_es_event (event_id, starts_at),
    CONSTRAINT fk_es_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Which ticket types a slot sells (no row = not sold on that slot).
CREATE TABLE IF NOT EXISTS event_slot_ticket_types (
    slot_id INT NOT NULL,
    ticket_type_id INT NOT NULL,
    cap INT NULL,                                -- overrides event_ticket_types.cap_per_slot
    PRIMARY KEY (slot_id, ticket_type_id),
    CONSTRAINT fk_estt_slot FOREIGN KEY (slot_id) REFERENCES event_slots(id) ON DELETE CASCADE,
    CONSTRAINT fk_estt_type FOREIGN KEY (ticket_type_id) REFERENCES event_ticket_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    kind VARCHAR(10) NOT NULL DEFAULT 'text',    -- text | choice | checkbox
    label_i18n JSON NOT NULL,
    options_i18n JSON NULL,                      -- choice: [{"fr": "S", "en": "S"}, ...]
    required TINYINT(1) NOT NULL DEFAULT 0,
    position INT NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    KEY idx_eq_event (event_id, position),
    CONSTRAINT fk_eq_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One booking = one buyer, one slot, N person-tickets = one team.
-- A pending booking holds its places until expires_at (Stripe Checkout window).
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid CHAR(36) NOT NULL,
    reference VARCHAR(12) NOT NULL,
    event_id INT NOT NULL,
    slot_id INT NOT NULL,
    client_id INT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'pending',      -- pending | confirmed | cancelled | expired
    payment_status VARCHAR(20) NOT NULL DEFAULT 'none', -- none | paid | partially_refunded | refunded | offline_due | offline_paid | free
    source VARCHAR(16) NOT NULL DEFAULT 'online',       -- online | manual_onsite | manual_invoice | manual_free
    language CHAR(2) NOT NULL DEFAULT 'fr',
    team_name VARCHAR(80) NULL,
    buyer_first_name VARCHAR(80) NULL,
    buyer_last_name VARCHAR(80) NULL,
    buyer_email VARCHAR(190) NULL,
    buyer_phone VARCHAR(40) NULL,
    consents JSON NULL,
    subtotal_cents INT NOT NULL DEFAULT 0,
    discount_cents INT NOT NULL DEFAULT 0,
    promo_code_id INT NULL,
    booking_fee_cents INT NOT NULL DEFAULT 0,
    total_cents INT NOT NULL DEFAULT 0,
    refunded_cents INT NOT NULL DEFAULT 0,
    fee_refunded_cents INT NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'EUR',
    commission_bp_snapshot INT NOT NULL DEFAULT 0,
    commission_fixed_snapshot INT NOT NULL DEFAULT 0,
    vat_snapshot JSON NULL,                      -- licensee VAT regime + per-line rates at booking time
    stripe_account_id VARCHAR(64) NULL,
    stripe_checkout_session_id VARCHAR(255) NULL,
    stripe_payment_intent_id VARCHAR(255) NULL,
    stripe_charge_id VARCHAR(255) NULL,
    stripe_application_fee_id VARCHAR(255) NULL,
    expires_at DATETIME NULL,
    paid_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    cancel_reason VARCHAR(60) NULL,
    disputed_at DATETIME NULL,
    token_nonce CHAR(16) NOT NULL,               -- rotate to revoke every link of this booking
    reminder_sent_at DATETIME NULL,
    results_sent_at DATETIME NULL,
    created_by_user_id INT NULL,                 -- set for manual bookings
    internal_notes TEXT NULL,
    anonymised_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bookings_uuid (uuid),
    UNIQUE KEY uq_bookings_reference (reference),
    UNIQUE KEY uq_bookings_checkout (stripe_checkout_session_id),
    KEY idx_bookings_slot (slot_id, status),
    KEY idx_bookings_event (event_id, status),
    KEY idx_bookings_client_paid (client_id, paid_at),
    KEY idx_bookings_email (buyer_email),
    KEY idx_bookings_pending (status, expires_at),
    CONSTRAINT fk_bookings_event FOREIGN KEY (event_id) REFERENCES events(id),
    CONSTRAINT fk_bookings_slot FOREIGN KEY (slot_id) REFERENCES event_slots(id),
    CONSTRAINT fk_bookings_client FOREIGN KEY (client_id) REFERENCES clients(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    ticket_type_id INT NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'player',
    label_snapshot VARCHAR(190) NOT NULL,
    unit_price_cents INT NOT NULL,
    vat_bp INT NOT NULL DEFAULT 0,
    price_step_id INT NULL,
    participant_first_name VARCHAR(80) NULL,
    participant_age INT NULL,
    position INT NOT NULL DEFAULT 0,
    checked_in_at DATETIME NULL,
    KEY idx_bt_booking (booking_id),
    KEY idx_bt_type (ticket_type_id),
    CONSTRAINT fk_bt_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_answers (
    booking_id INT NOT NULL,
    question_id INT NOT NULL,
    value TEXT NULL,
    PRIMARY KEY (booking_id, question_id),
    CONSTRAINT fk_ba_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit trail of everything that happened to a booking.
CREATE TABLE IF NOT EXISTS booking_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    type VARCHAR(40) NOT NULL,
    actor_type VARCHAR(12) NULL,                 -- buyer | licensee | admin | stripe | system
    actor_id INT NULL,
    data JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_bl_booking (booking_id),
    CONSTRAINT fk_bl_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every transactional email goes through here (sent right away, retried by cron).
CREATE TABLE IF NOT EXISTS email_outbox (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NULL,
    event_id INT NULL,
    booking_id INT NULL,
    kind VARCHAR(40) NOT NULL,
    to_email VARCHAR(190) NOT NULL,
    lang CHAR(2) NOT NULL DEFAULT 'fr',
    status VARCHAR(10) NOT NULL DEFAULT 'queued', -- queued | sent | failed
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    provider_message_id VARCHAR(80) NULL,
    last_error TEXT NULL,
    sent_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_eo_queue (status, next_attempt_at),
    KEY idx_eo_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fixed-window counters for unauthenticated endpoints (quote, book, ...).
CREATE TABLE IF NOT EXISTS public_rate_limits (
    bucket VARCHAR(120) NOT NULL,
    window_start DATETIME NOT NULL,
    hits INT NOT NULL DEFAULT 0,
    PRIMARY KEY (bucket, window_start),
    KEY idx_prl_window (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cron_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job VARCHAR(40) NOT NULL,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'running',
    details JSON NULL,
    KEY idx_cr_job (job, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
