<?php

// Applies the "GO client only" client flag migration (clients.go_client_only).
// The SQL is idempotent and guarded (information_schema check + PREPARE/EXECUTE
// with session @vars), so it must run on ONE connection as a single batch - we
// exec() it whole rather than splitting on ';'.
//
// PRODUCTION: prefer pasting database/add_go_client_only.sql into phpMyAdmin
// (run BEFORE deploying the PHP). This script is the CLI equivalent.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying go_client_only migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_go_client_only.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n\nclients:\n";
    foreach ($db->fetchAll('DESCRIBE clients') as $column) {
        if ($column['Field'] === 'go_client_only') {
            echo "  - {$column['Field']} ({$column['Type']}, default {$column['Default']})\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
