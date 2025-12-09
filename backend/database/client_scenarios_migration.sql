-- Migration: Client Scenarios
-- This table tracks which product scenarios clients have purchased/been granted access to

CREATE TABLE IF NOT EXISTS client_scenarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    client_id INT NOT NULL,
    scenario_id INT NOT NULL,
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    granted_by INT NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_client_scenario (client_id, scenario_id),
    INDEX idx_client_id (client_id),
    INDEX idx_scenario_id (scenario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
