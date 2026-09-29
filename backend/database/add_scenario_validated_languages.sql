-- Per-scenario language validation: an admin-owned scenario only releases the
-- languages an admin has validated (Admin > Translations > Scenarios). A
-- language being translated stays in `data` but is stripped from every client
-- and playground payload. See backend/utils/ScenarioLanguages.php.
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY. Without the
-- column every admin scenario reads as "default language only" and English
-- products would drop out of English clients' catalogues.
--
-- Safe to run multiple times. The BACKFILL runs ONCE, in the same run that
-- creates the column (@had_validated captured before the ALTER): re-running it
-- later would silently validate every draft language, and apply_all_migrations
-- re-runs every file.
--
-- NOTE for the migrate.php runner: it strips `--` comments then splits on `;`,
-- so no statement below may contain a `;` or a `--` inside a quoted string.

SET @dbname = DATABASE();

SET @has_scenarios = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios');

SET @had_validated = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'validated_languages');

-- ─────────────────────────────────────────────────────────────────────────────
-- scenarios.validated_languages -- JSON array of language codes. Only read for
-- admin-owned scenarios (client_id IS NULL). NULL = default language only.
-- A column, NOT part of `data`, for the same reason as translation_meta: the
-- data hash must not move on editorial bookkeeping. The served sync hash is
-- salted with the visible languages instead (ScenarioLanguages::servedHash).
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    @has_scenarios = 0 OR @had_validated > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN validated_languages JSON NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- One-shot backfill: every language an admin scenario exposes TODAY stays
-- exposed, so the deploy changes nothing for clients.
SET @sql = (SELECT IF(
    @has_scenarios = 0 OR @had_validated > 0,
    'SELECT 1',
    'UPDATE scenarios
        SET validated_languages = COALESCE(
              JSON_EXTRACT(data, ''$.available_languages''),
              JSON_EXTRACT(data, ''$.data.available_languages''),
              JSON_ARRAY())
      WHERE client_id IS NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.sees_draft_languages -- tester flag: this client's studio and
-- playground receive unvalidated languages too, for field QA.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients') = 0
    OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'sees_draft_languages') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN sees_draft_languages TINYINT(1) NOT NULL DEFAULT 0'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
