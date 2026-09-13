-- Tag Hunter GO / Spot tutorial carousel: the slides shown on the PWA's
-- inscription (setup) screen, under the scenario story. Authored in Studio under
-- GO → Tuto (admin only) and shipped inside the `load` bundle so the phone
-- carries them offline like any other scenario media.
--
-- Global per app (NOT per scenario): the carousel explains how to PLAY GO, which
-- is the same whatever the scenario. `app` keeps GO and Spot able to tell a
-- different story without a second table.
--
-- Image files live in media/go_tutorial/ and are served through the existing
-- go.php?action=media proxy (so the cross-origin PWA gets CORS + can cache them).
--
-- Safe to run multiple times: guarded on INFORMATION_SCHEMA, like every other
-- migration here (MySQL 8.4 rejects MariaDB-only ADD COLUMN IF NOT EXISTS -
-- see project_studio_migration_runner_bugs).

CREATE TABLE IF NOT EXISTS go_tutorial_slides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    app ENUM('go','spot') NOT NULL DEFAULT 'go',
    position INT NOT NULL DEFAULT 0,
    filename VARCHAR(255) NOT NULL,
    -- Localized<string> JSON map, e.g. {"fr":"Scannez le QR","en":"Scan the QR"}.
    -- NULL/empty = an image-only slide.
    caption TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_go_tutorial_app_position (app, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
