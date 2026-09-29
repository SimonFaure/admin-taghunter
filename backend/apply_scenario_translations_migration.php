<?php

// Applies the scenario-translations migration: per-file language + language
// variants + localized file titles on `scenario_files`, the new
// `scenario_file_texts` table, and `scenarios.translation_meta`.
//
// Idempotent - safe to re-run. CLI equivalent of pasting
// database/add_scenario_translations_migration.sql into phpMyAdmin. RUN THIS
// BEFORE deploying scenario_files.php / scenario_translations.php, which SELECT
// the new columns. See plans/here-is-a-translation-transient-boot.md.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying scenario-translations migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_scenario_translations_migration.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n\nscenario_files:\n";
    foreach ($db->fetchAll('DESCRIBE scenario_files') as $c) {
        echo "  - {$c['Field']} ({$c['Type']})\n";
    }

    echo "\nscenario_file_texts:\n";
    foreach ($db->fetchAll('DESCRIBE scenario_file_texts') as $c) {
        echo "  - {$c['Field']} ({$c['Type']})\n";
    }

    $texts = $db->fetch('SELECT COUNT(*) AS n FROM scenario_file_texts');
    echo "  rows: " . (int)($texts['n'] ?? 0) . "\n";

    echo "\nscenarios.translation_meta: ";
    $col = $db->fetch(
        "SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scenarios'
            AND COLUMN_NAME = 'translation_meta'"
    );
    echo ($col['t'] ?? 'MISSING') . "\n";

    // The backfill stamps every pre-existing file with its scenario's default
    // language; report what is left unstamped so a re-run is easy to read.
    $unstamped = $db->fetch('SELECT COUNT(*) AS n FROM scenario_files WHERE language IS NULL');
    echo "scenario_files with no language: " . (int)($unstamped['n'] ?? 0) . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
