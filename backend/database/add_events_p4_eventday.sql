-- Events & online booking, phase 4: event day. Staff check-in links (+ PIN),
-- staff sessions, check-in log (idempotent for offline Playground devices),
-- per-licensee version counter of the "today's bookings" feed for Playground,
-- and per-team game results (results email).
-- Design: Claude plan "ok-i-need-a-moonlit-goose".
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin AFTER
-- add_events_p3_backoffice.sql and BEFORE deploying the phase-4 PHP, and
-- deploy the Studio BEFORE releasing the Playground that uses it.
-- Only CREATE TABLE IF NOT EXISTS: safe to re-run.

-- A link the licensee shares with volunteers at the entrance. The URL carries
-- an HMAC token (id + link_nonce); the 4-digit PIN is stored hashed.
CREATE TABLE IF NOT EXISTS event_staff_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    label VARCHAR(80) NULL,
    link_nonce CHAR(16) NOT NULL,
    pin_hash VARCHAR(255) NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    revoked_at DATETIME NULL,
    last_used_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_esl_event (event_id),
    CONSTRAINT fk_esl_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Short-lived session after a correct PIN (token stored as SHA-256).
CREATE TABLE IF NOT EXISTS event_staff_sessions (
    token_hash CHAR(64) NOT NULL PRIMARY KEY,
    link_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    ip VARCHAR(45) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ess_link (link_id),
    CONSTRAINT fk_ess_link FOREIGN KEY (link_id) REFERENCES event_staff_links(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every check-in / undo, from any source. client_uuid makes a replay from an
-- offline device a no-op. The current state lives on booking_tickets.checked_in_at;
-- for one ticket the action with the latest occurred_at wins.
CREATE TABLE IF NOT EXISTS checkins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_uuid CHAR(36) NOT NULL,
    booking_id INT NOT NULL,
    booking_ticket_id INT NULL,
    event_id INT NOT NULL,
    slot_id INT NOT NULL,
    action VARCHAR(5) NOT NULL,                  -- in | undo
    source VARCHAR(12) NOT NULL,                 -- licensee | staff | playground
    staff_link_id INT NULL,
    device_id INT NULL,
    occurred_at DATETIME(3) NOT NULL,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_checkins_uuid (client_uuid, booking_ticket_id),
    KEY idx_checkins_ticket (booking_ticket_id, occurred_at),
    KEY idx_checkins_booking (booking_id),
    CONSTRAINT fk_checkins_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bumped on every booking change of a licensee: Playground re-downloads the
-- event-day feed when the manifest's event_bookings_version moves.
CREATE TABLE IF NOT EXISTS event_bookings_meta (
    client_id INT NOT NULL PRIMARY KEY,
    current_version INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ebm_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A booked team's result, pushed by Playground when its game ends (results email).
CREATE TABLE IF NOT EXISTS booking_results (
    booking_id INT NOT NULL PRIMARY KEY,
    summary_uuid VARCHAR(64) NULL,
    game_type VARCHAR(32) NULL,
    scenario_uniqid VARCHAR(64) NULL,
    score INT NULL,
    `rank` INT NULL,
    teams_count INT NULL,
    elapsed_seconds INT NULL,
    played_at DATETIME NULL,
    data JSON NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,
    KEY idx_br_pending (sent_at, updated_at),
    CONSTRAINT fk_bres_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
