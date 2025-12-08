-- Launched Games Table Migration
-- This table tracks when clients launch scenarios/games

CREATE TABLE IF NOT EXISTS launched_games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    scenario_id INT,
    game_title VARCHAR(255),
    launched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration_minutes INT DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    INDEX idx_client_id (client_id),
    INDEX idx_scenario_id (scenario_id),
    INDEX idx_launched_at (launched_at),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
