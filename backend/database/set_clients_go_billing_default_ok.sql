-- ─────────────────────────────────────────────────────────────────────────────
-- GO billing status defaults to "Up to date" (go_subscription_active = 1), like
-- Spot (spot_billing_ok DEFAULT 1) and Playground (billing_up_to_date). It used to
-- default to 0, so every new client showed GO as "Overdue".
--
-- WHY ONE-SHOT (and how it stays one-shot):
--   apply_all_migrations.php re-runs every database/*.sql on every deploy. Both the
--   ALTER and the UPDATE are gated on the column's current default still being '0'
--   - i.e. this migration has not run yet. After the first run the default is '1',
--   so every later run is a no-op and admin choices survive.
--
-- BACKFILL SCOPE: only clients that never had GO (go_enabled = 0) AND whose overdue
--   clock is empty or the '2000-01-01' sentinel stamped by add_client_app_columns.sql
--   (i.e. the 0 came from the old column default, not from an admin flipping it -
--   an admin flip stamps NOW()). Clients with GO enabled keep their status.
--
-- ORDERING: "set_..." sorts after add_taghunter_go_foundations.sql (creates the
--   column) and add_client_app_columns.sql (go_billing_overdue_since + sentinel).
--   If the column does not exist the guard is NULL → both statements no-op.
--
-- Contains PREPARE/EXECUTE → apply_all_migrations.php runs this file as ONE guarded
-- batch on a single connection (session @vars). Idempotent: safe to re-run.
-- PRODUCTION: paste into phpMyAdmin (or run apply_all_migrations.php).
-- ─────────────────────────────────────────────────────────────────────────────

SET @dbname = DATABASE();

-- Marker: the column's current default. '0' = this migration has not run yet.
SET @curdefault = (
    SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname
       AND TABLE_NAME   = 'clients'
       AND COLUMN_NAME  = 'go_subscription_active'
);

SET @hassince = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname
       AND TABLE_NAME   = 'clients'
       AND COLUMN_NAME  = 'go_billing_overdue_since'
);

-- Flip the default so newly created clients are "Up to date".
SET @sql = IF(@curdefault = '0',
    'ALTER TABLE clients ALTER go_subscription_active SET DEFAULT 1',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Move clients that never had GO off the old default (one time).
SET @sql = IF(@curdefault = '0',
    IF(@hassince > 0,
        'UPDATE clients SET go_subscription_active = 1, go_billing_overdue_since = NULL
          WHERE go_subscription_active = 0 AND go_enabled = 0
            AND (go_billing_overdue_since IS NULL OR go_billing_overdue_since = ''2000-01-01 00:00:00'')',
        'UPDATE clients SET go_subscription_active = 1
          WHERE go_subscription_active = 0 AND go_enabled = 0'),
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
