/*
  # Update Admin Profiles Policies
  
  ## Changes
  This migration updates the Row Level Security policies on the admin_profiles table
  to allow authenticated admins to manage other admin users.
  
  ## Tables Modified
  - `admin_profiles` - Updated RLS policies
  
  ## Security
  1. **Row Level Security Updates**
     - Admins can view all admin profiles (not just their own)
     - Admins can insert new admin profiles
     - Admins can update all admin profiles
     - Admins can delete other admin profiles (but not their own via application logic)
  
  ## Policies
  - "Admins can view all profiles" - SELECT policy for authenticated users to view all admins
  - "Admins can insert profiles" - INSERT policy for authenticated users
  - "Admins can update all profiles" - UPDATE policy for authenticated users
  - "Admins can delete profiles" - DELETE policy for authenticated users
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can view own profile" ON admin_profiles;
DROP POLICY IF EXISTS "Admins can update own profile" ON admin_profiles;

-- Create new policies that allow admin management
CREATE POLICY "Admins can view all profiles"
  ON admin_profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert profiles"
  ON admin_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update all profiles"
  ON admin_profiles
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins can delete profiles"
  ON admin_profiles
  FOR DELETE
  TO authenticated
  USING (true);