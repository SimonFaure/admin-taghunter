<?php

// Applies the "use my logo on reports" client flag migration
// (clients.report_use_brand_logo). The SQL is idempotent and guarded
// (information_schema check + PREPARE/EXECUTE with session @vars), so it must run
// on ONE connection as a single batch - we exec() it whole rather than splitting
// on ';'.
//
// PRODUCTION: prefer pasting database/add_report_use_brand_logo.sql into
// phpMyAdmin (run BEFORE deploying the PHP). This script is the CLI equivalent.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying report_use_brand_logo migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_report_use_brand_logo.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n\nclients:\n";
    foreach ($db->fetchAll('DESCRIBE clients') as $column) {
        if ($column['Field'] === 'report_use_brand_logo') {
            echo "  - {$column['Field']} ({$column['Type']}, default {$column['Default']})\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
