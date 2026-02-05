-- Add Long-Lived Tokens Support
-- Adds a column to track tokens that should last for 30 days (remember me feature)

ALTER TABLE auth_tokens
ADD COLUMN IF NOT EXISTS long_lived BOOLEAN DEFAULT FALSE AFTER revoked;
