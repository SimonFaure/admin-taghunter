/*
  # Add Client Detail Fields

  1. Changes to `clients` table
    - Add `avatar_url` (text) - URL to client's avatar image in storage
    - Add `license_type` (text) - Either 'access' or 'premium'
    - Add `billing_up_to_date` (boolean) - Whether billing is current, defaults to true

  2. Security
    - Existing RLS policies continue to apply
    - No new policies needed as authenticated users can already update clients

  3. Notes
    - Uses IF NOT EXISTS pattern to allow safe re-running
    - Sets appropriate defaults for new fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE clients ADD COLUMN avatar_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'license_type'
  ) THEN
    ALTER TABLE clients ADD COLUMN license_type text DEFAULT 'access' CHECK (license_type IN ('access', 'premium'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'billing_up_to_date'
  ) THEN
    ALTER TABLE clients ADD COLUMN billing_up_to_date boolean DEFAULT true;
  END IF;
END $$;