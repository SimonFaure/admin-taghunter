/*
  # Create API Logs Table

  1. New Tables
    - `api_logs`
      - `id` (bigserial, primary key)
      - `timestamp` (timestamptz, default now())
      - `endpoint` (text)
      - `method` (text)
      - `action` (text)
      - `user_id` (integer, nullable)
      - `ip` (text)
      - `user_agent` (text)
      - `request_data` (jsonb, nullable)
      - `response_data` (jsonb, nullable)
      - `status_code` (integer)
      - `created_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `api_logs` table
    - Add policy for authenticated admin users to read all logs
    - Add policy to allow inserts from anyone (for logging purposes)

  3. Indexes
    - Index on timestamp for efficient log retrieval
    - Index on endpoint for filtering
*/

CREATE TABLE IF NOT EXISTS api_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  action TEXT,
  user_id INTEGER,
  ip TEXT,
  user_agent TEXT,
  request_data JSONB,
  response_data JSONB,
  status_code INTEGER DEFAULT 200,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_api_logs_timestamp ON api_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON api_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at DESC);

-- Enable RLS
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert logs (needed for logging from PHP backend)
CREATE POLICY "Allow public inserts for logging"
  ON api_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Allow authenticated users to read all logs (admin dashboard access)
CREATE POLICY "Authenticated users can read all logs"
  ON api_logs
  FOR SELECT
  TO authenticated
  USING (true);