<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying telemetry migration (error_reports + game_launches)...\n";

    $migrationFile = __DIR__ . '/database/add_telemetry_tables.sql';
    $sql = file_get_contents($migrationFile);

    $statements = array_filter(array_map('trim', explode(';', $sql)));

    foreach ($statements as $statement) {
        if (!empty($statement) && !preg_match('/^--/', $statement)) {
            $db->query($statement);
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
