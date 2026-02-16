-- Add created_at and updated_at to devices table if they don't exist
-- This migration is for legacy devices tables. New tables already have these columns.

-- Check if table exists first
SET @table_exists = 0;
SELECT COUNT(*) INTO @table_exists
FROM INFORMATION_SCHEMA.TABLES
WHERE table_schema = DATABASE()
AND table_name = 'devices';

-- Only proceed if table exists
SET @skip_migration = IF(@table_exists = 0, 1, 0);

-- Check and add created_at column
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE table_schema = DATABASE()
AND table_name = 'devices'
AND column_name = 'created_at';

SET @sql = IF(@col_exists = 0 AND @skip_migration = 0,
    'ALTER TABLE devices ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
    'SELECT "created_at column already exists or table does not exist" AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and add updated_at column
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE table_schema = DATABASE()
AND table_name = 'devices'
AND column_name = 'updated_at';

SET @sql = IF(@col_exists = 0 AND @skip_migration = 0,
    'ALTER TABLE devices ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    'SELECT "updated_at column already exists or table does not exist" AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
