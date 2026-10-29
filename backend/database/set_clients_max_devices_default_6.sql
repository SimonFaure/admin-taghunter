-- ─────────────────────────────────────────────────────────────────────────────
-- Raise the per-client Playground device cap default from 4 to 6, and move every
-- existing client still sitting on the old default (4) to 6 (one time only).
--
-- WHY ONE-SHOT (and how it stays one-shot):
--   apply_all_migrations.php re-runs every database/*.sql on every deploy. Both the
--   ALTER and the UPDATE are gated on the column's current default still being '4'
--   - i.e. this migration has not run yet. After the first run the default is '6',
--   so every later run is a no-op and admin customizations survive.
--
-- BACKFILL SCOPE: only rows with max_devices = 4 (the previous default). Clients an
--   admin set to any other value keep it.
--
-- ORDERING: must run AFTER set_clients_max_devices_default_4.sql (which moves the
--   default 2 → 4). "..._6" sorts after "..._4", so a fresh DB goes 2 → 4 → 6 in one
--   deploy. If the column does not exist the guard is NULL → both statements no-op.
--
-- Contains PREPARE/EXECUTE → apply_all_migrations.php runs this file as ONE guarded
-- batch on a single connection (session @vars). Idempotent: safe to re-run.
-- Design: project_playground_max_devices_admin.
-- ─────────────────────────────────────────────────────────────────────────────

SET @dbname = DATABASE();

-- Marker: the column's current default. '4' = this migration has not run yet.
SET @curdefault = (
    SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname
       AND TABLE_NAME   = 'clients'
       AND COLUMN_NAME  = 'max_devices'
);

-- Bump the default so newly created clients get 6.
SET @sql = IF(@curdefault = '4',
    'ALTER TABLE clients ALTER max_devices SET DEFAULT 6',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Move clients still on the old default to the new one (one time).
SET @sql = IF(@curdefault = '4',
    'UPDATE clients SET max_devices = 6 WHERE max_devices = 4',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
