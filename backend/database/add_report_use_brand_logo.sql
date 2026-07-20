-- "Use my logo on printed reports" client flag. When set, the playground swaps
-- the bundled TagHunter logo on printed mission reports for the client's resolved
-- brand image (uploaded company logo, else avatar - same resolution as
-- auth_state.brand_logo_url). White-labels ALL reports (custom + product
-- scenarios). See memory project_report_layouts_editor_labels.
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB, BEFORE deploying the PHP that reads this column. Idempotent +
-- guarded (information_schema check, MySQL 8.4-safe - no MariaDB
-- "ADD COLUMN IF NOT EXISTS"), so it is safe on a fresh DB and safe to re-run.

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE clients ADD COLUMN report_use_brand_logo TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clients' AND COLUMN_NAME='report_use_brand_logo');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
