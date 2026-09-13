-- GO / Spot game durations ("challenges"). Design: project_go_spot_durations.
--
-- Three storage points, one per level of the model:
--   1. clients.duration_catalog  - the operator's own list of minutes, shared by
--      GO and Spot (e.g. [30,60,90]). A dedicated column rather than
--      clients.preferences: client_preferences.php PUT replaces that whole blob
--      and MySettingsView writes it too, so two editors would clobber each other.
--   2. client_scenarios.durations - which of those minutes this client offers for
--      this scenario IN THIS APP. That table is already keyed
--      (client_id, scenario_id, mode), i.e. one row per app, so GO and Spot pick
--      independently for the same scenario. Empty/absent = fall back to the
--      scenario's authored default_time (nothing changes for existing QRs).
--   3. go_scores.duration_minutes - the clock the team actually played, so a
--      board can rank 30-min runs against 30-min runs only. NULL = a row written
--      before this feature (rendered as "unspecified").
--
-- The go_scores upsert key is deliberately NOT re-keyed: every run mints a fresh
-- team_uuid, so a replay at another duration is already a separate row.
--
-- Safe to run multiple times: every change is gated on INFORMATION_SCHEMA
-- (MySQL 8.4 rejects MariaDB-only ADD COLUMN IF NOT EXISTS - see
-- project_studio_migration_runner_bugs).

SET @dbname = DATABASE();

-- ───────────────────── clients.duration_catalog ─────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'duration_catalog') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN duration_catalog JSON NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────── client_scenarios.durations ─────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'client_scenarios' AND COLUMN_NAME = 'durations') > 0,
    'SELECT 1',
    'ALTER TABLE client_scenarios ADD COLUMN durations JSON NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ──────────────────── go_scores.duration_minutes ────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_scores' AND COLUMN_NAME = 'duration_minutes') > 0,
    'SELECT 1',
    'ALTER TABLE go_scores ADD COLUMN duration_minutes INT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Boards read (scenario, app, window) then split by duration - this index keeps
-- the duration column on the same access path.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_scores' AND INDEX_NAME = 'idx_go_scores_scenario_app_duration') > 0,
    'SELECT 1',
    'ALTER TABLE go_scores ADD INDEX idx_go_scores_scenario_app_duration (scenario_id, app, duration_minutes)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
