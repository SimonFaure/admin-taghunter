<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

require_once __DIR__ . '/../config/database.php';

header('Content-Type: application/json');

try {
    $config = require __DIR__ . '/../config/database.php';

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        $config['host'],
        $config['port'],
        $config['database'],
        $config['charset']
    );

    $conn = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    $stmt = $conn->query("SHOW COLUMNS FROM auth_tokens LIKE 'long_lived'");
    $columnExists = $stmt->fetch();

    if ($columnExists) {
        echo json_encode([
            'success' => true,
            'message' => 'Column long_lived already exists',
            'action' => 'none'
        ]);
        exit;
    }

    $conn->exec("SET @dbname = DATABASE()");
    $conn->exec("SET @tablename = 'auth_tokens'");
    $conn->exec("SET @columnname = 'long_lived'");

    $conn->exec("SET @preparedStatement = (SELECT IF(
        (
            SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = @dbname
            AND TABLE_NAME = @tablename
            AND COLUMN_NAME = @columnname
        ) > 0,
        'SELECT 1',
        CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' BOOLEAN DEFAULT FALSE AFTER revoked')
    ))");

    $conn->exec("PREPARE alterIfNotExists FROM @preparedStatement");
    $conn->exec("EXECUTE alterIfNotExists");
    $conn->exec("DEALLOCATE PREPARE alterIfNotExists");

    echo json_encode([
        'success' => true,
        'message' => 'Column long_lived added successfully',
        'action' => 'added'
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
