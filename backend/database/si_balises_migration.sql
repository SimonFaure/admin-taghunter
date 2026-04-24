-- Admin-managed station (balise) inventory used by the Creator's pattern editor.

CREATE TABLE IF NOT EXISTS si_balises (
  id INT AUTO_INCREMENT PRIMARY KEY,
  station_name VARCHAR(128) NOT NULL,
  station_function VARCHAR(128) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_si_balises_name (station_name)
);
