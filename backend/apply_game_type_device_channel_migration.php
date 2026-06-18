<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying device/channel game-type override migration...\n";

    $migrationFile = __DIR__ . '/database/add_game_type_device_channel_overrides.sql';
    $sql = file_get_contents($migrationFile);

    // Strip comments before splitting on ';' (see project_studio_migration_runner_bugs).
    $sql = preg_replace('/--[^\n]*\n/', "\n", $sql);
    $sql = preg_replace('/\/\*.*?\*\//s', '', $sql);

    $statements = array_filter(array_map('trim', explode(';', $sql)));
    foreach ($statements as $statement) {
        if (!empty($statement)) {
            $db->query($statement);
        }
    }

    echo "Migration applied successfully!\n";
    foreach (['device_game_type_overrides', 'channel_game_type_overrides'] as $table) {
        $result = $db->fetchAll("DESCRIBE $table");
        echo "\n$table:\n";
        foreach ($result as $column) {
            echo "  - {$column['Field']} ({$column['Type']})\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
