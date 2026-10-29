-- Licensee bug reports sent from the playground's launched-games page (the
-- "Report a problem" button next to Raw Data). Delivered through the telemetry
-- outbox as event_type 'bug_report'; event_uuid makes a retried delivery a no-op.
--
-- snapshot_json is the game state captured at report time (teams, raw punches,
-- console log). It carries team/player names, so it is purged (set NULL)
-- 6 months after the report is resolved - the report row itself is kept.
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB, BEFORE deploying the PHP that writes to it. CREATE TABLE IF NOT
-- EXISTS - safe to re-run.

CREATE TABLE IF NOT EXISTS bug_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_uuid CHAR(36) NOT NULL,
    client_id INT NOT NULL,
    device_id INT NULL,
    app_version VARCHAR(32) NULL,
    launched_game_id INT NULL,
    game_name VARCHAR(255) NULL,
    game_type VARCHAR(32) NULL,
    scenario_uniqid VARCHAR(64) NULL,
    summary_uuid CHAR(36) NULL,
    game_started_at DATETIME NULL,
    comment TEXT NOT NULL,
    teams_concerned_json JSON NULL,
    contact VARCHAR(255) NULL,
    device_role VARCHAR(16) NULL,
    snapshot_json LONGTEXT NULL,
    snapshot_error TEXT NULL,
    snapshot_truncated TINYINT(1) NOT NULL DEFAULT 0,
    snapshot_purged_at DATETIME NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'new',
    admin_note TEXT NULL,
    reported_at DATETIME NULL,
    resolved_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bug_report_event_uuid (event_uuid),
    KEY idx_bug_report_status (status, created_at),
    KEY idx_bug_report_client (client_id, created_at),
    CONSTRAINT fk_bug_report_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_bug_report_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
