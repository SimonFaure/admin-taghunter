-- Tag Hunter GO / Spot "Players Instructions": styled carousel slides.
--
-- Turns a slide from "an image with a caption printed underneath" into a real
-- authored page: a localized TEXT block (font, colour, size, placement) drawn
-- OVER a background that is either a solid colour or an image. `filename`
-- therefore stops being mandatory - a colour-background slide has no file.
--
-- Applies to BOTH carousels in this table, since both use the same editor and
-- the same renderer (parameterized only by canvas shape):
--   scenario_id IS NULL -> the app-wide "Players Instructions" carousel, shown
--                          on the setup screen under the scenario description
--   scenario_id = <id>  -> that scenario's briefing, shown full-screen
--
-- `caption` is REUSED as the text column rather than renamed: it already holds a
-- Localized<string> JSON map, the PWA already reads `slide.caption`, and a
-- rename would break every phone still holding a cached bundle. Only its meaning
-- moved (it is drawn ON the slide now, not below it).
--
-- Existing rows are auto-converted to the closest equivalent of how they render
-- today - the image letterboxed onto a dark ground with its caption at the
-- bottom over a scrim - and flagged `needs_review = 1` so Studio can badge them
-- until an admin has opened and saved each one.
--
-- Safe to run multiple times: guarded on INFORMATION_SCHEMA, like every other
-- migration here (MySQL 8.4 rejects MariaDB-only ADD COLUMN IF NOT EXISTS -
-- see project_studio_migration_runner_bugs).
--
-- Design: memory project_go_spot_players_instructions_carousel.

-- The base table, in case this runs on a database that never got the carousel.
CREATE TABLE IF NOT EXISTS go_tutorial_slides (
    id INT AUTO_INCREMENT PRIMARY KEY,
    app ENUM('go','spot') NOT NULL DEFAULT 'go',
    position INT NOT NULL DEFAULT 0,
    filename VARCHAR(255) NOT NULL,
    caption TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_go_tutorial_app_position (app, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 1. A slide no longer needs an image: the background can be a plain colour.
-- ---------------------------------------------------------------------------
SET @s := IF(
    (SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND COLUMN_NAME = 'filename') = 'NO',
    'ALTER TABLE go_tutorial_slides MODIFY COLUMN filename VARCHAR(255) NULL DEFAULT NULL',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 2. The styling columns. `needs_review` is added LAST so the data back-fill
--    below can key off it (its absence means this migration never ran).
-- ---------------------------------------------------------------------------

-- Catalog font family (e.g. "Zombie"). NULL = inherit the scenario's font.
SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND COLUMN_NAME = 'font_family') = 0,
    'ALTER TABLE go_tutorial_slides ADD COLUMN font_family VARCHAR(100) NULL DEFAULT NULL AFTER caption',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- Text colour, "#rrggbb". NULL = the renderer's default (white).
SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND COLUMN_NAME = 'font_color') = 0,
    'ALTER TABLE go_tutorial_slides ADD COLUMN font_color VARCHAR(20) NULL DEFAULT NULL AFTER font_family',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- Text size as a PERCENTAGE OF THE SLIDE'S WIDTH, rendered with container units
-- (cqw). Because the slide has a fixed aspect ratio, the same number gives the
-- same proportion on any phone and in Studio's preview at any scale.
SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND COLUMN_NAME = 'font_size_pct') = 0,
    'ALTER TABLE go_tutorial_slides ADD COLUMN font_size_pct DECIMAL(5,2) NOT NULL DEFAULT 7.00 AFTER font_color',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND COLUMN_NAME = 'text_align') = 0,
    'ALTER TABLE go_tutorial_slides ADD COLUMN text_align ENUM(''left'',''center'',''right'') NOT NULL DEFAULT ''center'' AFTER font_size_pct',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- Where the text block sits vertically on the slide.
SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND COLUMN_NAME = 'text_anchor') = 0,
    'ALTER TABLE go_tutorial_slides ADD COLUMN text_anchor ENUM(''top'',''middle'',''bottom'') NOT NULL DEFAULT ''middle'' AFTER text_align',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- Readability scrim behind the text, 0-100 % opacity of a dark veil. Without it
-- white text on a bright photo is unreadable and the only fix is re-editing the
-- image.
SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND COLUMN_NAME = 'scrim') = 0,
    'ALTER TABLE go_tutorial_slides ADD COLUMN scrim TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER text_anchor',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- Solid background colour, "#rrggbb". Also the letterbox colour behind a
-- `contain` image.
SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND COLUMN_NAME = 'background_color') = 0,
    'ALTER TABLE go_tutorial_slides ADD COLUMN background_color VARCHAR(20) NULL DEFAULT NULL AFTER scrim',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- cover = crop the image to fill the slide; contain = letterbox it whole.
SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND COLUMN_NAME = 'background_fit') = 0,
    'ALTER TABLE go_tutorial_slides ADD COLUMN background_fit ENUM(''cover'',''contain'') NOT NULL DEFAULT ''cover'' AFTER background_color',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- Set on slides auto-converted from the old image+caption model, cleared the
-- first time an admin saves the slide. Studio badges these.
--
-- Whether this column ALREADY existed is the migration's own "have I run
-- before?" marker - captured here, before the ALTER, and used to gate the
-- back-fill below. Nothing about a row's own contents can serve that purpose: a
-- freshly authored image slide can legitimately look exactly like an
-- unconverted legacy one, so a content-based guard would silently re-stamp it
-- on a re-run.
SET @already_migrated := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
      AND COLUMN_NAME = 'needs_review');

SET @s := IF(@already_migrated = 0,
    'ALTER TABLE go_tutorial_slides ADD COLUMN needs_review TINYINT(1) NOT NULL DEFAULT 0 AFTER background_fit',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 3. Back-fill, FIRST RUN ONLY: convert every pre-existing slide to the closest
--    thing to how it renders today - the image letterboxed onto the app's dark
--    ground, its caption at the bottom over a scrim - and flag it for review.
--    On the first run every row in the table predates the feature, so no
--    per-row discrimination is needed. On any later run @already_migrated is 1
--    and this does nothing.
-- ---------------------------------------------------------------------------
SET @s := IF(@already_migrated = 0,
    'UPDATE go_tutorial_slides
        SET background_fit   = ''contain'',
            background_color = ''#1e293b'',
            text_anchor      = ''bottom'',
            text_align       = ''center'',
            scrim            = 55,
            font_size_pct    = 5.00,
            needs_review     = 1
      WHERE filename IS NOT NULL',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- ---------------------------------------------------------------------------
-- 4. The carousel's on-screen heading, authorable and localized per app
--    (replaces the PWA's fixed `setup.tutorialTitle` string, which said the same
--    thing for GO and Spot and needed a redeploy to change).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS go_app_settings (
    app ENUM('go','spot') NOT NULL PRIMARY KEY,
    -- Localized<string> JSON map, e.g. {"fr":"Comment jouer","en":"How to play"}.
    -- NULL/empty = the PWA falls back to its own built-in string.
    instructions_title TEXT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO go_app_settings (app, instructions_title) VALUES ('go', NULL), ('spot', NULL);
