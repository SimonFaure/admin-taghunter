-- Per-device and per-channel game-type availability overrides — extends the
-- disable-game-types model (game_types.enabled global + client_game_type_overrides
-- per-client) with two more tiers used by the admin Testers page. Resolution,
-- most-specific wins, per game type per device:
--   device override ?? client override ?? test-channel override (test devices only)
--   ?? global game_types.enabled.
-- Both tri-state: NULL = inherit the next tier, 1 = force-enabled, 0 = force-disabled.
-- Design: project_client_tester_update_channel / plans/tester-game-types-page.md.
--
-- Deploy: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY. Run once.

-- Per individual playground device (lets one tester device differ from its client
-- and from the rest of the test cohort).
CREATE TABLE IF NOT EXISTS device_game_type_overrides (
  device_id      INT NOT NULL,
  game_type_code VARCHAR(40) NOT NULL,
  enabled        TINYINT(1) NULL DEFAULT NULL,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (device_id, game_type_code),
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (game_type_code) REFERENCES game_types(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per update channel (the "all testers" layer: channel='test' grants/forces a
-- game type for every device resolved to the test channel, present and future).
CREATE TABLE IF NOT EXISTS channel_game_type_overrides (
  channel        VARCHAR(16) NOT NULL,
  game_type_code VARCHAR(40) NOT NULL,
  enabled        TINYINT(1) NULL DEFAULT NULL,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (channel, game_type_code),
  FOREIGN KEY (game_type_code) REFERENCES game_types(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
