/*
  # Create scenarios table

  1. New Tables
    - `scenarios`
      - `id` (uuid, primary key) - Unique identifier for the scenario
      - `title` (text) - Title of the game scenario
      - `game_type` (text) - Type of game (e.g., "quiz", "treasure-hunt", "puzzle")
      - `slug` (text, unique) - URL-friendly unique identifier
      - `description` (text) - Description of the scenario
      - `status` (text) - Status of the scenario (e.g., "draft", "published", "archived")
      - `created_at` (timestamptz) - When the scenario was created
      - `updated_at` (timestamptz) - When the scenario was last updated
      - `data` (jsonb) - JSON data containing game configuration and settings

  2. Security
    - Enable RLS on `scenarios` table
    - Add policy for authenticated users to read published scenarios
    - Add policy for authenticated users to manage their own scenarios
*/

CREATE TABLE IF NOT EXISTS scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  game_type text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text DEFAULT '',
  status text DEFAULT 'draft',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  data jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read published scenarios"
  ON scenarios
  FOR SELECT
  TO authenticated
  USING (status = 'published' OR created_by = auth.uid());

CREATE POLICY "Users can insert own scenarios"
  ON scenarios
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update own scenarios"
  ON scenarios
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can delete own scenarios"
  ON scenarios
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

CREATE INDEX idx_scenarios_slug ON scenarios(slug);
CREATE INDEX idx_scenarios_status ON scenarios(status);
CREATE INDEX idx_scenarios_created_by ON scenarios(created_by);