-- Row-based cards table. Replaces the per-client CSV file storage at
-- cards/{clientId}/cards_v{N}.csv. Each row is one physical SI chip.
--
-- NON-DESTRUCTIVE: apply_all_migrations.php replays every *.sql on each
-- deploy, so this file must never touch a live row-based table. It used to
-- start with an unconditional DROP TABLE, which wiped every client's cards on
-- each deploy (fixed 2026-09-16). Now the table is only moved aside (renamed to
-- client_cards_legacy, never dropped) when it is the legacy abandoned shape (no
-- key_number column), then CREATE IF NOT EXISTS.

SET @s := (SELECT IF(COUNT(*) > 0 AND SUM(COLUMN_NAME = 'key_number') = 0,
  'RENAME TABLE client_cards TO client_cards_legacy',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_cards');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

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
