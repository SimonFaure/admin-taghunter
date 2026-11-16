-- Commandes: product variants (e.g. "Livrets Mystery" 100 / 250 / 500 / 1000,
-- "Valise de jeu" sans / avec balise). Each variant has its own sale price and
-- rental price per day (NULL = not offered in that mode) and an optional photo.
-- When a product has variants, the product-level prices are unused.
-- Memory: project_studio_commandes_equipment_orders.
--
-- PRODUCTION DEPLOY: run BEFORE the PHP that reads it (npm run deploy does).
-- Idempotent: CREATE TABLE IF NOT EXISTS + INFORMATION_SCHEMA-guarded ALTER.

CREATE TABLE IF NOT EXISTS order_product_variants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    label_i18n JSON NOT NULL,                    -- {"fr":"250 livrets","en":null,"es":null}; fr required
    sku VARCHAR(60) NULL,                        -- falls back to the product SKU
    sale_price_cents INT NULL,                   -- NULL = variant not for sale
    rent_price_cents_per_day INT NULL,           -- NULL = variant not for rent
    image VARCHAR(120) NULL,                     -- file in media/orders/, shown when the variant is picked
    sort_order INT NOT NULL DEFAULT 0,
    deleted_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_product_variants_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @dbname = DATABASE();

-- order_request_lines.variant_id: the variant ordered (name/SKU/price are still copied on the line).
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'order_request_lines' AND COLUMN_NAME = 'variant_id') > 0,
    'SELECT 1',
    'ALTER TABLE order_request_lines ADD COLUMN variant_id INT NULL AFTER product_id'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
