-- Android sideload APK releases (design: memory project_android_operator_tablet).
-- Android rows now carry a real artifact (the signed .apk under releases/) and
-- no minisign signature: the tablet verifies the download against this SHA-256
-- before handing it to the Android installer, and Android itself refuses any APK
-- not signed with the installed app's key.
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY (the admin APK
-- upload writes this column). MySQL 8.4 -- plain ADD COLUMN; a re-run's
-- "Duplicate column" is a harmless warning in apply_all_migrations. Run once.

ALTER TABLE playground_releases ADD COLUMN artifact_sha256 CHAR(64) NULL DEFAULT NULL;
