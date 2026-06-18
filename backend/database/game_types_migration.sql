-- Migration: Game types + per-client overrides + client preferences
-- Description: Adds a registry of game types (with admin-managed tutorial videos),
--              a per-client override table for client-uploaded tutorial videos,
--              and a JSON preferences column on clients for launch defaults.
-- Date: 2026-05-13

CREATE TABLE IF NOT EXISTS game_types (
  code                    VARCHAR(40) PRIMARY KEY,
  name                    VARCHAR(100) NOT NULL,
  supports_tutorial_video TINYINT(1) NOT NULL DEFAULT 0,
  supports_intro_video    TINYINT(1) NOT NULL DEFAULT 0,
  tutorial_video_path     VARCHAR(500) NULL,
  tutorial_video_version  INT NOT NULL DEFAULT 0,
  tutorial_subtitles      JSON NULL,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_game_type_overrides (
  client_id              INT NOT NULL,
  game_type_code         VARCHAR(40) NOT NULL,
  tutorial_video_path    VARCHAR(500) NULL,
  tutorial_video_version INT NOT NULL DEFAULT 0,
  tutorial_subtitles     JSON NULL,
  updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, game_type_code),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (game_type_code) REFERENCES game_types(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE clients ADD COLUMN preferences JSON NULL;

INSERT INTO game_types (code, name, supports_tutorial_video, supports_intro_video) VALUES
  ('mystery',  'Mystery',  1, 1),
  ('tagquest', 'TagQuest', 0, 0),
  ('tracks',   'Track',    1, 1),
  ('clash',    'Clash',    1, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);
