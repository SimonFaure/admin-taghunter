-- Create API Logs Table for MySQL/MariaDB
-- This table stores all API request logs for monitoring and debugging

CREATE TABLE IF NOT EXISTS api_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  action VARCHAR(100),
  user_id INT,
  ip VARCHAR(45),
  user_agent TEXT,
  request_data JSON,
  response_data JSON,
  status_code INT DEFAULT 200,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestamp DESC),
  INDEX idx_endpoint (endpoint),
  INDEX idx_created_at (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
