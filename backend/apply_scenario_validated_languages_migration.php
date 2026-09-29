<?php

// Applies the language-validation migration: `scenarios.validated_languages`
// (one-shot backfill with each admin scenario's current languages) and the
// `clients.sees_draft_languages` tester flag.
//
// Idempotent - safe to re-run (the backfill only runs when the column is
// created). CLI equivalent of pasting
// database/add_scenario_validated_languages.sql into phpMyAdmin. RUN THIS
// BEFORE deploying the PHP that reads the new columns.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying language-validation migration (idempotent)...\n";
    $pdo->exec(file_get_contents(__DIR__ . '/database/add_scenario_validated_languages.sql'));
    echo "Migration applied successfully!\n\n";

    foreach ([['scenarios', 'validated_languages'], ['clients', 'sees_draft_languages']] as [$t, $c]) {
        $col = $db->fetch(
            "SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
            [$t, $c]
        );
        echo "$t.$c: " . ($col['t'] ?? 'MISSING') . "\n";
    }

    echo "\nAdmin scenarios and their validated languages:\n";
    foreach ($db->fetchAll('SELECT id, title, validated_languages FROM scenarios WHERE client_id IS NULL ORDER BY id') as $r) {
        echo "  #{$r['id']} {$r['title']}: " . ($r['validated_languages'] ?? 'NULL') . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
