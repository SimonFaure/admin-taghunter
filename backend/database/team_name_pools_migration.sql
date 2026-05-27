-- Team Name Pools Migration
-- Curated pools of fun team names, segmented by audience (mini_kids/kids/ado_adultes)
-- and language. The playground draws a name from these pools at team creation
-- (auto-register / reuse-cards modes) instead of using the card's key_name.
--
-- Two tables:
--   1. team_name_pools       - one row per (scope, audience, language, name)
--                              scope = global catalog (client_id NULL) OR a client.
--   2. team_name_pools_meta  - per-scope version counter, bumped on any change,
--                              so the playground can sync incrementally.

CREATE TABLE IF NOT EXISTS `team_name_pools` (
    `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
    `client_id` INT NULL DEFAULT NULL,       -- NULL = global catalog; else client-owned
    `audience` ENUM('mini_kids','kids','ado_adultes') NOT NULL,  -- canonical game_public trio
    `language` VARCHAR(5) NOT NULL,          -- en, fr, es, ...
    `name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_scope` (`client_id`, `audience`, `language`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `team_name_pools_meta` (
    `scope_key` VARCHAR(64) NOT NULL,        -- 'global' or 'client:{id}'
    `current_version` DECIMAL(10,2) NOT NULL DEFAULT 0,  -- bumps +0.10 per change (like cards_version)
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`scope_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `team_name_pools_meta` (`scope_key`, `current_version`)
VALUES ('global', 0)
ON DUPLICATE KEY UPDATE `scope_key` = `scope_key`;
