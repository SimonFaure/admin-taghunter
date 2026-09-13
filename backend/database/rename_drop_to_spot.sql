-- Product rename: "Tag Hunter Drop" -> "Tag Hunter Spot". Brings an EXISTING
-- database (one that predates the rename) in line with the new naming; a fresh
-- DB is already created correctly by add_client_app_columns.sql /
-- add_spot_app_columns.sql / add_go_tutorial_slides.sql, and every branch below
-- is then a no-op. Design: project_taghunter_spot.
--
-- What moves:
--   clients.drop_enabled / drop_billing_ok / drop_billing_overdue_since /
--     drop_billing_grace_days           -> spot_*
--   go_scores.app / go_loads.app / go_tutorial_slides.app
--     ENUM('go','drop')                 -> ENUM('go','spot')  (rows remapped)
--   client_scenarios.mode 'drop'        -> 'spot'  (VARCHAR, plain UPDATE)
--   scenarios.data / game_meta JSON keys
--     "adaptable_drop" -> "adaptable_spot", "drop_question" -> "spot_question"
--
-- ORDERING NOTE (why each clients column has TWO guarded statements):
--   apply_all_migrations.php runs *.sql alphabetically, so
--   add_client_app_columns.sql runs BEFORE this file and, on a pre-rename DB,
--   will already have ADDed an empty spot_* column. So we handle both shapes:
--     - only drop_X exists            -> RENAME COLUMN drop_X TO spot_X
--     - drop_X AND spot_X both exist  -> copy drop_X into spot_X, then DROP drop_X
--   The DROP only ever runs after the copy, on a column whose data we just
--   moved -- it is the second half of a rename, not a data loss.
--
-- Safe to run multiple times: every change is gated on INFORMATION_SCHEMA or is
-- itself idempotent (MySQL 8.4 rejects MariaDB-only `IF EXISTS` on ALTER --
-- see project_studio_migration_runner_bugs).

SET @dbname = DATABASE();

-- ═════════════════════════ clients.drop_* -> spot_* ═════════════════════════

-- ── spot_enabled ────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_enabled') > 0
    AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'spot_enabled') > 0,
    'UPDATE clients SET spot_enabled = drop_enabled',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_enabled') = 0,
    'SELECT 1',
    IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'spot_enabled') > 0,
       'ALTER TABLE clients DROP COLUMN drop_enabled',
       'ALTER TABLE clients RENAME COLUMN drop_enabled TO spot_enabled')
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── spot_billing_ok ─────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_billing_ok') > 0
    AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'spot_billing_ok') > 0,
    'UPDATE clients SET spot_billing_ok = drop_billing_ok',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_billing_ok') = 0,
    'SELECT 1',
    IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'spot_billing_ok') > 0,
       'ALTER TABLE clients DROP COLUMN drop_billing_ok',
       'ALTER TABLE clients RENAME COLUMN drop_billing_ok TO spot_billing_ok')
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── spot_billing_overdue_since ──────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_billing_overdue_since') > 0
    AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'spot_billing_overdue_since') > 0,
    'UPDATE clients SET spot_billing_overdue_since = drop_billing_overdue_since',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_billing_overdue_since') = 0,
    'SELECT 1',
    IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'spot_billing_overdue_since') > 0,
       'ALTER TABLE clients DROP COLUMN drop_billing_overdue_since',
       'ALTER TABLE clients RENAME COLUMN drop_billing_overdue_since TO spot_billing_overdue_since')
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── spot_billing_grace_days ─────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_billing_grace_days') > 0
    AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'spot_billing_grace_days') > 0,
    'UPDATE clients SET spot_billing_grace_days = drop_billing_grace_days',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_billing_grace_days') = 0,
    'SELECT 1',
    IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'spot_billing_grace_days') > 0,
       'ALTER TABLE clients DROP COLUMN drop_billing_grace_days',
       'ALTER TABLE clients RENAME COLUMN drop_billing_grace_days TO spot_billing_grace_days')
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ═══════════════════ app ENUM('go','drop') -> ENUM('go','spot') ═════════════
-- Three steps per table: widen the ENUM so both values are legal, remap the
-- rows, then narrow it. Gated on the column still carrying 'drop', so a second
-- run does nothing.

-- ── go_loads.app ────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_loads' AND COLUMN_NAME = 'app'
         AND COLUMN_TYPE LIKE '%''drop''%') > 0,
    'ALTER TABLE go_loads MODIFY COLUMN app ENUM(''go'',''drop'',''spot'') NOT NULL DEFAULT ''go''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_loads' AND COLUMN_NAME = 'app'
         AND COLUMN_TYPE LIKE '%''drop''%') > 0,
    'UPDATE go_loads SET app = ''spot'' WHERE app = ''drop''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_loads' AND COLUMN_NAME = 'app'
         AND COLUMN_TYPE LIKE '%''drop''%') > 0,
    'ALTER TABLE go_loads MODIFY COLUMN app ENUM(''go'',''spot'') NOT NULL DEFAULT ''go''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── go_scores.app ───────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_scores' AND COLUMN_NAME = 'app'
         AND COLUMN_TYPE LIKE '%''drop''%') > 0,
    'ALTER TABLE go_scores MODIFY COLUMN app ENUM(''go'',''drop'',''spot'') NOT NULL DEFAULT ''go''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_scores' AND COLUMN_NAME = 'app'
         AND COLUMN_TYPE LIKE '%''drop''%') > 0,
    'UPDATE go_scores SET app = ''spot'' WHERE app = ''drop''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_scores' AND COLUMN_NAME = 'app'
         AND COLUMN_TYPE LIKE '%''drop''%') > 0,
    'ALTER TABLE go_scores MODIFY COLUMN app ENUM(''go'',''spot'') NOT NULL DEFAULT ''go''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── go_tutorial_slides.app ──────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_tutorial_slides' AND COLUMN_NAME = 'app'
         AND COLUMN_TYPE LIKE '%''drop''%') > 0,
    'ALTER TABLE go_tutorial_slides MODIFY COLUMN app ENUM(''go'',''drop'',''spot'') NOT NULL DEFAULT ''go''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_tutorial_slides' AND COLUMN_NAME = 'app'
         AND COLUMN_TYPE LIKE '%''drop''%') > 0,
    'UPDATE go_tutorial_slides SET app = ''spot'' WHERE app = ''drop''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'go_tutorial_slides' AND COLUMN_NAME = 'app'
         AND COLUMN_TYPE LIKE '%''drop''%') > 0,
    'ALTER TABLE go_tutorial_slides MODIFY COLUMN app ENUM(''go'',''spot'') NOT NULL DEFAULT ''go''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ═════════════════ client_scenarios.mode 'drop' -> 'spot' ═══════════════════
-- Plain VARCHAR(16), so a straight UPDATE. Idempotent by its own WHERE.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'client_scenarios' AND COLUMN_NAME = 'mode') > 0,
    'UPDATE client_scenarios SET mode = ''spot'' WHERE mode = ''drop''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ══════════════════ scenarios JSON: authored Spot fields ════════════════════
-- `adaptable_drop` (the editor's "Adaptable à Spot" flag) and each enigma's
-- `drop_question` live inside the scenarios.data JSON blob (and the legacy
-- game_meta column). A textual REPLACE on the quoted KEY is exact: those two
-- strings only ever appear as object keys, and everything else in the document
-- is left byte-identical. Idempotent -- after the first pass the LIKE matches
-- nothing.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'data') > 0,
    'UPDATE scenarios SET data = REPLACE(REPLACE(data, ''"adaptable_drop"'', ''"adaptable_spot"''), ''"drop_question"'', ''"spot_question"'') WHERE data LIKE ''%"adaptable_drop"%'' OR data LIKE ''%"drop_question"%''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'game_meta') > 0,
    'UPDATE scenarios SET game_meta = REPLACE(REPLACE(game_meta, ''"adaptable_drop"'', ''"adaptable_spot"''), ''"drop_question"'', ''"spot_question"'') WHERE game_meta LIKE ''%"adaptable_drop"%'' OR game_meta LIKE ''%"drop_question"%''',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
