-- Licensee Mystery scoring defaults (licensee > "Barème Mystery", admin > licensee page).
--   clients.mystery_scoring JSON:
--     {
--       "by_age":      { "age_8_10": { "malus_both_answers_biped": -3, "malus_no_answer": -1,
--                                      "good_answer_points": 10, "wrong_answer_points": -5 }, ... },
--       "by_scenario": { "<scenario uniqid>": { same four keys } }
--     }
--   A missing key / null = not set (falls through). Shipped to the playground in
--   the get_user_data_update manifest (`mystery_scoring`), where it overrides the
--   scenario's own values: scenario row > age band (scenario's youngest) > scenario.
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB, BEFORE deploying the PHP that reads this column. Idempotent +
-- guarded (information_schema check, MySQL 8.4-safe), safe to re-run.

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE clients ADD COLUMN mystery_scoring JSON NULL DEFAULT NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clients' AND COLUMN_NAME='mystery_scoring');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
