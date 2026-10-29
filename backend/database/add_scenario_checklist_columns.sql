-- Scenario overview checklist (Admin > Scenarios > Scenario overview):
-- per-scenario target languages, the "cover contains text" tick and a
-- document type on each scenario file.
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY -
-- scenario_overview.php, scenario_translations.php and scenario_files.php
-- SELECT the new columns.
--
-- Safe to run multiple times. No backfill: NULL target_languages resolves in
-- PHP (ScenarioLanguages::targetLanguages) to fr/en/es plus the scenario's own
-- language plus everything already released, so the deploy changes nothing for
-- any licensee.
--
-- NOTE for the migrate.php runner: it strips `--` comments then splits on `;`,
-- so no statement below may contain a `;` or a `--` inside a quoted string.

SET @dbname = DATABASE();

SET @has_scenarios = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios');

SET @has_files = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files');

-- ─────────────────────────────────────────────────────────────────────────────
-- scenarios.target_languages -- JSON array of language codes this scenario is
-- meant to exist in ("available in French only" = just its own language).
-- Caps validation: a language outside it can never be released, and removing a
-- released one withdraws it (scenario_translations.php keeps
-- validated_languages inside it AT WRITE TIME, so no read path changes).
-- A column, NOT part of `data`: the data hash must not move.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    @has_scenarios = 0
    OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'target_languages') > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN target_languages JSON NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- scenarios.cover_has_text -- 1 = the game cover visual carries text, so a
-- language version is expected for every target language. Checklist only.
SET @sql = (SELECT IF(
    @has_scenarios = 0
    OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'cover_has_text') > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN cover_has_text TINYINT(1) NOT NULL DEFAULT 0'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- scenario_files.doc_type -- which required document this file is (e.g.
-- fiche_mission_a4, photocall, other). NULL = automatic: recognised from the
-- file name by the Studio (src/scenarios/documentTypes.ts). Set on the PRIMARY
-- file and applies to its language variants. Checklist only.
SET @sql = (SELECT IF(
    @has_files = 0
    OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files' AND COLUMN_NAME = 'doc_type') > 0,
    'SELECT 1',
    'ALTER TABLE scenario_files ADD COLUMN doc_type VARCHAR(40) NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
