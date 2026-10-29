-- Scenario files: "no translation needed". An admin ticks it on a document
-- that is the same in every language (a map, a picture, a blank answer sheet),
-- and the Scenario overview stops counting that document as left to translate
-- (Admin > Scenarios > scenario details > Scenario Files).
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY -
-- scenario_files.php?action=list and scenario_overview.php SELECT the new column.
--
-- Safe to run multiple times.
--
-- FRESH-DB ORDERING: apply_all_migrations.php runs database/*.sql alphabetically,
-- so this file is reached BEFORE scenario_files_migration.sql creates the table.
-- The statement is therefore gated on `scenario_files` existing and no-ops on a
-- fresh database (see add_scenario_translations_migration.sql).
--
-- NOTE for the migrate.php runner: it strips `--` comments then splits on `;`,
-- so no statement below may contain a `;` or a `--` inside a quoted string.

SET @dbname = DATABASE();

SET @has_files = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files');

-- ─────────────────────────────────────────────────────────────────────────────
-- scenario_files.no_translation -- 1 = this document needs no translation.
-- Set on the PRIMARY file and applies to the whole document (its variants too).
-- Editorial bookkeeping only: licensees and playgrounds never read it.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    @has_files = 0 OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files' AND COLUMN_NAME = 'no_translation') > 0,
    'SELECT 1',
    'ALTER TABLE scenario_files ADD COLUMN no_translation TINYINT(1) NOT NULL DEFAULT 0'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
