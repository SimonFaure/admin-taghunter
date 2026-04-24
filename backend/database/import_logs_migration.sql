CREATE TABLE IF NOT EXISTS import_logs (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  file_name VARCHAR(512) NOT NULL,
  status ENUM('in_progress', 'success', 'failed') NOT NULL DEFAULT 'in_progress',
  logs JSON NULL,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_import_logs_created_at (created_at)
);
