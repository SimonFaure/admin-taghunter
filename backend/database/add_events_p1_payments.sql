-- Events & online booking, phase 1: licensee legal identity, Events switch +
-- commission, Stripe Connect accounts, platform settings, webhook dedupe.
-- Design: Claude plan "ok-i-need-a-moonlit-goose" (Events branch).
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB BEFORE deploying the PHP that reads these columns. Idempotent and
-- guarded through INFORMATION_SCHEMA (MySQL 8.4-safe, no "ADD COLUMN IF NOT
-- EXISTS"), so it is safe to re-run.
--
-- Money is integer cents, rates are basis points (300 = 3%), dates are UTC.

SET @dbname = DATABASE();

-- clients.slug: Public licensee slug: events.taghunter.fr/o/<slug>. Unique (index below).
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'slug') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN slug VARCHAR(80) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clients.legal_name: Legal identity shown on event pages, receipts and commission invoices.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'legal_name') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN legal_name VARCHAR(190) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'legal_form') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN legal_form VARCHAR(60) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'siret') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN siret VARCHAR(20) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'vat_number') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN vat_number VARCHAR(20) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clients.vat_valid: Last VIES answer (1 valid, 0 invalid, NULL never checked / unreachable).
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'vat_valid') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN vat_valid TINYINT(1) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'vat_checked_at') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN vat_checked_at DATETIME NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clients.vat_regime: 'subject' (VAT on tickets) or 'exempt' (art. 293 B du CGI).
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'vat_regime') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN vat_regime VARCHAR(10) NOT NULL DEFAULT ''subject'''
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clients.vat_default_bp: Default ticket VAT rate in basis points (2000 = 20%).
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'vat_default_bp') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN vat_default_bp INT NOT NULL DEFAULT 2000'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'address_line1') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN address_line1 VARCHAR(190) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'address_line2') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN address_line2 VARCHAR(190) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'postal_code') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN postal_code VARCHAR(20) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'city') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN city VARCHAR(120) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clients.country: ISO 3166-1 alpha-2. Also the Stripe account country.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'country') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN country CHAR(2) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clients.legal_email: Public contact + Reply-To of booking emails.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'legal_email') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN legal_email VARCHAR(190) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'public_phone') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN public_phone VARCHAR(50) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clients.events_enabled: Admin master switch for the Events feature. Default OFF.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'events_enabled') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN events_enabled TINYINT(1) NOT NULL DEFAULT 0'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clients.events_commission_bp: Commission % in basis points; NULL = platform default.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'events_commission_bp') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN events_commission_bp INT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clients.events_commission_fixed_cents: Commission fixed part per paid ticket, cents; NULL = platform default.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'events_commission_fixed_cents') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN events_commission_fixed_cents INT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- clients.events_terms_version: Platform terms + DPA version accepted by the licensee.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'events_terms_version') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN events_terms_version VARCHAR(20) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'events_terms_accepted_at') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN events_terms_accepted_at DATETIME NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Unique licensee slug (NULLs allowed, many licensees have none yet).
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND INDEX_NAME = 'uq_clients_slug') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD UNIQUE INDEX uq_clients_slug (slug)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- One Stripe connected account per licensee (Standard-type, full dashboard).
-- Status columns mirror the Stripe account; refreshed on return from
-- onboarding and by the account.updated webhook.
CREATE TABLE IF NOT EXISTS stripe_connected_accounts (
    client_id INT NOT NULL PRIMARY KEY,
    stripe_account_id VARCHAR(64) NOT NULL,
    livemode TINYINT(1) NOT NULL DEFAULT 0,
    country CHAR(2) NULL,
    charges_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payouts_enabled TINYINT(1) NOT NULL DEFAULT 0,
    details_submitted TINYINT(1) NOT NULL DEFAULT 0,
    disabled_reason VARCHAR(120) NULL,
    requirements JSON NULL,
    disconnected_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sca_account (stripe_account_id),
    CONSTRAINT fk_sca_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Platform-wide Events settings (key/value, admin-edited).
CREATE TABLE IF NOT EXISTS events_platform_settings (
    name VARCHAR(64) NOT NULL PRIMARY KEY,
    value TEXT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO events_platform_settings (name, value) VALUES
    ('commission_bp_default', '300'),
    ('commission_fixed_cents_default', '50'),
    ('platform_terms_version', '2026-11'),
    ('invoice_series_prefix', 'TH-COM'),
    ('invoice_issuer', '{}');

-- Every Stripe webhook event id we processed (dedupe + audit). Stripe retries
-- for up to 3 days, so an id seen twice must be a no-op.
CREATE TABLE IF NOT EXISTS stripe_events (
    id VARCHAR(255) NOT NULL PRIMARY KEY,
    type VARCHAR(80) NOT NULL,
    account VARCHAR(64) NULL,
    livemode TINYINT(1) NOT NULL DEFAULT 0,
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME NULL,
    error TEXT NULL,
    KEY idx_se_type (type),
    KEY idx_se_account (account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
