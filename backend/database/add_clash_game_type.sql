-- Migration: register the "clash" game type
-- Description: Adds the Clash game type to the game_types registry so it appears
--              on the Tutorial Videos page (admin legacy video + per-client override).
-- Date: 2026-06-10

INSERT INTO game_types (code, name, supports_tutorial_video, supports_intro_video) VALUES
  ('clash', 'Clash', 1, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);
