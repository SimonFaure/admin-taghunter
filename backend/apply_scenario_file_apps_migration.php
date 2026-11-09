<?php

// Applies the per-file apps migration: `scenario_files.apps`.
//
// Idempotent - safe to re-run. CLI equivalent of pasting
// database/add_scenario_file_apps.sql into phpMyAdmin. RUN THIS BEFORE
// deploying the PHP that reads the new column.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying scenario-file apps migration (idempotent)...\n";
    $pdo->exec(file_get_contents(__DIR__ . '/database/add_scenario_file_apps.sql'));
    echo "Migration applied successfully!\n\n";

    $col = $db->fetch(
        "SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scenario_files' AND COLUMN_NAME = 'apps'"
    );
    echo "scenario_files.apps: " . ($col['t'] ?? 'MISSING') . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
