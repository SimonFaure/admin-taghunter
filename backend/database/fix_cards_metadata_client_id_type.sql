-- Fix client_id data type in client_cards_metadata table
-- Change from VARCHAR(255) to INT to match clients table

-- First, ensure all existing client_ids are valid integers
UPDATE client_cards_metadata
SET client_id = CAST(client_id AS UNSIGNED)
WHERE client_id REGEXP '^[0-9]+$';

-- Modify the column type to INT
ALTER TABLE client_cards_metadata
MODIFY COLUMN client_id INT NOT NULL;

-- Recreate the unique constraint if needed
ALTER TABLE client_cards_metadata
DROP INDEX IF EXISTS client_id,
ADD UNIQUE KEY client_id (client_id);
