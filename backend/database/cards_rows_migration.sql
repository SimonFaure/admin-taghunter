-- Row-based cards table. Replaces the per-client CSV file storage at
-- cards/{clientId}/cards_v{N}.csv. Each row is one physical SI chip.
-- The DROP below makes this migration idempotent regardless of whether
-- the legacy abandoned client_cards table was ever created.
DROP TABLE IF EXISTS client_cards;

CREATE TABLE client_cards (
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
