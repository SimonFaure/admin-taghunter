-- Licensee addresses: the main (company) address reuses the existing
-- clients.company / address_line1.. / postal_code / city / country / phone
-- columns (shared with the Events legal identity); this adds the shipping
-- address, and a billing-address snapshot on order requests.
-- Memory: project_studio_commandes_equipment_orders.
--
-- PRODUCTION DEPLOY: run BEFORE the PHP that reads it (npm run deploy does).
-- Idempotent: INFORMATION_SCHEMA-guarded ALTERs (MySQL 8.4-safe).

SET @dbname = DATABASE();

-- clients.shipping_same_as_main: 1 = ship to the main address (shipping_* ignored).
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'shipping_same_as_main') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN shipping_same_as_main TINYINT(1) NOT NULL DEFAULT 1'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'shipping_name') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN shipping_name VARCHAR(190) NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'shipping_company') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN shipping_company VARCHAR(190) NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'shipping_address_line1') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN shipping_address_line1 VARCHAR(190) NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'shipping_address_line2') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN shipping_address_line2 VARCHAR(190) NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'shipping_postal_code') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN shipping_postal_code VARCHAR(20) NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'shipping_city') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN shipping_city VARCHAR(120) NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'shipping_country') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN shipping_country CHAR(2) NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'shipping_phone') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN shipping_phone VARCHAR(50) NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- order_requests.billing_*: copy of the licensee's main address when the request is sent.
SET @sql = (SELECT IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'order_requests' AND COLUMN_NAME = 'billing_company') > 0,
    'SELECT 1', 'ALTER TABLE order_requests ADD COLUMN billing_company VARCHAR(190) NULL, ADD COLUMN billing_address_line1 VARCHAR(190) NULL, ADD COLUMN billing_address_line2 VARCHAR(190) NULL, ADD COLUMN billing_postal_code VARCHAR(20) NULL, ADD COLUMN billing_city VARCHAR(120) NULL, ADD COLUMN billing_country CHAR(2) NULL'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
