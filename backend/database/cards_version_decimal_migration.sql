-- Convert client_cards_metadata.version from INT to DECIMAL(10,2) so that
-- mutations increment by 0.01 instead of 1. Existing values (1, 2, 3, ...)
-- naturally convert to (1.00, 2.00, 3.00, ...).
ALTER TABLE client_cards_metadata
    MODIFY COLUMN version DECIMAL(10,2) NOT NULL DEFAULT 1.00;
