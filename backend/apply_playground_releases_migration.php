<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying playground releases migration (playground_releases)...\n";

    $migrationFile = __DIR__ . '/database/playground_releases_migration.sql';
    $sql = file_get_contents($migrationFile);

    // Strip comments before splitting on ';' -- a ';' inside a comment would
    // otherwise break the statement split (same approach as api/migrate.php).
    $sql = preg_replace('/--[^\n]*\n/', "\n", $sql);
    $sql = preg_replace('/\/\*.*?\*\//s', '', $sql);

    $statements = array_filter(array_map('trim', explode(';', $sql)));

    foreach ($statements as $statement) {
        if (!empty($statement)) {
            $db->query($statement);
        }
    }

    echo "Migration applied successfully!\n";

    foreach (['playground_releases'] as $table) {
        $result = $db->fetchAll("DESCRIBE $table");
        echo "\n$table structure:\n";
        foreach ($result as $column) {
            echo "  - {$column['Field']} ({$column['Type']})\n";
        }
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
