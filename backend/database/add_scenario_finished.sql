-- Scenario overview: an admin ticks a scenario as "fully finished" once its
-- cover, video, subtitles, files and translations are all done
-- (Admin > Scenarios > Scenario overview, backend/api/scenario_overview.php).
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY -
-- scenario_overview.php SELECTs the new columns.
--
-- Safe to run multiple times.
--
-- NOTE for the migrate.php runner: it strips `--` comments then splits on `;`,
-- so no statement below may contain a `;` or a `--` inside a quoted string.

SET @dbname = DATABASE();

SET @has_scenarios = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios');

-- ─────────────────────────────────────────────────────────────────────────────
-- scenarios.finished_at / finished_by -- NULL = still in progress. Columns, NOT
-- part of `data`, for the same reason as translation_meta: editorial
-- bookkeeping must not move the data hash and re-sync every playground.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    @has_scenarios = 0
    OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'finished_at') > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN finished_at DATETIME NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    @has_scenarios = 0
    OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'finished_by') > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN finished_by VARCHAR(255) NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
