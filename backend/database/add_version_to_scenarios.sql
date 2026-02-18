-- Add version column to scenarios table
ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS `version` VARCHAR(50) NULL DEFAULT '1.0';
