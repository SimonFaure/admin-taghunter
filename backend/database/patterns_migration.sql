-- Migration: Patterns
-- This table stores game patterns (default patterns and custom client/admin patterns)

CREATE TABLE IF NOT EXISTS patterns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    game_type VARCHAR(100) NOT NULL,
    pattern_data JSON NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    owner_type ENUM('admin', 'client', 'system') DEFAULT 'system',
    owner_id INT NULL,
    created_by_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_game_type (game_type),
    INDEX idx_is_default (is_default),
    INDEX idx_owner (owner_type, owner_id),
    INDEX idx_created_by_email (created_by_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
