-- Tag Hunter GO - foundational schema. RFID-free, phone-browser version of
-- Mystery. Design: memory project_taghunter_go / plans/tag-hunter-go.md.
--
-- PRODUCTION DEPLOY: paste this whole file into phpMyAdmin (SQL tab) on the live
-- studio DB, BEFORE deploying the PHP that reads these columns. It is IDEMPOTENT
-- and guarded - every change checks information_schema first, so it is safe to
-- run on a fresh DB, safe to re-run, and never aborts half-way if an object
-- already exists. MySQL 8.4 (no MariaDB "ADD COLUMN IF NOT EXISTS"; we emulate
-- it with prepared statements - see project_studio_migration_runner_bugs).
--
-- Each guard: build an ALTER string only when the object is missing, else a
-- no-op (DO 0), then PREPARE/EXECUTE/DEALLOCATE. @vars are session-scoped (one
-- connection), so this works pasted as one script in phpMyAdmin.

-- ───────────────────────── 1) clients: GO flags ─────────────────────────
SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE clients ADD COLUMN go_enabled TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clients' AND COLUMN_NAME='go_enabled');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE clients ADD COLUMN go_subscription_active TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clients' AND COLUMN_NAME='go_subscription_active');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE clients ADD COLUMN go_subscription_valid_until DATE NULL DEFAULT NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='clients' AND COLUMN_NAME='go_subscription_valid_until');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- ──────────────── 2) client_scenarios: per-mode GO grants ────────────────
-- mode ('playground' | 'go'); a scenario can be granted in both. pattern_id is
-- a legacy per-grant binding (the GO answer key now lives on the scenario), kept
-- nullable + FK for back-compat.
SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE client_scenarios ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT ''playground''',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='client_scenarios' AND COLUMN_NAME='mode');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE client_scenarios ADD COLUMN pattern_id INT NULL DEFAULT NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='client_scenarios' AND COLUMN_NAME='pattern_id');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE client_scenarios SET mode = 'playground' WHERE mode IS NULL OR mode = '';

-- Drop the old 2-col unique only if it's still there.
SET @s := (SELECT IF(COUNT(*)>0,
  'ALTER TABLE client_scenarios DROP INDEX unique_client_scenario',
  'DO 0') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='client_scenarios' AND INDEX_NAME='unique_client_scenario');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- Add the mode-scoped unique only if missing.
SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE client_scenarios ADD UNIQUE KEY uq_client_scenario_mode (client_id, scenario_id, mode)',
  'DO 0') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='client_scenarios' AND INDEX_NAME='uq_client_scenario_mode');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE client_scenarios ADD KEY idx_client_scenarios_mode (mode)',
  'DO 0') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='client_scenarios' AND INDEX_NAME='idx_client_scenarios_mode');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE client_scenarios ADD CONSTRAINT fk_client_scenarios_pattern FOREIGN KEY (pattern_id) REFERENCES patterns(id) ON DELETE SET NULL',
  'DO 0') FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='client_scenarios' AND CONSTRAINT_NAME='fk_client_scenarios_pattern');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- ──────────────────── 3) patterns: GO mode tagging ──────────────────────
SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE patterns ADD COLUMN mode VARCHAR(16) NOT NULL DEFAULT ''playground''',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='patterns' AND COLUMN_NAME='mode');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE patterns ADD COLUMN answer_count TINYINT NULL DEFAULT NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='patterns' AND COLUMN_NAME='answer_count');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE patterns SET mode = 'playground' WHERE mode IS NULL OR mode = '';

-- ─────────────────── 4) go_loads: usage tracking ────────────────────────
CREATE TABLE IF NOT EXISTS go_loads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    scenario_id INT NOT NULL,
    session_code VARCHAR(16) NULL DEFAULT NULL,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_go_loads_client (client_id),
    INDEX idx_go_loads_scenario (scenario_id),
    INDEX idx_go_loads_client_scenario (client_id, scenario_id),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────── 5) go_scores: leaderboard ───────────────────────
-- Sessions were retired: the leaderboard is now keyed per (client, scenario,
-- team) and the operator filters it by time range (today / this week / month /
-- year / all time / custom). session_code is kept (nullable) for legacy rows
-- only - nothing writes it anymore. One row = one team's game.
CREATE TABLE IF NOT EXISTS go_scores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_code VARCHAR(16) NULL DEFAULT NULL,
    team_uuid CHAR(36) NOT NULL,
    client_id INT NOT NULL,
    scenario_id INT NOT NULL,
    team_name VARCHAR(64) NULL DEFAULT NULL,
    score INT NOT NULL DEFAULT 0,
    level INT NOT NULL DEFAULT 0,
    finished TINYINT(1) NOT NULL DEFAULT 0,
    elapsed_seconds INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_go_scores_client_scenario_team (client_id, scenario_id, team_uuid),
    INDEX idx_go_scores_client (client_id),
    INDEX idx_go_scores_scenario_updated (scenario_id, updated_at),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- go_scores upgrades for already-created (session-keyed) tables. Re-key off the
-- session: drop the old (session_code, team_uuid) unique, make session_code
-- optional, and add the (client, scenario, team) unique. team_uuid is a random
-- per-game UUID so the new unique never collides across old session rows.
SET @s := (SELECT IF(COUNT(*)>0,
  'ALTER TABLE go_scores DROP INDEX uq_go_scores_session_team',
  'DO 0') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='go_scores' AND INDEX_NAME='uq_go_scores_session_team');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)>0,
  'ALTER TABLE go_scores DROP INDEX idx_go_scores_session',
  'DO 0') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='go_scores' AND INDEX_NAME='idx_go_scores_session');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)>0,
  'ALTER TABLE go_scores MODIFY COLUMN session_code VARCHAR(16) NULL DEFAULT NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='go_scores' AND COLUMN_NAME='session_code');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE go_scores ADD UNIQUE KEY uq_go_scores_client_scenario_team (client_id, scenario_id, team_uuid)',
  'DO 0') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='go_scores' AND INDEX_NAME='uq_go_scores_client_scenario_team');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE go_scores ADD INDEX idx_go_scores_scenario_updated (scenario_id, updated_at)',
  'DO 0') FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='go_scores' AND INDEX_NAME='idx_go_scores_scenario_updated');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

-- ───────────── 6) go_sessions: DEPRECATED (operator session runs) ─────────
-- Sessions were dropped in favour of time-range leaderboards. This table is no
-- longer read or written by go.php; it is left in place (harmless) so the
-- migration stays non-destructive on existing prod databases. Safe to drop
-- manually once no legacy data is needed.
CREATE TABLE IF NOT EXISTS go_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    scenario_id INT NOT NULL,
    session_code VARCHAR(16) NOT NULL,
    name VARCHAR(64) NULL DEFAULT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL DEFAULT NULL,
    UNIQUE KEY uq_go_sessions_code (session_code),
    INDEX idx_go_sessions_client_scenario (client_id, scenario_id, started_at),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- go_sessions upgrades for already-created tables (name label + closed_at, so an
-- operator can rename a session and close it to stop new joins). Guarded.
SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE go_sessions ADD COLUMN name VARCHAR(64) NULL DEFAULT NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='go_sessions' AND COLUMN_NAME='name');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;

SET @s := (SELECT IF(COUNT(*)=0,
  'ALTER TABLE go_sessions ADD COLUMN closed_at TIMESTAMP NULL DEFAULT NULL',
  'DO 0') FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='go_sessions' AND COLUMN_NAME='closed_at');
PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;
