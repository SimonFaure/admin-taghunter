-- Adds devices.default_mother_since: when the device was designated the
-- licensee's mother ("Rôle de ce poste → Poste mère" in the playground).
--
-- There is one mother per licensee. playground.php?action=set_default_mother
-- now clears is_default_mother on the licensee's other devices and stamps this
-- column with the server time, so a device that was the mother before can tell
-- that the role was given to another one AFTER it (it then becomes a
-- satellite). Rows flagged before this column existed keep NULL: nothing is
-- inferred from them, and no existing flag is changed by this migration.
--
-- Safe to run multiple times: the ALTER is gated on INFORMATION_SCHEMA so an existing column is skipped.
-- (MySQL 8.4 rejects `ADD COLUMN IF NOT EXISTS` - see project_studio_migration_runner_bugs.)

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'default_mother_since') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN default_mother_since DATETIME NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
