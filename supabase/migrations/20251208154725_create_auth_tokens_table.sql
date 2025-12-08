/*
  # Create auth_tokens table for secure session management

  1. New Tables
    - `auth_tokens`
      - `id` (uuid, primary key)
      - `client_id` (uuid, foreign key to clients table)
      - `token` (text, unique) - JWT or secure random token
      - `expires_at` (timestamptz) - Token expiration timestamp
      - `created_at` (timestamptz) - Token creation timestamp
      - `ip_address` (text) - IP address of the client
      - `user_agent` (text) - User agent string
      - `revoked` (boolean) - Whether token has been revoked

  2. Security
    - Enable RLS on `auth_tokens` table
    - Add policy for clients to read only their own tokens
    - Add indexes for performance on token lookups and expiration checks

  3. Important Notes
    - Tokens should be securely generated and hashed
    - Expired tokens should be cleaned up regularly
    - Revoked tokens cannot be used even if not expired
*/

CREATE TABLE IF NOT EXISTS auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text,
  revoked boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_client_id ON auth_tokens(client_id);

ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read own tokens"
  ON auth_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = client_id);

CREATE POLICY "Service role can manage all tokens"
  ON auth_tokens FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);