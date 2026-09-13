-- Tag Hunter GO / Spot BRIEFING screens (retour Ludiom #67).
--
-- The existing go_tutorial_slides carousel is global per app: it explains how to
-- PLAY, which is the same whatever the scenario. What was missing is the other
-- half - the per-SCENARIO briefing: the instructions and the story for THIS game,
-- shown full-screen right after the team presses "Commencer" and before the first
-- question ("aujourd'hui l'application enchaîne directement sur les questions").
--
-- Rather than a second table with the same shape, go_tutorial_slides gains a
-- nullable `scenario_id`:
--   scenario_id IS NULL  -> the app-wide "how to play" carousel  (bundle.tutorial)
--   scenario_id = <id>   -> that scenario's briefing screens      (bundle.briefing)
-- Existing rows keep NULL, so the current carousel is untouched.
--
-- Image files keep living in media/go_tutorial/ and keep being served through the
-- go.php?action=media proxy (CORS + offline caching by the PWA).
--
-- Safe to run multiple times: guarded on INFORMATION_SCHEMA, like every other
-- migration here (MySQL 8.4 rejects MariaDB-only ADD COLUMN IF NOT EXISTS -
-- see project_studio_migration_runner_bugs).

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

-- scenario_id: NULL = global tutorial, set = that scenario's briefing.
SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND COLUMN_NAME = 'scenario_id') = 0,
    'ALTER TABLE go_tutorial_slides ADD COLUMN scenario_id INT NULL DEFAULT NULL AFTER app',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- The lookup both reads use: (app, scenario_id, position).
SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND INDEX_NAME = 'idx_go_tutorial_scenario') = 0,
    'ALTER TABLE go_tutorial_slides ADD INDEX idx_go_tutorial_scenario (app, scenario_id, position)',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- Deleting a scenario takes its briefing with it. (The orphaned image files are
-- harmless; the tutorial rows have scenario_id NULL and are never touched.)
SET @s := IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'go_tutorial_slides'
       AND CONSTRAINT_NAME = 'fk_go_slides_scenario') = 0,
    'ALTER TABLE go_tutorial_slides ADD CONSTRAINT fk_go_slides_scenario
       FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE',
    'DO 0');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
