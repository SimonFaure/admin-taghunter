-- The git branch a playground release was built from, picked in the Studio
-- Releases upload form and shown in the list. Information only: self-update
-- still selects builds by channel + platform.
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY (the admin list
-- and upload read and write this column). MySQL 8.4 -- plain ADD COLUMN; a
-- re-run's "Duplicate column" is a harmless warning in apply_all_migrations.

ALTER TABLE playground_releases ADD COLUMN git_branch VARCHAR(100) NULL DEFAULT NULL;
