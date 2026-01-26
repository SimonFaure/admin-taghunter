/*
  # Add game_meta column to scenarios table

  1. Changes
    - Add `game_meta` column to `scenarios` table
      - Type: JSONB (for storing the complete game payload)
      - Nullable: true (optional field)
  
  2. Purpose
    - Store the complete incoming payload from client apps
    - Keep `game_data` for the structured game configuration
    - Use `game_meta` for the full payload including media references
*/

-- Add game_meta column to scenarios table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'game_meta'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN game_meta JSONB NULL;
  END IF;
END $$;
