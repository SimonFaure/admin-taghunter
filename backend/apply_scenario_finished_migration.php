<?php

// Applies the scenario-overview migration: `scenarios.finished_at` and
// `scenarios.finished_by` (the "fully finished" tick).
//
// Idempotent - safe to re-run. CLI equivalent of pasting
// database/add_scenario_finished.sql into phpMyAdmin. RUN THIS BEFORE
// deploying the PHP that reads the new columns.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying scenario-finished migration (idempotent)...\n";
    $pdo->exec(file_get_contents(__DIR__ . '/database/add_scenario_finished.sql'));
    echo "Migration applied successfully!\n\n";

    foreach (['finished_at', 'finished_by'] as $c) {
        $col = $db->fetch(
            "SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scenarios' AND COLUMN_NAME = ?",
            [$c]
        );
        echo "scenarios.$c: " . ($col['t'] ?? 'MISSING') . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
