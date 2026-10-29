-- Global switches for the Releases page (admin).
-- android_visible_to_clients: '1' shows the Android APK release on the licensee
-- "Releases" page (/my releases, public ?action=list); anything else hides it.
-- Off by default. The tablet self-update path (manifest/check) and the
-- ?action=android short link are NOT affected.
--
-- Deploy order: the PHP reads this table fail-closed (missing table = hidden), so
-- order does not break anything, but the admin toggle can only be saved once
-- this has run. Idempotent.

CREATE TABLE IF NOT EXISTS playground_release_settings (
  name VARCHAR(64) NOT NULL PRIMARY KEY,
  value VARCHAR(255) NOT NULL,
  updated_by INT NULL DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO playground_release_settings (name, value) VALUES ('android_visible_to_clients', '0');
