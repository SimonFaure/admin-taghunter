/*
  # Create Client Cards Table

  1. New Tables
    - `client_cards`
      - `id` (uuid, primary key) - Unique identifier for each card
      - `client_id` (uuid, foreign key) - References the client who owns the cards
      - `card_name` (text) - Name of the card
      - `card_type` (text) - Type/category of the card
      - `card_rarity` (text) - Rarity level of the card
      - `card_power` (text) - Power or stats of the card
      - `card_description` (text) - Description of the card
      - `additional_data` (jsonb) - Store any additional columns from CSV
      - `import_batch` (uuid) - Batch identifier to group cards from same import
      - `created_at` (timestamptz) - Timestamp when card was created
      - `updated_at` (timestamptz) - Timestamp when card was last updated

  2. Security
    - Enable RLS on `client_cards` table
    - Add policy for clients to read their own cards
    - Add policy for clients to insert their own cards
    - Add policy for clients to delete their own cards
    - Add policy for admins to manage all cards

  3. Notes
    - Each CSV import will generate a new batch ID
    - When importing, old cards for that client are deleted first
    - Supports flexible CSV structure via jsonb field
*/

-- Create the client_cards table
CREATE TABLE IF NOT EXISTS client_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  card_name text DEFAULT '',
  card_type text DEFAULT '',
  card_rarity text DEFAULT '',
  card_power text DEFAULT '',
  card_description text DEFAULT '',
  additional_data jsonb DEFAULT '{}'::jsonb,
  import_batch uuid DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE client_cards ENABLE ROW LEVEL SECURITY;

-- Policy for clients to read their own cards
CREATE POLICY "Clients can read own cards"
  ON client_cards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = client_cards.client_id
      AND auth.uid() = client_cards.client_id
    )
  );

-- Policy for clients to insert their own cards
CREATE POLICY "Clients can insert own cards"
  ON client_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = client_id
  );

-- Policy for clients to delete their own cards
CREATE POLICY "Clients can delete own cards"
  ON client_cards
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = client_id
  );

-- Policy for admins to read all cards
CREATE POLICY "Admins can read all cards"
  ON client_cards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.id = auth.uid()
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_client_cards_client_id ON client_cards(client_id);
CREATE INDEX IF NOT EXISTS idx_client_cards_import_batch ON client_cards(import_batch);
