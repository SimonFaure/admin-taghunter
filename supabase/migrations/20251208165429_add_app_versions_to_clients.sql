/*
  # Add App Version Fields to Clients Table

  1. Changes
    - Add `playground_version` column to `clients` table
      - Stores the version of the Playground app installed by the client
      - Optional text field
    - Add `creator_version` column to `clients` table
      - Stores the version of the Creator app installed by the client
      - Optional text field

  2. Notes
    - These fields help track which versions of the apps clients are using
    - Useful for support and compatibility management
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'playground_version'
  ) THEN
    ALTER TABLE clients ADD COLUMN playground_version text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'creator_version'
  ) THEN
    ALTER TABLE clients ADD COLUMN creator_version text;
  END IF;
END $$;