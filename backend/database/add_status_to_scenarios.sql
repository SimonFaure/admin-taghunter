-- Add status column to scenarios table
-- Status represents the publication/lifecycle state of a scenario sent from Creator
-- Possible values: draft, published, archived (or any string sent by Creator)

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'draft';
