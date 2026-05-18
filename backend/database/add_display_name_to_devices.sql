-- Adds devices.display_name (user-given device name, distinct from device_label which the
-- playground overwrites from OS hostname on every bootstrap). Rendered name in the UI is
-- display_name ?? device_label.
--
-- Safe to run multiple times: the ALTER is gated on INFORMATION_SCHEMA so an existing column is skipped.

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'display_name') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN display_name VARCHAR(120) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
