-- Claude Desktop extensions (.mcpb) for the Playground, e.g. taghunter-playground.mcpb
-- (tools/playground-mcp in the playground repo: runs game-simulator campaigns
-- from Claude Desktop on a tester PC).
-- ADMIN ONLY: kept out of playground_releases on purpose, because the public
-- playground_update.php list / download actions serve any row of that table.
-- Files live in backend/releases/extensions/<version>/ and are only served by
-- playground_releases_admin.php?action=extension_download (admin token).
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY (the Releases
-- page shows an error in the extensions section until the table exists). Idempotent.

CREATE TABLE IF NOT EXISTS playground_extension_releases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  version VARCHAR(32) NOT NULL,
  artifact_path VARCHAR(255) NOT NULL,
  artifact_filename VARCHAR(255) NOT NULL,
  artifact_size BIGINT NOT NULL DEFAULT 0,
  artifact_sha256 CHAR(64) NOT NULL,
  notes TEXT NULL,
  created_by INT NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_extension_name_version (name, version)
);
