-- Display rename: the game mode is called "Quest", not "Tag Quest"/"TagQuest".
-- Only the human-readable name moves; the `tagquest` code stays the slug every
-- scenario, pattern, launched game and playground build keys off.
-- Retour 19 (project_ludiom_retours_go_spot).
--
-- Safe to run repeatedly: the UPDATE is gated on the old spellings, so a second
-- pass matches nothing. game_types_migration.sql re-seeds 'TagQuest' via
-- ON DUPLICATE KEY UPDATE and runs first alphabetically (g < r), so this file
-- lands after it and wins.

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'game_types') > 0,
    'UPDATE game_types SET name = ''Quest'' WHERE code = ''tagquest'' AND name IN (''TagQuest'', ''Tagquest'', ''Tag Quest'')',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
