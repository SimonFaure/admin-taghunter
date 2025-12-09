/*
  # Add user_type support to auth_tokens table

  1. Changes
    - Add `user_type` column to auth_tokens table (client or admin)
    - Rename `client_id` to `user_id` for clarity
    - Drop foreign key constraint to clients table
    - Update RLS policies to support both user types

  2. Security
    - Update RLS policies to work with both clients and admin_users
    - Maintain security by checking user_type

  3. Important Notes
    - Existing tokens will be marked as 'client' type by default
    - Tokens can now reference either clients or admin_users
    - The user_id column stores the UUID of the user (client or admin)
*/

DO $$
BEGIN
  -- Add user_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_tokens' AND column_name = 'user_type'
  ) THEN
    ALTER TABLE auth_tokens ADD COLUMN user_type text DEFAULT 'client' CHECK (user_type IN ('client', 'admin'));
  END IF;

  -- Drop the foreign key constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'auth_tokens'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%client_id%'
  ) THEN
    ALTER TABLE auth_tokens DROP CONSTRAINT auth_tokens_client_id_fkey;
  END IF;

  -- Rename client_id to user_id if not already renamed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_tokens' AND column_name = 'client_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'auth_tokens' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE auth_tokens RENAME COLUMN client_id TO user_id;
  END IF;
END $$;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Clients can read own tokens" ON auth_tokens;
DROP POLICY IF EXISTS "Service role can manage all tokens" ON auth_tokens;

-- Create new policies that support both user types
CREATE POLICY "Users can read own tokens"
  ON auth_tokens FOR SELECT
  TO authenticated
  USING (
    (user_type = 'client' AND auth.uid() = user_id) OR
    (user_type = 'admin' AND auth.uid() = user_id)
  );

CREATE POLICY "Service role can manage all tokens"
  ON auth_tokens FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create index on user_type for better query performance
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens(user_type);
