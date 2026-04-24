-- Denormalized pattern rows. Each row represents one slot/cell in a pattern,
-- with its assignment type and a station key number.

CREATE TABLE IF NOT EXISTS pattern_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pattern_id INT NOT NULL,
  item_index INT NOT NULL,
  assignment_type VARCHAR(64) NOT NULL,
  station_key_number INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pattern_items_pattern (pattern_id),
  INDEX idx_pattern_items_index (pattern_id, item_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
