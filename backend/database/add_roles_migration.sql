-- Add Roles to Admin Users
-- This migration adds a role column to admin_users table

-- Check and add role column if it doesn't exist
SET @dbname = DATABASE();
SET @tablename = 'admin_users';
SET @columnname = 'role';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' ENUM(''admin'', ''editor'', ''viewer'') DEFAULT ''editor'' NOT NULL AFTER name')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Update existing admin user to have admin role
UPDATE admin_users
SET role = 'admin'
WHERE email = 'admin@taghunter.fr';
