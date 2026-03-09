-- Migration: Layouts
-- This table stores game layout configurations uploaded from the Creator tool

CREATE TABLE IF NOT EXISTS layouts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    layout_data JSON NOT NULL,
    game_type VARCHAR(100) NOT NULL,
    scenario_uniqid VARCHAR(255) NULL,
    status ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'draft',
    version VARCHAR(50) NOT NULL DEFAULT '1.0',
    owner_type ENUM('admin', 'client', 'system') DEFAULT 'system',
    owner_id INT NULL,
    created_by_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_game_type (game_type),
    INDEX idx_scenario_uniqid (scenario_uniqid),
    INDEX idx_status (status),
    INDEX idx_owner (owner_type, owner_id),
    INDEX idx_created_by_email (created_by_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
