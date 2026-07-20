-- Per-client UI language (fr/en/es). Drives: the client's Studio UI language,
-- the playground first-launch onboarding default, and a new scenario's
-- default_language. Design: memory project_client_language / plans/client-language-phase1.md.
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY (the new code
-- reads/writes the column). MySQL 8.4 - plain ADD COLUMN (no MariaDB
-- "IF NOT EXISTS"; see project_studio_migration_runner_bugs).
ALTER TABLE clients ADD COLUMN language VARCHAR(8) NOT NULL DEFAULT 'fr';

-- Existing rows already take the DEFAULT; this is a harmless explicit backfill.
UPDATE clients SET language = 'fr' WHERE language IS NULL OR language = '';
