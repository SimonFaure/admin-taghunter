-- One-shot backfill for LEGACY `devices` / `clients` / `auth_tokens` tables.
--
-- Background: prod `devices` predates cards_and_devices_migration.sql, whose
-- `CREATE TABLE IF NOT EXISTS devices` is a no-op on an existing table, so the
-- playground-auth columns were never added. This script adds every column the
-- playground OTP/device login flow reads or writes. Fully idempotent and safe
-- on MySQL 8.x (INFORMATION_SCHEMA-gated, no MariaDB-only IF NOT EXISTS).
--
-- Paste the whole file into the phpMyAdmin SQL tab for the prod database and run
-- it. Comments here intentionally contain no semicolons.

SET @dbname = DATABASE();

-- ── devices.device_uniq ──────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'device_uniq') > 0,
    'SELECT 1', 'ALTER TABLE devices ADD COLUMN device_uniq VARCHAR(255) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── devices.device_label ─────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'device_label') > 0,
    'SELECT 1', 'ALTER TABLE devices ADD COLUMN device_label VARCHAR(120) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── devices.display_name ─────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'display_name') > 0,
    'SELECT 1', 'ALTER TABLE devices ADD COLUMN display_name VARCHAR(120) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── devices.os ───────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'os') > 0,
    'SELECT 1', 'ALTER TABLE devices ADD COLUMN os VARCHAR(40) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── devices.os_version ───────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'os_version') > 0,
    'SELECT 1', 'ALTER TABLE devices ADD COLUMN os_version VARCHAR(40) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── devices.last_seen_at ─────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'last_seen_at') > 0,
    'SELECT 1', 'ALTER TABLE devices ADD COLUMN last_seen_at DATETIME NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── devices.playground_version ───────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'playground_version') > 0,
    'SELECT 1', 'ALTER TABLE devices ADD COLUMN playground_version VARCHAR(50) NOT NULL DEFAULT '''''));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── devices.cards_file_version ───────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'cards_file_version') > 0,
    'SELECT 1', 'ALTER TABLE devices ADD COLUMN cards_file_version INT NOT NULL DEFAULT 0'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── devices.created_at ───────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'created_at') > 0,
    'SELECT 1', 'ALTER TABLE devices ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── devices.updated_at ───────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'updated_at') > 0,
    'SELECT 1', 'ALTER TABLE devices ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── unique index on devices.device_uniq (skip if duplicate or NULL rows exist) ─
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'device_uniq' AND NON_UNIQUE = 0) > 0,
    'SELECT 1', 'ALTER TABLE devices ADD UNIQUE INDEX idx_device_uniq (device_uniq)'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── clients.max_devices ──────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'max_devices') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN max_devices INT NOT NULL DEFAULT 2'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── clients.offline_grace_days ───────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'offline_grace_days') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN offline_grace_days INT NOT NULL DEFAULT 90'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── clients.playground_version ───────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'playground_version') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN playground_version VARCHAR(50) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── clients.creator_version ──────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'creator_version') > 0,
    'SELECT 1', 'ALTER TABLE clients ADD COLUMN creator_version VARCHAR(50) NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── auth_tokens.device_id ────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'auth_tokens' AND COLUMN_NAME = 'device_id') > 0,
    'SELECT 1', 'ALTER TABLE auth_tokens ADD COLUMN device_id INT NULL'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── auth_tokens.device_id index ──────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'auth_tokens' AND INDEX_NAME = 'idx_device_id') > 0,
    'SELECT 1', 'ALTER TABLE auth_tokens ADD INDEX idx_device_id (device_id)'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── auth_tokens -> devices foreign key (CASCADE on device delete) ─────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'auth_tokens'
         AND COLUMN_NAME = 'device_id' AND REFERENCED_TABLE_NAME = 'devices') > 0,
    'SELECT 1', 'ALTER TABLE auth_tokens ADD CONSTRAINT fk_auth_tokens_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE'));
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
