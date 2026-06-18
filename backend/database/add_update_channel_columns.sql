-- Per-client / per-device app-update channel (stable | test). A client (or one
-- of its devices) designated a "Tester" pulls app updates from the parallel
-- test release track instead of stable. Resolution: device override wins, else
-- the client value, else 'stable'. Strictly the app-update binary -- no other
-- behaviour changes. Design: memory project_client_tester_update_channel /
-- plans/client-tester-update-channel.md.
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY (the new code
-- reads/writes these columns). MySQL 8.4 -- plain ADD COLUMN (no MariaDB
-- "IF NOT EXISTS"; see project_studio_migration_runner_bugs). Run once.

-- The client's chosen update channel. Drives every device that logs into this
-- client unless a device sets its own override below.
ALTER TABLE clients ADD COLUMN update_channel VARCHAR(16) NOT NULL DEFAULT 'stable';
UPDATE clients SET update_channel = 'stable' WHERE update_channel IS NULL OR update_channel = '';

-- Per-device override. NULL means "inherit the client's channel". Only set when
-- an admin wants one specific install on a different channel than its client.
ALTER TABLE devices ADD COLUMN update_channel VARCHAR(16) NULL DEFAULT NULL;

-- The release track a build belongs to. Existing rows backfill to 'stable' so
-- current self-update behaviour is byte-for-byte unchanged.
ALTER TABLE playground_releases ADD COLUMN channel VARCHAR(16) NOT NULL DEFAULT 'stable';
UPDATE playground_releases SET channel = 'stable' WHERE channel IS NULL OR channel = '';

-- "Latest" is now per (channel, target, arch): stable and test each keep their
-- own latest pointer, and the same version string may exist on both channels.
ALTER TABLE playground_releases
    DROP INDEX uq_release_version_platform,
    ADD UNIQUE KEY uq_release_channel_version_platform (channel, version, target, arch),
    ADD KEY idx_release_channel_latest (channel, target, arch, is_latest);
