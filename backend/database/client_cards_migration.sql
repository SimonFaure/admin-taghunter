CREATE TABLE IF NOT EXISTS client_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id VARCHAR(255) NOT NULL,
    card_name VARCHAR(255) NOT NULL DEFAULT '',
    card_type VARCHAR(100) NOT NULL DEFAULT '',
    card_rarity VARCHAR(100) NOT NULL DEFAULT '',
    card_power VARCHAR(50) NOT NULL DEFAULT '',
    card_description TEXT NOT NULL,
    additional_data JSON DEFAULT NULL,
    import_batch VARCHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_client_id (client_id),
    INDEX idx_import_batch (import_batch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
