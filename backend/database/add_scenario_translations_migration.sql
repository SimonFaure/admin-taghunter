-- Scenario translations: per-file language, language variants, localized file
-- titles, the strings printed INSIDE a document, and per-path staleness hashes.
-- Design: memory project_scenario_translations_page / plans/here-is-a-translation-transient-boot.md.
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY. The new
-- scenario_files.php SELECTs language / parent_file_id / name_i18n and will
-- 500 against an unmigrated database.
--
-- Safe to run multiple times: each ALTER is gated on INFORMATION_SCHEMA so an
-- existing column is skipped (avoids MariaDB-only `ADD COLUMN IF NOT EXISTS`,
-- which MySQL 8.4 rejects -- see project_studio_migration_runner_bugs).
--
-- FRESH-DB ORDERING: apply_all_migrations.php runs database/*.sql in ALPHABETICAL
-- order, so this file ("add_...") is reached BEFORE scenario_files_migration.sql
-- ("scenario_...") creates the table it extends. Every statement below is
-- therefore additionally gated on `scenario_files` existing, and no-ops on a
-- fresh database; the next run (once the table exists) applies it for real.
-- Without that guard the whole file - which runs as ONE exec() batch because it
-- contains PREPARE - would abort on the first error and silently skip the rest.
-- Same reasoning as the go_subscription_active guard in add_client_app_columns.sql.
--
-- NOTE for the migrate.php runner: it strips `--` comments then splits on `;`,
-- so no statement below may contain a `;` or a `--` inside a quoted string.

SET @dbname = DATABASE();

-- Reused by every guard below: 0 when scenario_files does not exist yet.
SET @has_files = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files');

-- ─────────────────────────────────────────────────────────────────────────────
-- scenario_files.language -- which language THIS file is written in.
-- NULL = unspecified, treated as the scenario's default_language.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    @has_files = 0 OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files' AND COLUMN_NAME = 'language') > 0,
    'SELECT 1',
    'ALTER TABLE scenario_files ADD COLUMN language VARCHAR(8) NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- scenario_files.parent_file_id -- language variants of the same document.
-- NULL parent = this row IS the primary document. Exactly one level of nesting
-- (no variant-of-a-variant); the PHP validates that on upload.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    @has_files = 0 OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files' AND COLUMN_NAME = 'parent_file_id') > 0,
    'SELECT 1',
    'ALTER TABLE scenario_files ADD COLUMN parent_file_id INT NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    @has_files = 0 OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files' AND INDEX_NAME = 'idx_scenario_files_parent') > 0,
    'SELECT 1',
    'ALTER TABLE scenario_files ADD INDEX idx_scenario_files_parent (parent_file_id)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    @has_files = 0 OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files' AND CONSTRAINT_NAME = 'fk_scenario_files_parent') > 0,
    'SELECT 1',
    'ALTER TABLE scenario_files ADD CONSTRAINT fk_scenario_files_parent FOREIGN KEY (parent_file_id) REFERENCES scenario_files(id) ON DELETE CASCADE'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- scenario_files.name_i18n -- Localized<string> display title.
-- `name` STAYS the default-language string: download_zip entry names,
-- Content-Disposition and every legacy reader keep working untouched.
-- name_hashes is the translator staleness companion (lang -> fnv1a).
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    @has_files = 0 OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files' AND COLUMN_NAME = 'name_i18n') > 0,
    'SELECT 1',
    'ALTER TABLE scenario_files ADD COLUMN name_i18n JSON NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    @has_files = 0 OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files' AND COLUMN_NAME = 'name_hashes') > 0,
    'SELECT 1',
    'ALTER TABLE scenario_files ADD COLUMN name_hashes JSON NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- scenario_file_texts -- the strings printed inside a document, so a designer
-- can lay out a translated edition of the PDF.
--
-- A table rather than a JSON column on scenario_files: these are 1:N and
-- unbounded, they are the unit of the import/export row model, and they need a
-- database-issued STABLE id to survive a round-trip in which the translator
-- edits the source text itself (the source is otherwise the only key).
--
-- `values_i18n` / `hashes_i18n` are named around the reserved word VALUES.
-- Guarded (not a plain CREATE TABLE IF NOT EXISTS) because of the FK to
-- scenario_files -- see the FRESH-DB ORDERING note at the top.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    @has_files = 0,
    'SELECT 1',
    'CREATE TABLE IF NOT EXISTS scenario_file_texts (
       id INT AUTO_INCREMENT PRIMARY KEY,
       file_id INT NOT NULL,
       position INT NOT NULL DEFAULT 0,
       source_text TEXT NOT NULL,
       values_i18n JSON NULL,
       hashes_i18n JSON NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       FOREIGN KEY (file_id) REFERENCES scenario_files(id) ON DELETE CASCADE,
       INDEX idx_sft_file_position (file_id, position)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- scenarios.translation_meta -- per-path staleness hashes, shaped
-- { "<path>": { "<lang>": "<fnv1a>" } }.
--
-- Deliberately a COLUMN and NOT part of `data`: ScenarioHashes::computeDataHash
-- hashes data + medias + scenario_layout + game_type, so folding editorial
-- bookkeeping into `data` would change content_hash on every hash stamp and
-- make every synced playground re-download the whole scenario for nothing.
--
-- `scenarios` is created by migration.sql, which the runner always executes
-- first, so this one only needs the usual column guard.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios') = 0
    OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'translation_meta') > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN translation_meta JSON NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: every existing file is a primary in its scenario's default
-- language. Only touches rows with no language yet, so it is idempotent.
-- Guarded on the column existing, which on a fresh DB it will not.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    @has_files = 0 OR (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenario_files' AND COLUMN_NAME = 'language') = 0,
    'SELECT 1',
    'UPDATE scenario_files sf
        JOIN scenarios s ON s.id = sf.scenario_id
         SET sf.language = COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.data, ''$.default_language'')), ''null''), ''fr'')
       WHERE sf.language IS NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
