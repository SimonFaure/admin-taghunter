-- Playground device-bound auth migration
-- Adds the columns needed for OTP-only login with per-client device cap and offline grace period.
-- Safe to run multiple times: each ALTER is gated on INFORMATION_SCHEMA so existing columns are skipped.
--
-- Tables touched:
--   clients      : max_devices, offline_grace_days
--   devices      : device_uniq (if missing), device_label, os, os_version, last_seen_at
--   auth_tokens  : device_id (FK -> devices.id ON DELETE CASCADE)
--
-- AFTER clauses are intentionally omitted: column ordering is cosmetic in MySQL,
-- and AFTER X fails when X doesn't exist on legacy schemas. The columns are
-- simply appended to the end of each table.

SET @dbname = DATABASE();

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.max_devices
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'max_devices') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN max_devices INT NOT NULL DEFAULT 2'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.offline_grace_days
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'offline_grace_days') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN offline_grace_days INT NOT NULL DEFAULT 90'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- devices.device_uniq  (per-install unique id; required by the new auth flow)
-- This column is created by cards_and_devices_migration.sql, but on legacy
-- schemas it may be missing — add it here defensively. Without it, the
-- playground client cannot identify itself to the server.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'device_uniq') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN device_uniq VARCHAR(255) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Unique index on devices.device_uniq (only if not already present).
-- Skipped if there are existing rows with NULL/duplicate device_uniq values
-- — the index creation will fail in that case. Manual cleanup required.
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'device_uniq' AND NON_UNIQUE = 0) > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD UNIQUE INDEX idx_device_uniq (device_uniq)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- devices.device_label  (user-facing name; defaults to hostname)
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'device_label') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN device_label VARCHAR(120) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- devices.os  (Windows | macOS | Linux | iOS | Android)
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'os') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN os VARCHAR(40) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- devices.os_version
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'os_version') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN os_version VARCHAR(40) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- devices.last_seen_at  (bumped on every authenticated request from this device)
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'last_seen_at') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN last_seen_at DATETIME NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- auth_tokens.device_id  (links a session to a device row)
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'auth_tokens' AND COLUMN_NAME = 'device_id') > 0,
    'SELECT 1',
    'ALTER TABLE auth_tokens ADD COLUMN device_id INT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index on auth_tokens.device_id (FK lookups + cap counting per device)
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'auth_tokens' AND INDEX_NAME = 'idx_device_id') > 0,
    'SELECT 1',
    'ALTER TABLE auth_tokens ADD INDEX idx_device_id (device_id)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Foreign key auth_tokens.device_id -> devices.id (CASCADE on device delete)
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = @dbname
         AND TABLE_NAME = 'auth_tokens'
         AND COLUMN_NAME = 'device_id'
         AND REFERENCED_TABLE_NAME = 'devices') > 0,
    'SELECT 1',
    'ALTER TABLE auth_tokens ADD CONSTRAINT fk_auth_tokens_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
