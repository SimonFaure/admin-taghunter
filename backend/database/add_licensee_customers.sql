-- Licensee customers ("Clients" in the FR UI): the licensee's OWN customers
-- (companies, schools, associations...). NOT to be confused with `clients`,
-- which is the licensee itself.
-- Companion: backend/apply_licensee_customers_migration.php
--
--   customer_types           admin-managed customer types (code + FR/EN/ES labels).
--   licensee_customers       one row per customer. UUID id (playgrounds create
--                            them offline). Merge = tombstone (merged_into_id
--                            always points at a final, non-merged row). Delete is
--                            soft (deleted_at) and only allowed with 0 games.
--   licensee_customers_meta  per-licensee version counter, bumped on every change
--                            that devices must see (manifest `customers_version`).
--   game_summaries.customer_* the game -> customer assignment. customer_assigned_at
--                            (UTC, ms) decides between studio and playground edits:
--                            strictly newest wins.
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB, BEFORE deploying the PHP that reads these tables. Idempotent +
-- guarded (information_schema check, MySQL 8.4-safe - no MariaDB
-- "ADD COLUMN IF NOT EXISTS"), so it is safe on a fresh DB and safe to re-run.
-- Must run after add_game_summaries_table.sql (alphabetical order does that).

-- Customer types: admin-managed list (admin Settings). `code` is stable and
-- stored on licensee_customers.customer_type; labels per UI language (en/es
-- fall back to fr). active=0 hides a type from pickers, customers keep it.
CREATE TABLE IF NOT EXISTS customer_types (
    code VARCHAR(40) NOT NULL PRIMARY KEY,
    label_fr VARCHAR(80) NOT NULL,
    label_en VARCHAR(80) NULL,
    label_es VARCHAR(80) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO customer_types (code, label_fr, label_en, label_es, sort_order) VALUES
    ('company', 'Entreprise', 'Company', 'Empresa', 10),
    ('school', 'École', 'School', 'Escuela', 20),
    ('association', 'Association', 'Association', 'Asociación', 30),
    ('private', 'Particulier', 'Private individual', 'Particular', 40),
    ('other', 'Autre', 'Other', 'Otro', 50);

CREATE TABLE IF NOT EXISTS licensee_customers (
    id CHAR(36) NOT NULL,
    client_id INT NOT NULL,
    name VARCHAR(190) NOT NULL,
    customer_type VARCHAR(40) NULL,
    contact_name VARCHAR(190) NULL,
    email VARCHAR(190) NULL,
    phone VARCHAR(50) NULL,
    city VARCHAR(120) NULL,
    notes TEXT NULL,
    archived TINYINT(1) NOT NULL DEFAULT 0,
    merged_into_id CHAR(36) NULL,
    deleted_at DATETIME NULL,
    created_source VARCHAR(16) NOT NULL DEFAULT 'studio',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_lc_client_name (client_id, name),
    KEY idx_lc_client_state (client_id, archived, merged_into_id, deleted_at),
    CONSTRAINT fk_lc_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS licensee_customers_meta (
    client_id INT NOT NULL PRIMARY KEY,
    current_version INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_lcm_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Early builds of this file had customer_type as a fixed ENUM.
SET @s := (SELECT IF(COUNT(*)=1,
  'ALTER TABLE licensee_customers MODIFY customer_type VARCHAR(40) NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='licensee_customers' AND COLUMN_NAME='customer_type'
    AND DATA_TYPE='enum');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE game_summaries ADD COLUMN customer_id CHAR(36) NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='game_summaries' AND COLUMN_NAME='customer_id');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE game_summaries ADD COLUMN customer_assigned_at DATETIME(3) NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='game_summaries' AND COLUMN_NAME='customer_assigned_at');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE game_summaries ADD COLUMN customer_assigned_source VARCHAR(16) NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='game_summaries' AND COLUMN_NAME='customer_assigned_source');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE game_summaries ADD INDEX idx_gs_client_customer (client_id, customer_id, played_at)',
  'DO 0') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='game_summaries' AND INDEX_NAME='idx_gs_client_customer');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
