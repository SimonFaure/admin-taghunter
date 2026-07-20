-- Tag Hunter Drop foundations: discriminate GO vs Drop rows in the shared
-- leaderboard/usage tables. Design: project_taghunter_drop.
--
-- A scenario can run in BOTH GO and Drop, which would collide on go_scores'
-- (client_id, scenario_id, team_uuid) key. We add an `app` discriminator to
-- go_scores + go_loads and re-key go_scores to include it. Leaderboard/stats
-- queries filter by app. Existing rows are GO, so DEFAULT 'go' backfills them.
--
-- Safe to run multiple times: each change is gated on INFORMATION_SCHEMA so an
-- existing column/index is skipped (MySQL 8.4 rejects MariaDB-only
-- `ADD COLUMN IF NOT EXISTS` -- see project_studio_migration_runner_bugs).
-- Sorts alphabetically AFTER add_taghunter_go_foundations.sql (which creates
-- go_loads/go_scores), so the apply_all runner sees those tables already; the
-- column adds are still guarded in case ordering ever changes.

SET @dbname = DATABASE();

-- ───────────────────────── go_loads.app ─────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_loads' AND COLUMN_NAME = 'app') > 0,
    'SELECT 1',
    'ALTER TABLE go_loads ADD COLUMN app ENUM(''go'',''drop'') NOT NULL DEFAULT ''go'''
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_loads' AND INDEX_NAME = 'idx_go_loads_scenario_app') > 0,
    'SELECT 1',
    'ALTER TABLE go_loads ADD INDEX idx_go_loads_scenario_app (scenario_id, app)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ───────────────────────── go_scores.app ────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_scores' AND COLUMN_NAME = 'app') > 0,
    'SELECT 1',
    'ALTER TABLE go_scores ADD COLUMN app ENUM(''go'',''drop'') NOT NULL DEFAULT ''go'''
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Re-key the upsert unique key to include app (drop the app-less one if present).
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_scores' AND INDEX_NAME = 'uq_go_scores_client_scenario_team') > 0,
    'ALTER TABLE go_scores DROP INDEX uq_go_scores_client_scenario_team',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_scores' AND INDEX_NAME = 'uq_go_scores_client_scenario_team_app') > 0,
    'SELECT 1',
    'ALTER TABLE go_scores ADD UNIQUE KEY uq_go_scores_client_scenario_team_app (client_id, scenario_id, team_uuid, app)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_scores' AND INDEX_NAME = 'idx_go_scores_scenario_app_updated') > 0,
    'SELECT 1',
    'ALTER TABLE go_scores ADD INDEX idx_go_scores_scenario_app_updated (scenario_id, app, updated_at)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
