-- Migration to add user_type support to auth_tokens table
-- This allows authentication for both clients and admin users

SET @dbname = DATABASE();
SET @tablename = 'auth_tokens';

-- Step 1: Drop foreign key constraint if it exists (must be done before renaming)
SET @constraintname = (
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = 'client_id'
    AND REFERENCED_TABLE_NAME = 'clients'
    LIMIT 1
);

SET @preparedStatement = (SELECT IF(
    @constraintname IS NOT NULL,
    CONCAT('ALTER TABLE ', @tablename, ' DROP FOREIGN KEY ', @constraintname),
    'SELECT 1'
));
PREPARE dropFKIfExists FROM @preparedStatement;
EXECUTE dropFKIfExists;
DEALLOCATE PREPARE dropFKIfExists;

-- Step 2: Rename client_id to user_id if needed
SET @columnname = 'client_id';
SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @dbname
        AND TABLE_NAME = @tablename
        AND COLUMN_NAME = @columnname
    ) > 0,
    CONCAT('ALTER TABLE ', @tablename, ' CHANGE COLUMN client_id user_id INT NOT NULL'),
    'SELECT 1'
));
PREPARE renameIfExists FROM @preparedStatement;
EXECUTE renameIfExists;
DEALLOCATE PREPARE renameIfExists;

-- Step 3: Add user_type column if it doesn't exist
SET @columnname = 'user_type';
SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @dbname
        AND TABLE_NAME = @tablename
        AND COLUMN_NAME = @columnname
    ) > 0,
    'SELECT 1',
    CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(20) DEFAULT ''client'' AFTER user_id')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Step 4: Drop old index on client_id if it exists
SET @indexname = 'idx_client_id';
SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = @dbname
        AND TABLE_NAME = @tablename
        AND INDEX_NAME = @indexname
    ) > 0,
    CONCAT('ALTER TABLE ', @tablename, ' DROP INDEX ', @indexname),
    'SELECT 1'
));
PREPARE dropIndexIfExists FROM @preparedStatement;
EXECUTE dropIndexIfExists;
DEALLOCATE PREPARE dropIndexIfExists;

-- Step 5: Create index on user_id if it doesn't exist
SET @indexname = 'idx_user_id';
SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = @dbname
        AND TABLE_NAME = @tablename
        AND INDEX_NAME = @indexname
    ) = 0,
    CONCAT('CREATE INDEX ', @indexname, ' ON ', @tablename, ' (user_id)'),
    'SELECT 1'
));
PREPARE createIndexIfNotExists FROM @preparedStatement;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

-- Step 6: Create index on user_type if it doesn't exist
SET @indexname = 'idx_user_type';
SET @preparedStatement = (SELECT IF(
    (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @dbname
        AND TABLE_NAME = @tablename
        AND COLUMN_NAME = 'user_type'
    ) > 0 AND (
        SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = @dbname
        AND TABLE_NAME = @tablename
        AND INDEX_NAME = @indexname
    ) = 0,
    CONCAT('CREATE INDEX ', @indexname, ' ON ', @tablename, ' (user_type)'),
    'SELECT 1'
));
PREPARE createIndexIfNotExists2 FROM @preparedStatement;
EXECUTE createIndexIfNotExists2;
DEALLOCATE PREPARE createIndexIfNotExists2;
