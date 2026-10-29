<?php

// Applies the scenario-checklist migration: `scenarios.target_languages`,
// `scenarios.cover_has_text` and `scenario_files.doc_type`.
//
// Idempotent - safe to re-run. CLI equivalent of pasting
// database/add_scenario_checklist_columns.sql into phpMyAdmin. RUN THIS BEFORE
// deploying the PHP that reads the new columns.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying scenario-checklist migration (idempotent)...\n";
    $pdo->exec(file_get_contents(__DIR__ . '/database/add_scenario_checklist_columns.sql'));
    echo "Migration applied successfully!\n\n";

    foreach ([['scenarios', 'target_languages'], ['scenarios', 'cover_has_text'], ['scenario_files', 'doc_type']] as [$t, $c]) {
        $col = $db->fetch(
            "SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
            [$t, $c]
        );
        echo "$t.$c: " . ($col['t'] ?? 'MISSING') . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
