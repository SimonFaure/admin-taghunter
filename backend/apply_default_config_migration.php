<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying default_config migration...\n";

    $sql = file_get_contents(__DIR__ . '/database/default_config_migration.sql');

    $statements = array_filter(array_map('trim', explode(';', $sql)));

    foreach ($statements as $statement) {
        if (!empty($statement)) {
            $db->query($statement);
            echo "Executed: " . substr($statement, 0, 100) . "...\n";
        }
    }

    echo "Migration completed successfully!\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
