<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying devices timestamps migration...\n";

    $migrationFile = __DIR__ . '/database/add_devices_timestamps.sql';
    $sql = file_get_contents($migrationFile);

    $statements = array_filter(array_map('trim', explode(';', $sql)));

    foreach ($statements as $statement) {
        if (!empty($statement) && !preg_match('/^--/', $statement)) {
            $db->query($statement);
        }
    }

    echo "Migration applied successfully!\n";

    $result = $db->fetchAll('DESCRIBE devices');
    echo "\nDevices table structure:\n";
    foreach ($result as $column) {
        echo "  - {$column['Field']} ({$column['Type']})\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
