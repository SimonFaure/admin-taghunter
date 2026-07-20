--- Per-app provisioning + billing columns on `clients` for the "Client App"
--- admin section. Design: project_client_app_section.
---
--- Model: each app (Playground / GO / Drop) has a master on/off ({app}_enabled)
--- plus an independent billing clock identical to the existing Playground one
--- (billing-ok bool -> server-stamped *_overdue_since on transition -> grace_days
--- countdown -> app locks). No recovery reprieve for GO/Drop (that stays a
--- Playground-only concept). GO/Drop billing-ok reuse / add columns below.
---
---   Playground  : reuses billing_up_to_date / billing_overdue_since /
---                 billing_grace_days / billing_reprieve_days / devices_disabled /
---                 license_type / update_channel. NEW: playground_enabled.
---   GO          : reuses go_enabled (master) + go_subscription_active (billing-ok).
---                 NEW: go_billing_overdue_since, go_billing_grace_days.
---                 go_subscription_valid_until is RETIRED (code stops reading it;
---                 column left in place to avoid a destructive drop).
---   Drop        : NEW drop_enabled, drop_billing_ok, drop_billing_overdue_since,
---                 drop_billing_grace_days (no app consumes them yet).
---
--- Safe to run multiple times: each ALTER is gated on INFORMATION_SCHEMA so an
--- existing column is skipped (avoids MariaDB-only `ADD COLUMN IF NOT EXISTS`,
--- which MySQL 8.4 rejects -- see project_studio_migration_runner_bugs).

SET @dbname = DATABASE();

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.playground_enabled -- master on/off for the Playground app. Existing
-- clients all have Playground, so default 1 (do NOT lock anyone out on deploy).
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'playground_enabled') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN playground_enabled TINYINT(1) NOT NULL DEFAULT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.go_billing_overdue_since -- stamped when go_subscription_active flips
-- 1 -> 0, cleared on 0 -> 1. NULL = not overdue.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'go_billing_overdue_since') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN go_billing_overdue_since DATETIME NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.go_billing_grace_days -- days after go_billing_overdue_since before GO
-- locks. Default 30.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'go_billing_grace_days') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN go_billing_grace_days INT NOT NULL DEFAULT 30'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.drop_enabled -- master on/off for the (future) Drop app. No existing
-- client owns Drop, so default 0.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_enabled') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN drop_enabled TINYINT(1) NOT NULL DEFAULT 0'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.drop_billing_ok -- billing-ok bool for Drop. Default 1 (current).
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_billing_ok') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN drop_billing_ok TINYINT(1) NOT NULL DEFAULT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.drop_billing_overdue_since -- stamped on drop_billing_ok 1 -> 0.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_billing_overdue_since') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN drop_billing_overdue_since DATETIME NULL DEFAULT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- clients.drop_billing_grace_days -- days after drop_billing_overdue_since before
-- Drop locks. Default 30.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'drop_billing_grace_days') > 0,
    'SELECT 1',
    'ALTER TABLE clients ADD COLUMN drop_billing_grace_days INT NOT NULL DEFAULT 30'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: GO billing moved from an immediate hard-block (go_subscription_active
-- = 0 refused instantly) to a grace clock keyed on go_billing_overdue_since. Any
-- client already paused (go_subscription_active = 0) has no stamp yet, so without
-- this they'd flip to ALLOWED-within-grace on deploy. Stamp a far-past date so
-- "now > stamp + grace" is already true -> they stay locked, preserving behavior.
-- Idempotent: only touches rows still missing a stamp.
--
-- Guarded on go_subscription_active existing so the apply_all runner (which sorts
-- *.sql alphabetically - this file precedes add_taghunter_go_foundations.sql that
-- creates that column) doesn't error on a fresh DB. In prod the GO column already
-- exists, so the backfill runs on the first pass.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'go_subscription_active') > 0,
    'UPDATE clients SET go_billing_overdue_since = ''2000-01-01 00:00:00'' WHERE go_subscription_active = 0 AND go_billing_overdue_since IS NULL',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
