-- Adds devices.operator_only: whether the playground device is an "operator-only"
-- device (used to manage/launch games but never to play them). Reported by the
-- playground heartbeat (telemetry.php → DeviceManager) and shown as a read-only
-- badge in studio's DevicesView. Defaults to 0 (plays games).
--
-- Safe to run multiple times: the ALTER is gated on INFORMATION_SCHEMA so an existing column is skipped.
-- (MySQL 8.4 rejects `ADD COLUMN IF NOT EXISTS` — see project_studio_migration_runner_bugs.)

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'operator_only') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN operator_only TINYINT(1) NOT NULL DEFAULT 0'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
