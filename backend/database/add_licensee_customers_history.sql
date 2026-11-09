-- Licensee customers: games added BY HAND to a customer's history (played
-- before Taghunter, on paper, on a device that never synced...). Synced games
-- stay in game_summaries; these rows are separate so they never count in the
-- licensee's statistics. They do count in the customer's games / last played,
-- and travel to the playground in get_customers `games` (id prefixed
-- "manual:") so the "already played" badge sees them too.
--
--   scenario_uniqid  one of the catalog scenarios, or NULL with a free `title`
--                    (a game outside the catalog). game_type is copied from
--                    the scenario, or picked by hand for a free title.
--
-- File name sorts AFTER add_licensee_customers.sql (FK to licensee_customers).
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB, BEFORE deploying the PHP that reads this table. Idempotent, safe
-- to re-run.

CREATE TABLE IF NOT EXISTS licensee_customer_history (
    id CHAR(36) NOT NULL,
    client_id INT NOT NULL,
    customer_id CHAR(36) NOT NULL,
    played_on DATE NOT NULL,
    scenario_uniqid VARCHAR(64) NULL,
    title VARCHAR(190) NULL,
    game_type VARCHAR(32) NULL,
    teams_count INT NULL,
    players_count INT NULL,
    notes TEXT NULL,
    created_by VARCHAR(16) NOT NULL DEFAULT 'client',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_lch_customer (client_id, customer_id, played_on),
    CONSTRAINT fk_lch_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_lch_customer FOREIGN KEY (customer_id) REFERENCES licensee_customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
