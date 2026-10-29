<?php

// Applies the licensee customers migration (licensee_customers,
// licensee_customers_meta, game_summaries.customer_*).
// The SQL is idempotent and guarded (information_schema check + PREPARE/EXECUTE
// with session @vars), so it must run on ONE connection as a single batch - we
// exec() it whole rather than splitting on ';'.
//
// PRODUCTION: prefer pasting database/add_licensee_customers.sql into phpMyAdmin
// (run BEFORE deploying the PHP). This script is the CLI equivalent.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying licensee customers migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_licensee_customers.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n\nlicensee_customers:\n";
    foreach ($db->fetchAll('DESCRIBE licensee_customers') as $column) {
        echo "  - {$column['Field']} ({$column['Type']})\n";
    }
    echo "\ngame_summaries:\n";
    foreach ($db->fetchAll('DESCRIBE game_summaries') as $column) {
        if (strpos($column['Field'], 'customer_') === 0) {
            echo "  - {$column['Field']} ({$column['Type']})\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
