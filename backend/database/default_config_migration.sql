CREATE TABLE IF NOT EXISTS default_config (
  id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
  meta VARCHAR(255) UNIQUE NOT NULL,
  value JSON NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_default_config_meta ON default_config(meta);
CREATE INDEX idx_default_config_version ON default_config(version);
