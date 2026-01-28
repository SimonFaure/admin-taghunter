/*
  # Refactor Scenarios Table Structure

  1. Changes
    - Remove `game_data` column (deprecated, no longer used)
    - Add `data` column (jsonb) - stores all game configuration data including available_languages
    - Add `medias` column (jsonb) - stores media references including game_visual in images object

  2. Purpose
    - Simplify data structure
    - Separate media references from game data
    - Store available translations in data.available_languages
    - Store game visual path in medias.images.game_visual

  3. Migration Safety
    - Uses IF EXISTS/NOT EXISTS to prevent errors
    - Non-destructive approach for adding columns
*/

-- Add new columns if they don't exist
DO $$
BEGIN
  -- Add data column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'scenarios'
    AND column_name = 'data'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN data jsonb DEFAULT '{}'::jsonb;
  END IF;

  -- Add medias column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'scenarios'
    AND column_name = 'medias'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN medias jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Drop game_data column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'scenarios'
    AND column_name = 'game_data'
  ) THEN
    ALTER TABLE scenarios DROP COLUMN game_data;
  END IF;
END $$;