-- Simulation runs triage (Studio admin "Simulation runs" page): a run can be
-- marked "analysed" (someone looked at it) then "resolved" (the problem it
-- showed is fixed / closed), with who + when + an optional triage note.
--   triage_status: 'new' | 'analysed' | 'resolved'
--   analysed_at/by, resolved_at/by: admin_users.id + timestamp of each step
--   triage_note: the analysis / resolution note (separate from the tester's note)
-- Design: memory project_playground_game_simulator.
--
-- Deploy order: RUN THIS MIGRATION BEFORE THE PHP DEPLOY (simulation_runs.php
-- reads these columns). Needs add_simulation_runs.sql first. Safe to run
-- multiple times: each ALTER is gated on INFORMATION_SCHEMA (MySQL 8.4 rejects
-- MariaDB-only ADD COLUMN IF NOT EXISTS - see project_studio_migration_runner_bugs).

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'simulation_runs' AND COLUMN_NAME = 'triage_status') > 0,
    'SELECT 1',
    'ALTER TABLE simulation_runs ADD COLUMN triage_status VARCHAR(16) NOT NULL DEFAULT ''new'''
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'simulation_runs' AND COLUMN_NAME = 'analysed_at') > 0,
    'SELECT 1',
    'ALTER TABLE simulation_runs ADD COLUMN analysed_at DATETIME NULL, ADD COLUMN analysed_by INT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'simulation_runs' AND COLUMN_NAME = 'resolved_at') > 0,
    'SELECT 1',
    'ALTER TABLE simulation_runs ADD COLUMN resolved_at DATETIME NULL, ADD COLUMN resolved_by INT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'simulation_runs' AND COLUMN_NAME = 'triage_note') > 0,
    'SELECT 1',
    'ALTER TABLE simulation_runs ADD COLUMN triage_note TEXT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'simulation_runs' AND INDEX_NAME = 'idx_sim_runs_triage') > 0,
    'SELECT 1',
    'ALTER TABLE simulation_runs ADD KEY idx_sim_runs_triage (triage_status)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
