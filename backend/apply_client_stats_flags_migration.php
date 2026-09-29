<?php

// Applies the per-client statistics flags migration
// (clients.stats_excluded_global + clients.stats_disabled).
// The SQL is idempotent and guarded (information_schema check + PREPARE/EXECUTE
// with session @vars), so it must run on ONE connection as a single batch - we
// exec() it whole rather than splitting on ';'.
//
// PRODUCTION: prefer pasting database/add_client_stats_flags.sql into phpMyAdmin
// (run BEFORE deploying the PHP). This script is the CLI equivalent.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying client stats flags migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_client_stats_flags.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n\nclients:\n";
    foreach ($db->fetchAll('DESCRIBE clients') as $column) {
        if (in_array($column['Field'], ['stats_excluded_global', 'stats_disabled'], true)) {
            echo "  - {$column['Field']} ({$column['Type']}, default {$column['Default']})\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
