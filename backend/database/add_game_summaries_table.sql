-- game_summaries: per-game played-statistics summary pushed up from playgrounds.
-- Companion: backend/apply_game_summaries_migration.php
--
-- One row per launched game that was actually played (teams with a start time,
-- an end time, and a non-zero score). Computed mother-side from the local lg_*
-- tables and delivered through the telemetry outbox as a `game_summary` event.
-- Keyed by summary_uuid (the playground's stable per-game id) with last-write
-- -wins upsert, so post-game score edits re-emit and update the same row.

CREATE TABLE IF NOT EXISTS game_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    summary_uuid CHAR(36) NOT NULL,
    client_id INT NOT NULL,
    device_id INT NULL,
    name VARCHAR(255) NULL,
    game_type VARCHAR(40) NOT NULL,
    scenario_uniqid VARCHAR(64) NULL,
    played_at DATETIME NULL,
    teams_launched INT NULL,
    teams_played INT NOT NULL,
    players_played INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_gs_summary_uuid (summary_uuid),
    KEY idx_gs_client_played (client_id, played_at),
    KEY idx_gs_client_created (client_id, created_at),
    KEY idx_gs_game_type (game_type),
    KEY idx_gs_scenario (scenario_uniqid),
    CONSTRAINT fk_gs_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_gs_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
