/*
  # Create Clients Table

  1. New Tables
    - `clients`
      - `id` (uuid, primary key) - Unique client identifier
      - `email` (text, unique, not null) - Client email address
      - `name` (text) - Client name
      - `company` (text) - Client company name
      - `phone` (text) - Client phone number
      - `notes` (text) - Additional notes about the client
      - `created_at` (timestamptz) - When the client was created
      - `created_by` (uuid) - Admin user who created this client
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `clients` table
    - Add policy for authenticated users to read all clients
    - Add policy for authenticated users to create clients
    - Add policy for authenticated users to update clients
    - Add policy for authenticated users to delete clients
*/

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  company text,
  phone text,
  notes text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all clients"
  ON clients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS clients_email_idx ON clients(email);
CREATE INDEX IF NOT EXISTS clients_created_at_idx ON clients(created_at DESC);