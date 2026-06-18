<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying update-channel migration (clients/devices/playground_releases)...\n";

    $migrationFile = __DIR__ . '/database/add_update_channel_columns.sql';
    $sql = file_get_contents($migrationFile);

    // Strip comments before splitting on ';' -- a ';' inside a comment would
    // otherwise break the statement split (same approach as the other runners;
    // see project_studio_migration_runner_bugs).
    $sql = preg_replace('/--[^\n]*\n/', "\n", $sql);
    $sql = preg_replace('/\/\*.*?\*\//s', '', $sql);

    $statements = array_filter(array_map('trim', explode(';', $sql)));

    foreach ($statements as $statement) {
        if (!empty($statement)) {
            $db->query($statement);
        }
    }

    echo "Migration applied successfully!\n";

    foreach (['clients', 'devices', 'playground_releases'] as $table) {
        $result = $db->fetchAll("DESCRIBE $table");
        echo "\n$table.update_channel/channel:\n";
        foreach ($result as $column) {
            if (in_array($column['Field'], ['update_channel', 'channel'], true)) {
                echo "  - {$column['Field']} ({$column['Type']}, default {$column['Default']})\n";
            }
        }
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
