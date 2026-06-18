-- Device sync-failure reports: per-item content-sync failures uploaded by the
-- playground telemetry outbox (event types sync_item_failed / sync_item_resolved).
--
-- One CURRENT-STATE row per (client_id, device_id, item_key): the row flips
-- between status='failed' and status='resolved' as the playground reports the
-- item's lifecycle. We upsert on that tuple (NOT on event_uuid — that is only
-- the outbox idempotency key); a last-write-wins guard on last_event_at lets a
-- reordered stale event be ignored. times_failed increments each time the row
-- flips back to failed.
--
-- (Comments here intentionally avoid semicolons: apply_all_migrations.php splits
--  on a semicolon before stripping comments, so one in prose corrupts the next
--  statement. Keep prose semicolon-free.)
--
-- Run this migration BEFORE deploying the PHP that references the table.

CREATE TABLE IF NOT EXISTS device_sync_failures (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    client_id      INT NOT NULL,
    device_id      INT NULL,
    item_key       VARCHAR(255) NOT NULL,
    kind           VARCHAR(48) NULL,
    label          VARCHAR(512) NULL,
    version        INT NULL,
    status         ENUM('failed','resolved') NOT NULL DEFAULT 'failed',
    error_type     VARCHAR(64) NULL,
    http_status    INT NULL,
    error_message  TEXT NULL,
    times_failed   INT NOT NULL DEFAULT 1,
    resolution     ENUM('downloaded','removed') NULL,
    first_failed_at DATETIME NULL,
    last_failed_at  DATETIME NULL,
    resolved_at     DATETIME NULL,
    last_event_at   DATETIME NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sync_failure (client_id, device_id, item_key),
    KEY idx_sync_failure_active (device_id, status),
    KEY idx_sync_failure_client (client_id, status, last_failed_at),
    CONSTRAINT fk_sync_failure_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_sync_failure_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
