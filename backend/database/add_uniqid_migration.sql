-- Add uniqid field to scenarios table
-- This migration adds a unique identifier field for each scenario

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS uniqid VARCHAR(50) NULL UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_uniqid ON scenarios(uniqid);
