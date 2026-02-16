<?php
require_once __DIR__ . '/config/database.php';

try {
    $pdo = getDbConnection();

    echo "Starting migration: Add email column to scenarios table...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_email_to_scenarios.sql');

    $pdo->exec($sql);

    echo "Migration completed successfully!\n";
    echo "Added email column to scenarios table and populated existing records.\n";
} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
