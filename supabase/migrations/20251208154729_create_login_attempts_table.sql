/*
  # Create login_attempts table for rate limiting

  1. New Tables
    - `login_attempts`
      - `id` (uuid, primary key)
      - `email` (text) - Email address attempted
      - `ip_address` (text) - IP address of the attempt
      - `success` (boolean) - Whether login was successful
      - `attempted_at` (timestamptz) - When the attempt was made
      - `failure_reason` (text) - Reason for failure if unsuccessful

  2. Security
    - Enable RLS on `login_attempts` table
    - Only service role can access this table (for security monitoring)
    - Add indexes for efficient rate limiting queries

  3. Important Notes
    - Used for rate limiting by email and IP address
    - Implement cleanup for old records (e.g., older than 24 hours)
    - Critical for preventing brute force attacks
*/

CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  ip_address text NOT NULL,
  success boolean DEFAULT false,
  attempted_at timestamptz DEFAULT now(),
  failure_reason text
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts(email, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip_address, attempted_at);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can access login attempts"
  ON login_attempts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);