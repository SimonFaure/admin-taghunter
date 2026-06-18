-- Launched-games / multiplayer state migration
-- Slice 3 of the playground rewrite: lifts the 5 launched-games tables off
-- Supabase Postgres into studio MySQL with per-client scoping via JWT.
--
-- Tables created (skipped if already present):
--   launched_games            : per-game lifecycle (client-scoped)
--   launched_game_meta        : KV config bag per game
--   launched_game_devices     : tablets participating in a game
--   launched_game_raw_data    : punch event audit log
--   teams                     : team rosters + scores per game
--
-- All child tables FK ON DELETE CASCADE → launched_games(id), so a single
-- DELETE on the parent removes everything cleanly. launched_games itself
-- cascades from clients(id) and devices(id) (slice 1's tables).
--
-- Idempotent: each CREATE is gated on INFORMATION_SCHEMA so re-running is
-- safe. Foreign keys are added defensively; if a table already exists from
-- a prior partial run we ALTER to add anything missing.

SET @dbname = DATABASE();

-- ─────────────────────────────────────────────────────────────────────────────
-- launched_games
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'launched_games') > 0,
    'SELECT 1',
    'CREATE TABLE launched_games (
        id INT AUTO_INCREMENT PRIMARY KEY,
        client_id INT NOT NULL,
        game_uniqid VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        number_of_teams INT NOT NULL,
        game_type VARCHAR(40) NOT NULL,
        duration INT NOT NULL,
        start_time DATETIME NULL,
        started TINYINT(1) NOT NULL DEFAULT 0,
        ended TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_launched_games_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
        INDEX idx_lg_client_ended (client_id, ended),
        INDEX idx_lg_client_created (client_id, created_at DESC)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- launched_game_meta
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'launched_game_meta') > 0,
    'SELECT 1',
    'CREATE TABLE launched_game_meta (
        id INT AUTO_INCREMENT PRIMARY KEY,
        launched_game_id INT NOT NULL,
        meta_name VARCHAR(64) NOT NULL,
        meta_value TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_lgm_game FOREIGN KEY (launched_game_id) REFERENCES launched_games(id) ON DELETE CASCADE,
        INDEX idx_lgm_game_name (launched_game_id, meta_name)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- launched_game_devices
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'launched_game_devices') > 0,
    'SELECT 1',
    'CREATE TABLE launched_game_devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        launched_game_id INT NOT NULL,
        device_id INT NOT NULL,
        connected TINYINT(1) NOT NULL DEFAULT 1,
        last_connection_attempt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_lgd_game FOREIGN KEY (launched_game_id) REFERENCES launched_games(id) ON DELETE CASCADE,
        CONSTRAINT fk_lgd_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        UNIQUE KEY uniq_lgd_game_device (launched_game_id, device_id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- launched_game_raw_data
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'launched_game_raw_data') > 0,
    'SELECT 1',
    'CREATE TABLE launched_game_raw_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        launched_game_id INT NOT NULL,
        device_id INT NOT NULL,
        raw_data JSON NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_lgrd_game FOREIGN KEY (launched_game_id) REFERENCES launched_games(id) ON DELETE CASCADE,
        CONSTRAINT fk_lgrd_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
        INDEX idx_lgrd_game_id (launched_game_id, id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- teams
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'teams') > 0,
    'SELECT 1',
    'CREATE TABLE teams (
        id INT AUTO_INCREMENT PRIMARY KEY,
        launched_game_id INT NOT NULL,
        team_number INT NOT NULL,
        team_name VARCHAR(120) NULL,
        pattern INT NOT NULL,
        score INT NOT NULL DEFAULT 0,
        key_id INT NULL,
        start_time BIGINT NULL,
        end_time BIGINT NULL,
        language VARCHAR(8) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_teams_game FOREIGN KEY (launched_game_id) REFERENCES launched_games(id) ON DELETE CASCADE,
        INDEX idx_teams_game (launched_game_id),
        INDEX idx_teams_game_team (launched_game_id, team_number)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- teams.language: per-team display language (added defensively for installs that
-- created `teams` before this column existed). NULL ⇒ launch language fallback.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'teams' AND COLUMN_NAME = 'language') > 0,
    'SELECT 1',
    'ALTER TABLE teams ADD COLUMN language VARCHAR(8) NULL AFTER end_time'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- team_completed_quests: per-team quest completion log used by tagquest scoring.
-- speed mode → unique (team_id, quest_number) so a quest is only credited once.
-- score mode → multiple rows allowed for the same quest (re-completion).
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'team_completed_quests') > 0,
    'SELECT 1',
    'CREATE TABLE team_completed_quests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        launched_game_id INT NOT NULL,
        team_id INT NOT NULL,
        teammate_chip_id INT NULL,
        quest_id INT NULL,
        quest_number VARCHAR(40) NOT NULL,
        points_awarded INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_tcq_game FOREIGN KEY (launched_game_id) REFERENCES launched_games(id) ON DELETE CASCADE,
        CONSTRAINT fk_tcq_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        INDEX idx_tcq_game (launched_game_id),
        INDEX idx_tcq_team (team_id),
        INDEX idx_tcq_team_quest (team_id, quest_number)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
