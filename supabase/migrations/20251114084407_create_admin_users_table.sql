/*
  # Admin Taghunter Database Setup

  ## Overview
  Creates the foundation for Admin Taghunter authentication system using Supabase Auth.

  ## What This Does
  This migration sets up a profile table that extends Supabase's built-in auth.users table
  to store additional admin user information.

  ## Tables Created
  
  ### `admin_profiles`
  - `id` (uuid, primary key) - Links to auth.users.id
  - `email` (text) - Admin email address
  - `full_name` (text) - Admin's full name
  - `role` (text) - Admin role (default: 'admin')
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  
  1. **Row Level Security (RLS)**
     - RLS is enabled on admin_profiles table
     - Only authenticated admins can view their own profile
     - Only authenticated admins can update their own profile
  
  2. **Policies Created**
     - "Admins can view own profile" - SELECT policy for authenticated users
     - "Admins can update own profile" - UPDATE policy for authenticated users

  ## Notes
  - Uses Supabase's built-in auth.users table for authentication
  - Profile is automatically linked via foreign key to auth.users
  - Cascade delete ensures profile is removed if user is deleted
*/

-- Create admin_profiles table
CREATE TABLE IF NOT EXISTS admin_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  role text DEFAULT 'admin',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view their own profile
CREATE POLICY "Admins can view own profile"
  ON admin_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Policy: Admins can update their own profile
CREATE POLICY "Admins can update own profile"
  ON admin_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_admin_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.admin_profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_admin_user();