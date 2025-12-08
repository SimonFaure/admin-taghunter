-- Add Roles to Admin Users
-- This migration adds a role column to admin_users table

ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS role ENUM('admin', 'editor', 'viewer') DEFAULT 'editor' NOT NULL
AFTER name;

-- Update existing admin user to have admin role
UPDATE admin_users
SET role = 'admin'
WHERE email = 'admin@taghunter.fr';
