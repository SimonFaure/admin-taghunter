-- Adds company logo support to clients:
--   company_logo_url         - optional uploaded logo (TEXT NULL)
--   company_logo_uses_avatar - when TRUE (the default), the active brand image falls back to
--                              clients.avatar_url even if company_logo_url is set. Toggling this
--                              preference is non-destructive (the uploaded file is preserved).
--
-- Resolution rule (mirrored in PHP):
--   useAvatar = company_logo_url IS NULL OR company_logo_uses_avatar = 1
--   brand_logo_url = useAvatar ? avatar_url : company_logo_url
--
-- Safe to run multiple times.

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'company_logo_url') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN company_logo_url TEXT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'company_logo_uses_avatar') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN company_logo_uses_avatar TINYINT(1) NOT NULL DEFAULT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
