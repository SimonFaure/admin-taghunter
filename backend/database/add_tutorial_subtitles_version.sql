-- Tutorial-video subtitles get their own version counter. Until now a subtitle
-- upload/removal bumped tutorial_video_version, so every playground re-downloaded
-- the whole tutorial video (100s of MB) for a few KB of .vtt. Subtitle edits now
-- bump tutorial_subtitles_version only; the playground compares it separately
-- and pulls just the tracks.
--
-- Deploy order: RUN THIS CLOUD MIGRATION BEFORE THE PHP DEPLOY (the playground
-- sync manifest selects this column). MySQL 8.4 -- plain ADD COLUMN; a re-run's
-- "Duplicate column" is a harmless warning in apply_all_migrations. Run once.

ALTER TABLE game_types ADD COLUMN tutorial_subtitles_version INT NOT NULL DEFAULT 0;
ALTER TABLE client_game_type_overrides ADD COLUMN tutorial_subtitles_version INT NOT NULL DEFAULT 0;
