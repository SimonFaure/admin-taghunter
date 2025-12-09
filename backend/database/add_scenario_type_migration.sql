-- Add scenario_type column to scenarios table
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS scenario_type VARCHAR(100) DEFAULT NULL AFTER game_type;
