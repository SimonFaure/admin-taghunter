-- Add status column to scenarios table
-- Status represents the publication/lifecycle state of a scenario sent from Creator
-- Possible values are draft, published, archived (or any string sent by Creator)
--
-- NOTE: MySQL 8.x does NOT support `ADD COLUMN IF NOT EXISTS` (that is MariaDB
-- syntax), so we gate the ALTER on INFORMATION_SCHEMA instead. Idempotent.

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'status') > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT ''draft'''
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
