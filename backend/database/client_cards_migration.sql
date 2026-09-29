-- Superseded by cards_rows_migration.sql. This file used to create an abandoned
-- "card_name / card_type / card_rarity" client_cards schema; api/migrate.php
-- still lists it, so it now creates the real row-based table instead
-- (IF NOT EXISTS: never touches existing rows).
CREATE TABLE IF NOT EXISTS client_cards (
    client_id INT NOT NULL,
    id INT NOT NULL,
    key_number INT NOT NULL,
    key_name VARCHAR(255) NOT NULL,
    color VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (client_id, id),
    UNIQUE KEY uniq_client_keynum (client_id, key_number),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
