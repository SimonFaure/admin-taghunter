-- Idempotent add of layout_uniqid column to default_config.
-- Used by the Creator when publishing layouts as default configs.

SET @dbname = DATABASE();
SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname
     AND TABLE_NAME = 'default_config'
     AND COLUMN_NAME = 'layout_uniqid') > 0,
  'SELECT 1',
  'ALTER TABLE default_config ADD COLUMN layout_uniqid VARCHAR(64) NULL AFTER version'
));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
