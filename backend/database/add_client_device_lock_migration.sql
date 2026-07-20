--- Emergency device-disable + billing auto-lock columns on `clients`.
--- Design: project_client_device_lock (admin can disable a client's devices in an
--- emergency / for non-payment; a separate billing-overdue clock auto-locks after
--- a per-client grace window; a recovery code grants a per-device reprieve).
---
--- Safe to run multiple times: each ALTER is gated on INFORMATION_SCHEMA so an
--- existing column is skipped (same approach as add_playground_device_auth_migration.sql;
--- avoids MariaDB-only `ADD COLUMN IF NOT EXISTS`, which MySQL 8.4 rejects - see
--- project_studio_migration_runner_bugs).
---
--- Columns added to `clients`:
---   devices_disabled       : emergency hard switch (Switch A). 1 = all this
---                            client's devices stop launching/joining games.
---   billing_overdue_since  : set when billing flips Current -> Overdue, cleared
---                            on Overdue -> Current. NULL = not overdue.
---   billing_grace_days     : days after billing_overdue_since before the billing
---                            lock engages (Switch B). Default 30.
---   billing_reprieve_days  : how long one recovery-code reprieve lasts on a
---                            device. Default 7.

SET @dbname = DATABASE();

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.devices_disabled
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'devices_disabled') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN devices_disabled TINYINT(1) NOT NULL DEFAULT 0'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.billing_overdue_since
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'billing_overdue_since') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN billing_overdue_since DATETIME NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.billing_grace_days
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'billing_grace_days') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN billing_grace_days INT NOT NULL DEFAULT 30'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.billing_reprieve_days
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'billing_reprieve_days') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN billing_reprieve_days INT NOT NULL DEFAULT 7'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- devices.billing_reprieve_until - a device self-reports its active recovery-code
-- reprieve deadline on each heartbeat (NULL = none / expired). Lets the admin
-- Devices view show a per-device "Reprieve until …" badge. Only ever written
-- when the heartbeat carries it, so older clients never clobber it.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'billing_reprieve_until') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN billing_reprieve_until DATETIME NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- recovery_codes.used_context - distinguishes a PIN reset from a billing
-- reprieve when a code is burned (the same pool serves both). NULL = legacy /
-- unknown. ensureTables() creates this column on fresh installs; this guards
-- existing tables.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'recovery_codes' AND COLUMN_NAME = 'used_context') > 0,
    'SELECT 1',
    'ALTER TABLE recovery_codes ADD COLUMN used_context VARCHAR(16) NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
