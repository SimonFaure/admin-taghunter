-- "GO client only" client flag. When set, the client owns the Tag Hunter GO
-- product but NOT the full playground feature set, so the studio client portal
-- hides the playground-centric surfaces (My Patterns / My Cards / My Devices /
-- App Downloads / Settings, the scenarios list controls + filters, and the
-- extra scenario images). See memory project_go_client_only.
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB, BEFORE deploying the PHP that reads this column. Idempotent +
-- guarded (information_schema check, MySQL 8.4-safe - no MariaDB
-- "ADD COLUMN IF NOT EXISTS"), so it is safe on a fresh DB and safe to re-run.

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE clients ADD COLUMN go_client_only TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clients' AND COLUMN_NAME='go_client_only');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
