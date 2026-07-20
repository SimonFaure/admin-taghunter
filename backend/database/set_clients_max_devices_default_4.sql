-- ─────────────────────────────────────────────────────────────────────────────
-- Raise the per-client Playground device cap default from 2 to 4, and backfill
-- the whole existing client base to 4 (one time only).
--
-- WHY ONE-SHOT (and how it stays one-shot):
--   apply_all_migrations.php re-runs every database/*.sql on every deploy. A plain
--   `UPDATE clients SET max_devices = 4` would therefore clobber any value an admin
--   later sets in the Studio (ClientDetailView → Playground → Max devices) back to 4
--   on the next deploy. To prevent that, BOTH the ALTER and the UPDATE are gated on
--   the column's current default still being '2' - i.e. this migration has not run
--   yet. After the first run the default is '4', so every later run is a no-op and
--   admin customizations survive.
--
-- ORDERING: must run AFTER add_playground_device_auth_migration.sql (which creates
--   clients.max_devices DEFAULT 2). The "set_" filename sorts after "add_", and the
--   guard reads INFORMATION_SCHEMA so if the column somehow does not exist yet the
--   condition is NULL → both statements no-op rather than error.
--
-- Contains PREPARE/EXECUTE → apply_all_migrations.php runs this file as ONE guarded
-- batch on a single connection (session @vars). Idempotent: safe to re-run.
-- Design: project_playground_max_devices_admin.
-- ─────────────────────────────────────────────────────────────────────────────

SET @dbname = DATABASE();

-- Marker: the column's current default. '2' = this migration has not run yet.
SET @curdefault = (
    SELECT COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @dbname
       AND TABLE_NAME   = 'clients'
       AND COLUMN_NAME  = 'max_devices'
);

-- Bump the default so newly created clients get 4.
SET @sql = IF(@curdefault = '2',
    'ALTER TABLE clients ALTER max_devices SET DEFAULT 4',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill ALL existing clients to 4 (one time). This intentionally overwrites any
-- previously customized value, because before this migration max_devices was never
-- admin-editable, so every stored value is the legacy default and carries no intent.
SET @sql = IF(@curdefault = '2',
    'UPDATE clients SET max_devices = 4',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
