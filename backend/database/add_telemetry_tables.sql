-- Telemetry tables: client-uploaded error reports + game launches.
-- Companion: backend/apply_telemetry_migration.php
--
-- devices table is left alone: it already has device_label, os, os_version,
-- last_seen_at and playground_version (which serves as last_app_version,
-- updated via DeviceManager::updateMetadata).

CREATE TABLE IF NOT EXISTS error_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_uuid CHAR(36) NOT NULL,
    client_id INT NOT NULL,
    device_id INT NULL,
    app_version VARCHAR(32) NULL,
    fingerprint_hash CHAR(64) NOT NULL,
    error_message TEXT NULL,
    stack_trace MEDIUMTEXT NULL,
    occurrence_count INT NOT NULL DEFAULT 1,
    first_seen_at DATETIME NULL,
    last_seen_at DATETIME NULL,
    context_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_error_event_uuid (event_uuid),
    KEY idx_error_fingerprint (client_id, fingerprint_hash, last_seen_at),
    KEY idx_error_recent (client_id, created_at),
    KEY idx_error_device (device_id, created_at),
    CONSTRAINT fk_error_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_error_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_launches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_uuid CHAR(36) NOT NULL,
    client_id INT NOT NULL,
    device_id INT NULL,
    scenario_uniqid VARCHAR(64) NULL,
    duration_seconds INT NULL,
    teams_count INT NULL,
    started_at DATETIME NULL,
    ended_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_launch_event_uuid (event_uuid),
    KEY idx_launch_recent (client_id, created_at),
    KEY idx_launch_device (device_id, created_at),
    KEY idx_launch_scenario (scenario_uniqid, created_at),
    CONSTRAINT fk_launch_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_launch_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
