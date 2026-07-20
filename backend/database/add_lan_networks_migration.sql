-- First-launch onboarding: "default hotspot" relay + "default mother" inventory.
-- Design: plans/playground-first-launch-onboarding.md (grill-me 2026-06-09).
-- Safe to run multiple times: the CREATE uses IF NOT EXISTS and each ALTER is
-- gated on INFORMATION_SCHEMA so existing columns are skipped.
--
-- Tables touched:
--   lan_networks  : NEW - relayed default hotspot Wi-Fi creds, per client.
--   devices       : is_default_mother, mother_uuid (inventory only - no secret).
--
-- (Comments here intentionally avoid semicolons: some migration runners split
--  on a semicolon before stripping comments, so one in prose corrupts the next
--  statement. Keep prose semicolon-free.)

SET @dbname = DATABASE();

-- ─────────────────────────────────────────────────────────────────────────────
-- lan_networks - one row per announced default hotspot, scoped to a client.
-- Multiple defaults coexist (multi-venue) and the playground auto-join engine
-- filters by in-range SSID. Only source='hotspot' rows are ever stored
-- (operator-entered router passwords are NEVER relayed to the cloud).
-- `version` is bumped on every announce so the client manifest can advertise a
-- monotonically increasing lan_networks_version.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lan_networks (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    client_id  INT NOT NULL,
    ssid       VARCHAR(64) NOT NULL,
    password   VARCHAR(128) NOT NULL,
    source     ENUM('hotspot','router') NOT NULL DEFAULT 'hotspot',
    is_default TINYINT NOT NULL DEFAULT 1,
    version    INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_client_ssid (client_id, ssid),
    KEY idx_client_default (client_id, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ─────────────────────────────────────────────────────────────────────────────
-- lan_networks.device_id - DROP if present. Vestige of the original upload-driven
-- design (each device announced its own hotspot UP, device_id recorded which).
-- The studio-authoritative rework (plans/studio-authoritative-hotspot-creds.md)
-- made hotspot creds CLIENT-scoped (always inserted NULL, never read), so the
-- column is dead. Gated on existence so this is idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'lan_networks' AND COLUMN_NAME = 'device_id') > 0,
    'ALTER TABLE lan_networks DROP COLUMN device_id',
    'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- devices.is_default_mother  (inventory bit - this machine is the client's
-- canonical mother / game server. No secret is relayed and on-LAN pairing stays
-- mDNS + operator approval.)
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'is_default_mother') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN is_default_mother TINYINT NOT NULL DEFAULT 0'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- devices.mother_uuid  (the axum mother's stable UUID, for the dashboard)
-- ─────────────────────────────────────────────────────────────────────────────
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'devices' AND COLUMN_NAME = 'mother_uuid') > 0,
    'SELECT 1',
    'ALTER TABLE devices ADD COLUMN mother_uuid VARCHAR(64) NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
