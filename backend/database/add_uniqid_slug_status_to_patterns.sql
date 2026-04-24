-- patterns.php?action=upload writes pattern_uniqid, pattern_slug, and status;
-- this migration adds the columns if they don't already exist.

SET @dbname = DATABASE();

SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'patterns' AND COLUMN_NAME = 'pattern_uniqid') > 0,
  'SELECT 1',
  'ALTER TABLE patterns ADD COLUMN pattern_uniqid VARCHAR(64) NULL AFTER version, ADD INDEX idx_patterns_uniqid (pattern_uniqid)'
));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'patterns' AND COLUMN_NAME = 'pattern_slug') > 0,
  'SELECT 1',
  'ALTER TABLE patterns ADD COLUMN pattern_slug VARCHAR(255) NULL AFTER pattern_uniqid'
));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'patterns' AND COLUMN_NAME = 'status') > 0,
  'SELECT 1',
  "ALTER TABLE patterns ADD COLUMN status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft' AFTER is_default"
));
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
