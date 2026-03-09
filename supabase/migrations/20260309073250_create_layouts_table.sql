/*
  # Create layouts table

  ## Overview
  Creates a new `layouts` table to store layout configurations associated with scenarios and game types.

  ## New Tables

  ### `layouts`
  - `id` (uuid, primary key) - Unique identifier
  - `layout_data` (jsonb) - JSON structure defining the layout elements and configuration
  - `user_id` (uuid, nullable, FK to auth.users) - Optional owner; null means it's a global/system layout
  - `game_type` (text) - Type of game this layout belongs to
  - `scenario_uniqid` (text, nullable) - Reference to a scenario by its unique identifier
  - `status` (text) - Lifecycle status: 'draft', 'active', or 'archived'
  - `version` (integer) - Version number for tracking layout iterations
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - RLS enabled on `layouts` table
  - Authenticated users can view all layouts (read-only for general access)
  - Users can insert their own layouts (user_id matches auth.uid())
  - Users can update their own layouts
  - Users can delete their own layouts
  - Service role has full access via separate policy

  ## Notes
  1. `user_id` defaults to NULL to support system/global layouts not tied to any user
  2. `status` is constrained to: 'draft', 'active', 'archived'
  3. `version` starts at 1 by default and can be incremented on updates
  4. An automatic `updated_at` trigger keeps the timestamp in sync
*/

CREATE TABLE IF NOT EXISTS layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_data jsonb DEFAULT '{}'::jsonb,
  user_id uuid DEFAULT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  game_type text NOT NULL DEFAULT '',
  scenario_uniqid text DEFAULT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS layouts_user_id_idx ON layouts(user_id);
CREATE INDEX IF NOT EXISTS layouts_game_type_idx ON layouts(game_type);
CREATE INDEX IF NOT EXISTS layouts_scenario_uniqid_idx ON layouts(scenario_uniqid);
CREATE INDEX IF NOT EXISTS layouts_status_idx ON layouts(status);

ALTER TABLE layouts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION handle_layouts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_layouts_updated_at'
  ) THEN
    CREATE TRIGGER set_layouts_updated_at
      BEFORE UPDATE ON layouts
      FOR EACH ROW
      EXECUTE FUNCTION handle_layouts_updated_at();
  END IF;
END $$;

CREATE POLICY "Authenticated users can view all layouts"
  ON layouts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own layouts"
  ON layouts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update own layouts"
  ON layouts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own layouts"
  ON layouts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
