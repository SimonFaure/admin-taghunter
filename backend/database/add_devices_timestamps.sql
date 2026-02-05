-- Add created_at and updated_at to devices table if they don't exist

-- Check and add created_at column
SET @col_exists = 0;
SELECT COUNT(*) INTO @col_exists
FROM INFORMATION_SCHEMA.COLUMNS
WHERE table_schema = DATABASE()
AND table_name = 'devices'
AND column_name = 'created_at';

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE devices ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER device_uniq',
    'SELECT "created_at column already exists" AS message');
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

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE devices ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
    'SELECT "updated_at column already exists" AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
