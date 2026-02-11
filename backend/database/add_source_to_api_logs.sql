-- Add source column to api_logs table to differentiate between admin and creator API calls

ALTER TABLE api_logs
ADD COLUMN source VARCHAR(20) DEFAULT 'admin' AFTER status_code,
ADD INDEX idx_source (source);

-- Update existing records to have 'admin' source
UPDATE api_logs SET source = 'admin' WHERE source IS NULL;
