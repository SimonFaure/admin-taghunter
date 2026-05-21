-- Add idempotency_key to launched_games so retries (network blip,
-- slow PHP response after COMMIT, etc.) don't create duplicate rows.
--
-- The client generates a UUID per launch attempt and passes it on every retry.
-- The server's `create` action looks up `(client_id, idempotency_key)` first
-- and returns the existing row if present; otherwise INSERTs with the key.
-- A UNIQUE(client_id, idempotency_key) index also guards against the
-- SELECT-then-INSERT race on the server.
--
-- The column is NULL-able so existing rows keep working. MySQL treats NULLs
-- as distinct in UNIQUE indexes, so the index doesn't collide on legacy rows.

SET @dbname = DATABASE();

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = 'launched_games'
      AND COLUMN_NAME = 'idempotency_key');

SET @sql = IF(@col_exists > 0,
    'SELECT 1',
    'ALTER TABLE launched_games ADD COLUMN idempotency_key VARCHAR(64) NULL AFTER client_id');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = @dbname
      AND TABLE_NAME = 'launched_games'
      AND INDEX_NAME = 'uniq_lg_client_idempotency');

SET @sql = IF(@idx_exists > 0,
    'SELECT 1',
    'ALTER TABLE launched_games ADD UNIQUE INDEX uniq_lg_client_idempotency (client_id, idempotency_key)');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
