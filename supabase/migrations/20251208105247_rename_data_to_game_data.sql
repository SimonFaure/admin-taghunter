/*
  # Rename data column to gameData

  1. Changes
    - Rename the `data` column to `gameData` in the `scenarios` table
    - This column stores the JSON game data for each scenario
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'data'
  ) THEN
    ALTER TABLE scenarios RENAME COLUMN data TO "gameData";
  END IF;
END $$;