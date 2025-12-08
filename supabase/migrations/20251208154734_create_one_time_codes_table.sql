/*
  # Create one_time_codes table for OTP/magic link authentication

  1. New Tables
    - `one_time_codes`
      - `id` (uuid, primary key)
      - `email` (text) - Email address for the code
      - `code` (text) - One-time code (6-digit or magic link token)
      - `expires_at` (timestamptz) - Code expiration (10-15 minutes)
      - `used` (boolean) - Whether code has been used
      - `created_at` (timestamptz) - Code creation timestamp
      - `ip_address` (text) - IP address that requested the code

  2. Security
    - Enable RLS on `one_time_codes` table
    - Only service role can access (codes should never be exposed to clients)
    - Add indexes for efficient code lookup and validation

  3. Important Notes
    - Codes expire after 10-15 minutes
    - Once used, cannot be reused (used flag)
    - Implement cleanup for expired/used codes
    - Rate limit code generation per email/IP
*/

CREATE TABLE IF NOT EXISTS one_time_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  ip_address text
);

CREATE INDEX IF NOT EXISTS idx_one_time_codes_email_code ON one_time_codes(email, code);
CREATE INDEX IF NOT EXISTS idx_one_time_codes_expires ON one_time_codes(expires_at);

ALTER TABLE one_time_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can access one-time codes"
  ON one_time_codes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);