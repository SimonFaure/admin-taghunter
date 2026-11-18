-- Events: per-session "show the game on the event page" switch.
-- When on (and the session has a scenario), the public session card shows the
-- scenario's cover and title.
--
-- PRODUCTION DEPLOY: run BEFORE the PHP that reads/writes event_slots.show_scenario
-- (npm run deploy does this). Safe to re-run.

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'event_slots' AND COLUMN_NAME = 'show_scenario') > 0,
    'SELECT 1',
    'ALTER TABLE event_slots ADD COLUMN show_scenario TINYINT(1) NOT NULL DEFAULT 0 AFTER scenario_id'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
