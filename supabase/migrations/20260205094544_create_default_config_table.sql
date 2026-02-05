/*
  # Create default_config table

  1. New Tables
    - `default_config`
      - `id` (uuid, primary key)
      - `meta` (text, unique) - Configuration metadata name
      - `value` (jsonb) - Configuration value as JSON
      - `version` (integer) - Configuration version number
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `default_config` table
    - Add policy for authenticated admins to read config
    - Add policy for authenticated admins to insert config
    - Add policy for authenticated admins to update config
*/

CREATE TABLE IF NOT EXISTS default_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta text UNIQUE NOT NULL,
  value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE default_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read default config"
  ON default_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert default config"
  ON default_config
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.id = auth.uid()
    )
  );

CREATE POLICY "Admins can update default config"
  ON default_config
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_default_config_meta ON default_config(meta);
CREATE INDEX IF NOT EXISTS idx_default_config_version ON default_config(version);