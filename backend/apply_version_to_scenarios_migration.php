<?php
$config = require __DIR__ . '/config/database.php';

try {
    $pdo = new PDO(
        "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset={$config['charset']}",
        $config['username'],
        $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $stmt = $pdo->query("SHOW COLUMNS FROM scenarios LIKE 'version'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE scenarios ADD COLUMN `version` VARCHAR(50) NULL DEFAULT '1.0'");
        echo "OK: 'version' column added to scenarios table.\n";
    } else {
        echo "SKIP: 'version' column already exists.\n";
    }
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
