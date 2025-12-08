-- Add game_data and game_type fields to scenarios table
-- This migration adds fields to store game configuration data and game type

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS game_data JSON NULL,
ADD COLUMN IF NOT EXISTS game_type VARCHAR(100) NULL;
