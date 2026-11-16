-- Licensee notifications (the bell on /my/home). Memory:
-- project_licensee_home_sidebar_redesign.
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB BEFORE deploying the PHP. The PHP tolerates the tables being absent
-- (no event is recorded and the bell only shows order updates), but events are
-- only captured once the tables exist. CREATE TABLE IF NOT EXISTS only: safe to
-- re-run.
--
-- Sources:
--   - licensee_notifications rows, written when the event happens:
--       scenario_published  a Tag Hunter product becomes published   (Playground licensees)
--       scenario_go         a published product becomes GO-capable    (GO licensees)
--       scenario_spot       a published product becomes Spot-capable  (Spot licensees)
--       playground_release  a Playground version lands on a channel   (stable: all, test: testers)
--       game_type           a game type becomes available to one licensee (client_id set)
--   - order_request_events (actor = admin), read directly: request updates.
-- Who sees what is decided when the list is read (apps, channel, language,
-- disabled game types), so a row never has to be rewritten.

CREATE TABLE IF NOT EXISTS licensee_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(32) NOT NULL,
    dedupe_key VARCHAR(160) NOT NULL,            -- one row per event, ever (INSERT IGNORE)
    client_id INT NULL,                          -- NULL = broadcast; set = this licensee only
    ref_id INT NULL,                             -- scenarios.id for scenario_* rows
    payload JSON NULL,                           -- {title,game_type} / {version,channel} / {code,name}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_licensee_notifications_dedupe (dedupe_key),
    INDEX idx_licensee_notifications_created (created_at),
    INDEX idx_licensee_notifications_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per licensee: when the bell was last opened (unread = newer than this, shared
-- by every browser of the account) and the game types already known to it.
CREATE TABLE IF NOT EXISTS licensee_notification_state (
    client_id INT NOT NULL PRIMARY KEY,
    seen_at DATETIME NULL,
    game_types_known JSON NULL,                  -- NULL until the first read: no backlog of "new" types
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
