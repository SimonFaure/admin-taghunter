-- Playground app release registry. One row per uploaded build artifact.
-- Powers the self-update feature: backend/api/playground_update.php reads the
-- "latest" row per (target, arch); backend/api/playground_releases_admin.php
-- writes rows from the studio admin "Releases" page.
--
-- Companion runner: backend/apply_playground_releases_migration.php
--
-- A single logical release (e.g. 1.2.0) is several rows -- one per platform/arch.
-- Desktop rows carry an artifact + minisign signature; mobile rows carry a
-- store_url instead. "Latest" is the is_latest flag, scoped per (target, arch).
-- The hard update floor is min_supported_version on the latest row.

CREATE TABLE IF NOT EXISTS playground_releases (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    version               VARCHAR(32)  NOT NULL,            -- semver, e.g. 1.2.0
    target                VARCHAR(16)  NOT NULL,            -- windows | darwin | linux | android | ios
    arch                  VARCHAR(16)  NOT NULL,            -- x86_64 | aarch64 | universal
    artifact_path         VARCHAR(255) NULL,                -- relative path under backend/releases/ (NULL for mobile)
    artifact_filename     VARCHAR(255) NULL,                -- original upload name, for Content-Disposition
    artifact_size         BIGINT       NULL,
    signature             MEDIUMTEXT   NULL,                -- raw text of the Tauri minisign .sig file (NULL for mobile)
    store_url             VARCHAR(512) NULL,                -- Play/App Store deep link (mobile rows only)
    pub_date              DATETIME     NOT NULL,
    notes                 MEDIUMTEXT   NULL,                -- release notes (plain text / markdown)
    min_supported_version VARCHAR(32)  NOT NULL DEFAULT '0.0.0',
    is_latest             TINYINT(1)   NOT NULL DEFAULT 0,
    created_by            INT          NULL,
    created_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_release_version_platform (version, target, arch),
    KEY idx_release_latest (target, arch, is_latest),
    CONSTRAINT fk_release_created_by FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
