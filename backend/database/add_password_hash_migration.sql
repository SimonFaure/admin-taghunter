-- Add password_hash column to clients table
-- This allows clients to authenticate with passwords

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT NULL
AFTER email;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_password_hash ON clients(password_hash);
