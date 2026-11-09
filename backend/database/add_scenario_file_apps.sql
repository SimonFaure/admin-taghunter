-- Restrict a scenario file to some apps (Admin > Scenarios > Files).
--
-- scenario_files.apps -- comma list from playground,go,spot. NULL = every app
-- (no restriction). Set on the PRIMARY file and applies to its language
-- variants. A licensee sees the file on the Studio portal only if they hold the
-- scenario through one of those apps (client_scenarios.mode, or premium +
-- product = playground). Owner and admins always see it.
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY -
-- scenario_files.php, scenario_translations.php and client_scenarios.php
-- SELECT the new column.
--
-- Safe to run multiple times. No backfill: NULL keeps every file visible as
-- before, so the deploy changes nothing for any licensee.
--
-- NOTE for the migrate.php runner: it strips `--` comments then splits on `;`,
-- so no statement below may contain a `;` or a `--` inside a quoted string.

SET @dbname = DATABASE();

SET @has_files = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files');

SET @sql = (SELECT IF(
    @has_files = 0
    OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files' AND COLUMN_NAME = 'apps') > 0,
    'SELECT 1',
    'ALTER TABLE scenario_files ADD COLUMN apps VARCHAR(40) NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
