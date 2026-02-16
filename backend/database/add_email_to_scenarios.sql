-- Add email column to scenarios table
-- This allows scenarios to be associated with users via email instead of foreign key relationships

ALTER TABLE scenarios
ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL AFTER client_id,
ADD INDEX idx_email (email);

-- Update existing scenarios to populate email from client_id
UPDATE scenarios s
LEFT JOIN clients c ON s.client_id = c.id
LEFT JOIN admin_users a ON s.created_by = a.id
SET s.email = COALESCE(c.email, a.email)
WHERE s.email IS NULL;
