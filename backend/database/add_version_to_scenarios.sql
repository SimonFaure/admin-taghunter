-- Add version column to scenarios table
--
-- NOTE: MySQL 8.x does NOT support `ADD COLUMN IF NOT EXISTS` (that is MariaDB
-- syntax), so we gate the ALTER on INFORMATION_SCHEMA instead. Idempotent.

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'version') > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN `version` VARCHAR(50) NULL DEFAULT ''1.0'''
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
