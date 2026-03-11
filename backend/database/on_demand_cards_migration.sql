-- On Demand Cards Migration
-- Creates the three tables needed for the on-demand cards pool feature:
--   1. on_demand_cards_pool       - stores all cards uploaded via CSV (versioned)
--   2. on_demand_cards_pool_meta  - tracks the current active pool version
--   3. client_on_demand_cards     - tracks which cards are assigned to which client

CREATE TABLE IF NOT EXISTS `on_demand_cards_pool` (
    `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
    `key_name` VARCHAR(255) NOT NULL DEFAULT '',
    `color` VARCHAR(100) NOT NULL DEFAULT '',
    `key_number` VARCHAR(100) NOT NULL DEFAULT '',
    `card_id` VARCHAR(100) NOT NULL DEFAULT '',
    `pool_version` INT NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_pool_version` (`pool_version`),
    INDEX `idx_key_number` (`key_number`),
    INDEX `idx_card_id` (`card_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `on_demand_cards_pool_meta` (
    `id` INT NOT NULL DEFAULT 1,
    `current_version` INT NOT NULL DEFAULT 0,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `on_demand_cards_pool_meta` (`id`, `current_version`)
VALUES (1, 0)
ON DUPLICATE KEY UPDATE `id` = `id`;

CREATE TABLE IF NOT EXISTS `client_on_demand_cards` (
    `id` VARCHAR(36) NOT NULL DEFAULT (UUID()),
    `client_id` INT NOT NULL,
    `pool_card_id` VARCHAR(36) NOT NULL,
    `end_date` DATE NULL DEFAULT NULL,
    `assigned_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `assigned_by` VARCHAR(255) NULL DEFAULT NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_client_id` (`client_id`),
    INDEX `idx_pool_card_id` (`pool_card_id`),
    CONSTRAINT `fk_client_on_demand_pool_card`
        FOREIGN KEY (`pool_card_id`)
        REFERENCES `on_demand_cards_pool` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
