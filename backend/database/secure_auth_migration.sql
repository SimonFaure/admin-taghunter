-- Secure Authentication Tables Migration
-- Creates tables required for secure authentication with OTP codes, tokens, and rate limiting

-- Auth Tokens Table
-- Stores authentication tokens for both client and admin sessions
CREATE TABLE IF NOT EXISTS auth_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    user_type VARCHAR(20) DEFAULT 'client',
    token VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_token (token),
    INDEX idx_user_id (user_id),
    INDEX idx_user_type (user_type),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Login Attempts Table
-- Tracks login attempts for rate limiting and security monitoring
CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    success BOOLEAN DEFAULT FALSE,
    failure_reason VARCHAR(255),
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_ip_address (ip_address),
    INDEX idx_attempted_at (attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-Time Codes Table
-- Stores OTP codes and magic link tokens for passwordless authentication
CREATE TABLE IF NOT EXISTS one_time_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    ip_address VARCHAR(45),
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_code (code),
    INDEX idx_expires_at (expires_at),
    INDEX idx_email_code (email, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
