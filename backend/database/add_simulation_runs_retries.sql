-- Simulation run retries: a run can be retried, the retries are its child runs
-- (parent_run_id -> simulation_runs.id). A run "was retried" when it has
-- children; a retry can itself be retried (a chain / tree, cycles refused by
-- simulation_runs.php). Links come from the Playground ("Retry this run"
-- records the new run as a child) or from the Studio admin page (link /
-- unlink, or the import). Deleting a parent leaves its children as roots.
-- Design: memory project_playground_game_simulator.
--
-- Deploy order: RUN THIS MIGRATION BEFORE THE PHP DEPLOY. Needs
-- add_simulation_runs.sql first. Idempotent (INFORMATION_SCHEMA-gated - MySQL
-- 8.4 rejects ADD COLUMN IF NOT EXISTS, see project_studio_migration_runner_bugs).

SET @dbname = DATABASE();

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'simulation_runs' AND COLUMN_NAME = 'parent_run_id') > 0,
    'SELECT 1',
    'ALTER TABLE simulation_runs ADD COLUMN parent_run_id INT NULL'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'simulation_runs' AND INDEX_NAME = 'idx_sim_runs_parent') > 0,
    'SELECT 1',
    'ALTER TABLE simulation_runs ADD KEY idx_sim_runs_parent (parent_run_id)'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
