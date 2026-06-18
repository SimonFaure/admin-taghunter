-- Per-content hashes for incremental scenario sync (CAS).
--
-- Adds three columns to `scenarios`:
--   data_hash     CHAR(64)  sha256 of the inputs that determine the served game_data
--                           (data + medias + scenario_layout + game_type). The
--                           playground keys its game-data.json blob by this and
--                           uses it as the "did the data change" signal.
--   content_hash  CHAR(64)  Tier-1 gate value: sha256 over data_hash + sorted
--                           (filename:file_hash) of every top-level media file.
--                           Cheap "did anything in this scenario change" check
--                           shipped in the aggregate manifest.
--   media_hashes  LONGTEXT  JSON map { "<filename>": {"h":<sha256>,"s":<size>,"m":<mtime>} }
--                           for the flat top-level files in media/{uniqid}/ — the
--                           exact set the playground mirrors. `s`/`m` let the
--                           recompute helper skip re-hashing untouched big files.
--
-- All three are kept current by utils/ScenarioHashes.php::recompute(), called
-- from every scenario write path. The legacy `version` column is untouched
-- (display only). MySQL 8.x has no ADD COLUMN IF NOT EXISTS, so each ALTER is
-- gated on INFORMATION_SCHEMA. Idempotent.

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'data_hash') > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN `data_hash` CHAR(64) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'content_hash') > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN `content_hash` CHAR(64) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = 'media_hashes') > 0,
    'SELECT 1',
    'ALTER TABLE scenarios ADD COLUMN `media_hashes` LONGTEXT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
