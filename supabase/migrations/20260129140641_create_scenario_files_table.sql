/*
  # Create scenario_files table

  1. New Tables
    - `scenario_files`
      - `id` (uuid, primary key) - unique identifier for the file
      - `scenario_id` (uuid, foreign key) - references scenarios table
      - `name` (text) - file name
      - `file_path` (text) - path to the file in storage
      - `file_size` (bigint) - size of the file in bytes
      - `mime_type` (text) - MIME type of the file
      - `uploaded_by` (uuid, foreign key) - references auth.users
      - `created_at` (timestamptz) - timestamp of upload
      - `updated_at` (timestamptz) - timestamp of last update

  2. Security
    - Enable RLS on `scenario_files` table
    - Add policy for authenticated admins to manage scenario files
    - Add policy for clients to read their own scenario files

  3. Storage
    - Create storage bucket for scenario files if not exists
    - Add policies for file upload and download
*/

-- Create scenario_files table
CREATE TABLE IF NOT EXISTS scenario_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE scenario_files ENABLE ROW LEVEL SECURITY;

-- Policy for admins to manage all scenario files
CREATE POLICY "Admins can manage all scenario files"
  ON scenario_files
  FOR ALL
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

-- Policy for clients to read their own scenario files
CREATE POLICY "Clients can read their scenario files"
  ON scenario_files
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios s
      INNER JOIN clients c ON c.id = s.client_id
      WHERE s.id = scenario_files.scenario_id
      AND c.id = auth.uid()
    )
  );

-- Create storage bucket for scenario files
INSERT INTO storage.buckets (id, name, public)
VALUES ('scenario-files', 'scenario-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Admins can upload files
CREATE POLICY "Admins can upload scenario files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'scenario-files' AND
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.id = auth.uid()
    )
  );

-- Storage policy: Admins can read all files
CREATE POLICY "Admins can read all scenario files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'scenario-files' AND
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.id = auth.uid()
    )
  );

-- Storage policy: Clients can read their scenario files
CREATE POLICY "Clients can read their scenario files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'scenario-files' AND
    EXISTS (
      SELECT 1 FROM scenario_files sf
      INNER JOIN scenarios s ON s.id = sf.scenario_id
      INNER JOIN clients c ON c.id = s.client_id
      WHERE sf.file_path = storage.objects.name
      AND c.id = auth.uid()
    )
  );

-- Storage policy: Admins can delete files
CREATE POLICY "Admins can delete scenario files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'scenario-files' AND
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.id = auth.uid()
    )
  );

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_scenario_files_scenario_id ON scenario_files(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_files_created_at ON scenario_files(created_at DESC);