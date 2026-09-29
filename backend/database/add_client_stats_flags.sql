-- Per-client statistics flags (admin > client page > Client Details).
--   stats_excluded_global: the client's games are still recorded and visible
--     on their own Statistics page (and to an admin filtering on that client),
--     but are left out of the fleet-wide admin statistics.
--   stats_disabled: the client's game stats are not recorded at all -
--     telemetry acks `launch` / `game_summary` events and drops them. Also
--     implies exclusion from the global stats.
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB, BEFORE deploying the PHP that reads these columns. Idempotent +
-- guarded (information_schema check, MySQL 8.4-safe - no MariaDB
-- "ADD COLUMN IF NOT EXISTS"), so it is safe on a fresh DB and safe to re-run.

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE clients ADD COLUMN stats_excluded_global TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clients' AND COLUMN_NAME='stats_excluded_global');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE clients ADD COLUMN stats_disabled TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clients' AND COLUMN_NAME='stats_disabled');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
