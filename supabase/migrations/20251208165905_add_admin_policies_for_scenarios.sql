/*
  # Add Admin Policies for Scenarios Table

  1. Changes
    - Add policy to allow admin users to read all scenarios
    - Add policy to allow admin users to update all scenarios
    - Add policy to allow admin users to delete all scenarios
    
  2. Security
    - Policies check if the user exists in the admin_profiles table
    - Only authenticated admin users can access all scenarios
    - Regular users still follow existing policies (can only see published or own scenarios)
*/

DROP POLICY IF EXISTS "Admins can read all scenarios" ON scenarios;
CREATE POLICY "Admins can read all scenarios"
  ON scenarios FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can update all scenarios" ON scenarios;
CREATE POLICY "Admins can update all scenarios"
  ON scenarios FOR UPDATE
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

DROP POLICY IF EXISTS "Admins can delete all scenarios" ON scenarios;
CREATE POLICY "Admins can delete all scenarios"
  ON scenarios FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE admin_profiles.id = auth.uid()
    )
  );