-- Defensive: ensure launched_game_raw_data has an index with launched_game_id
-- as the leftmost column. The cascade DELETE triggered by deleting a parent
-- launched_games row scans children by launched_game_id; without this index
-- the scan is O(N) over the whole table, which dominates delete latency for
-- clients with thousands of historical punches.
--
-- Original migration declares `INDEX idx_lgrd_game_id (launched_game_id, id)`,
-- and MySQL auto-creates one for FK columns regardless — so this is a no-op
-- on a healthy schema. It exists so a misconfigured or partially-migrated
-- database gets fixed.

SET @dbname = DATABASE();

SET @has_index = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = 'launched_game_raw_data'
      AND SEQ_IN_INDEX = 1
      AND COLUMN_NAME = 'launched_game_id'
);

SET @sql = IF(@has_index > 0,
    'SELECT 1',
    'ALTER TABLE launched_game_raw_data ADD INDEX idx_lgrd_game_id (launched_game_id, id)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
