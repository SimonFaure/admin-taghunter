-- Commandes: equipment sale ("Matériel supplémentaire & back up") and rental
-- ("Location de matériel") order REQUESTS from licensees. No online payment:
-- Taghunter confirms and invoices outside Studio. Memory:
-- project_studio_commandes_equipment_orders.
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB BEFORE deploying the PHP that reads these tables. Only CREATE TABLE
-- IF NOT EXISTS + INSERT IGNORE, so it is safe to re-run.
--
-- Money is integer cents EXCLUDING VAT (HT), in EUR. Dates are UTC except
-- rent_start/rent_end, which are plain calendar dates.

-- Admin-defined sections shown on both licensee pages ("Puces", "Lecteurs"...).
CREATE TABLE IF NOT EXISTS order_product_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name_i18n JSON NOT NULL,                     -- {"fr":"Puces","en":"Chips","es":null}; fr required
    sort_order INT NOT NULL DEFAULT 0,           -- lower first, then name
    deleted_at DATETIME NULL,                    -- soft delete
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sku VARCHAR(60) NULL,
    category_id INT NULL,
    name_i18n JSON NOT NULL,                     -- fr required, en/es optional (fallback fr)
    sale_enabled TINYINT(1) NOT NULL DEFAULT 0,  -- shown on "Matériel supplémentaire & back up"
    sale_price_cents INT NULL,
    sale_description_i18n JSON NULL,             -- Markdown per language
    rent_enabled TINYINT(1) NOT NULL DEFAULT 0,  -- shown on "Location de matériel"
    rent_price_cents_per_day INT NULL,
    rent_description_i18n JSON NULL,
    apps JSON NULL,                              -- ["playground","go","spot"] subset; [] / NULL = every licensee
    images JSON NULL,                            -- ordered file names in media/orders/, first = cover
    visible TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    deleted_at DATETIME NULL,                    -- soft delete; request lines keep their own copy
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_products_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One request = one basket from one page (kind sale | rent).
CREATE TABLE IF NOT EXISTS order_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    number VARCHAR(20) NOT NULL,                 -- CMD-2026-0001 (sale) / LOC-2026-0001 (rent)
    kind VARCHAR(4) NOT NULL,                    -- sale | rent
    client_id INT NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'new',   -- new | confirmed | shipped | done | cancelled
    rent_start DATE NULL,
    rent_end DATE NULL,                          -- inclusive: start = end -> 1 day
    pickup_mode VARCHAR(10) NULL,                -- post | in_person (rent only)
    return_mode VARCHAR(10) NULL,                -- post | in_person (rent only)
    company VARCHAR(190) NULL,
    contact_name VARCHAR(190) NULL,
    contact_email VARCHAR(190) NULL,
    contact_phone VARCHAR(50) NULL,
    address_line1 VARCHAR(190) NULL,
    address_line2 VARCHAR(190) NULL,
    postal_code VARCHAR(20) NULL,
    city VARCHAR(120) NULL,
    country CHAR(2) NULL,
    message TEXT NULL,                           -- licensee's free message
    language CHAR(2) NOT NULL DEFAULT 'fr',      -- licensee emails language
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_order_requests_number (number),
    INDEX idx_order_requests_client (client_id),
    INDEX idx_order_requests_kind_status (kind, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lines copy name/SKU/price at send time, so editing or deleting a product
-- never rewrites history. product_id NULL = free line added by the admin
-- (e.g. "Frais de port"): quantity x unit price, never multiplied by days.
CREATE TABLE IF NOT EXISTS order_request_lines (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    product_id INT NULL,
    sku VARCHAR(60) NULL,
    name VARCHAR(190) NOT NULL,                  -- French name (admin + Taghunter emails)
    name_i18n JSON NULL,                         -- snapshot for the licensee's own views/emails
    unit_price_cents INT NOT NULL,              -- sale: per unit; rent product line: per unit per day
    quantity INT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    INDEX idx_order_request_lines_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Status history (+ the note shown to the licensee) and admin edits.
CREATE TABLE IF NOT EXISTS order_request_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    type VARCHAR(12) NOT NULL,                   -- created | status | edited
    status VARCHAR(12) NULL,                     -- new status for type=status
    note TEXT NULL,                              -- visible to the licensee
    actor VARCHAR(6) NOT NULL,                   -- client | admin
    actor_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_request_events_request (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per prefix + year counter for the request numbers.
CREATE TABLE IF NOT EXISTS order_number_seq (
    prefix VARCHAR(3) NOT NULL,
    year SMALLINT NOT NULL,
    last INT NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_settings (
    name VARCHAR(64) NOT NULL PRIMARY KEY,
    value TEXT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who receives the "new request" email (JSON array of addresses).
INSERT IGNORE INTO order_settings (name, value) VALUES ('notify_emails', '["support@taghunter.fr"]');
