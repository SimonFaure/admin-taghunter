/*
  # Add Version Field to Scenarios Table

  1. Changes
    - Add `version` column (text) to `scenarios` table
    - Default value set to '1.0'
    - Stores the version of the scenario/game

  2. Purpose
    - Track scenario versions for better version management
    - Allow clients and creators to identify which version of a scenario they're using
    - Support scenario updates and rollbacks

  3. Migration Safety
    - Uses IF NOT EXISTS to prevent errors
    - Non-destructive approach for adding column
    - Sets default value for existing records
*/

-- Add version column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'scenarios'
    AND column_name = 'version'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN version text DEFAULT '1.0';
  END IF;
END $$;