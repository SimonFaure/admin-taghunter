/*
  # Add client_id to scenarios table

  1. Changes
    - Add `client_id` column to `scenarios` table
      - References the `clients` table
      - Links each scenario to a specific client
    
  2. Notes
    - The column is nullable to allow for scenarios not tied to specific clients
    - Foreign key constraint ensures data integrity
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE scenarios ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_scenarios_client_id ON scenarios(client_id);
  END IF;
END $$;
