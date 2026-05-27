<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying telemetry migration (error_reports + game_launches)...\n";

    $migrationFile = __DIR__ . '/database/add_telemetry_tables.sql';
    $sql = file_get_contents($migrationFile);

    $statements = array_filter(array_map('trim', explode(';', $sql)));

    foreach ($statements as $statement) {
        // Strip full-line `--` comments before deciding whether the chunk has
        // any SQL. A statement that merely *begins* with a comment header (the
        // first chunk does) must still run — checking `^--` on the whole chunk
        // skipped the error_reports CREATE entirely.
        $codeLines = array_filter(
            preg_split('/\r?\n/', $statement),
            fn($line) => !preg_match('/^\s*--/', $line)
        );
        $code = trim(implode("\n", $codeLines));
        if ($code !== '') {
            $db->query($code);
        }
    }

    echo "Migration applied successfully!\n";

    foreach (['error_reports', 'game_launches'] as $table) {
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
