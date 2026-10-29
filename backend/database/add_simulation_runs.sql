-- Playground game simulator: one row per simulated test run + its verdict.
-- Design: memory project_playground_game_simulator (coverage tracking).
--
-- A "config" is the game type + the behaviour-changing launch options only
-- (scenario and cosmetic options excluded). The Playground builds the
-- canonical `config_key` ("mystery|devices=one|registration=auto|...") and the
-- same axes as JSON in `config_json`. "Tested" = a 'pass' row on the current
-- app_version; older passes show as "tested on x.y.z".
--
-- Writers/readers: Playground tester builds only, from clients or devices on
-- the 'test' update channel (backend/api/simulation_runs.php). Admins read in
-- the Studio admin.
--
-- Deploy order: RUN THIS MIGRATION BEFORE THE PHP DEPLOY. Idempotent.

CREATE TABLE IF NOT EXISTS simulation_runs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    device_id INT NULL,
    game_type VARCHAR(32) NOT NULL,
    config_key VARCHAR(512) NOT NULL,
    config_json JSON NOT NULL,
    scenario_uniqid VARCHAR(64) NULL,
    scenario_title VARCHAR(255) NULL,
    app_version VARCHAR(32) NOT NULL,
    seed INT NOT NULL,
    speed SMALLINT NOT NULL DEFAULT 1,
    devices_count SMALLINT NOT NULL DEFAULT 1,
    teams_count SMALLINT NOT NULL DEFAULT 0,
    reads_total INT NOT NULL DEFAULT 0,
    reads_done INT NOT NULL DEFAULT 0,
    read_errors INT NOT NULL DEFAULT 0,
    verdict VARCHAR(16) NOT NULL,
    note TEXT NULL,
    tester_name VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sim_runs_type_key (game_type, config_key(191)),
    KEY idx_sim_runs_created (created_at)
);
