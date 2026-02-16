-- Fix client_id data type in client_cards_metadata table
-- Change from VARCHAR(255) to INT to match clients table

-- Check if table exists first
SET @table_exists = 0;
SELECT COUNT(*) INTO @table_exists
FROM INFORMATION_SCHEMA.TABLES
WHERE table_schema = DATABASE()
AND table_name = 'client_cards_metadata';

-- Only proceed if table exists
SET @sql = IF(@table_exists > 0,
    'ALTER TABLE client_cards_metadata MODIFY COLUMN client_id INT NOT NULL',
    'SELECT "Table does not exist yet" AS message');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
