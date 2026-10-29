-- GO / Spot player language selection, PER SCENARIO.
-- Design: project_go_spot_player_languages.
--
-- client_scenarios.player_languages - the language policy of one grant row,
-- i.e. one (client, scenario, app): GO and Spot set it independently, exactly
-- like client_scenarios.durations.
--   {"enabled": true,  "languages": ["fr","en"]}  the setup screen offers a
--       language picker, limited to those codes (∩ the scenario's languages);
--       an empty list = every language the scenario has.
--   {"enabled": false, "languages": [...]}        no picker: the team plays in
--       the licensee's language (clients.language) when the scenario has it,
--       else in the scenario's default language.
-- NULL = OFF (no picker): the default for every grant, existing ones included,
-- until the operator turns it on.
--
-- Safe to run multiple times: gated on INFORMATION_SCHEMA (MySQL 8.4 rejects
-- MariaDB-only ADD COLUMN IF NOT EXISTS - see project_studio_migration_runner_bugs).

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'client_scenarios' AND COLUMN_NAME = 'player_languages') > 0,
    'SELECT 1',
    'ALTER TABLE client_scenarios ADD COLUMN player_languages JSON NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
