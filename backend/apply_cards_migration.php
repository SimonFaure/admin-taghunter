<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying cards and devices migration...\n";

    $sql = file_get_contents(__DIR__ . '/database/cards_and_devices_migration.sql');

    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        function($stmt) { return !empty($stmt); }
    );

    foreach ($statements as $statement) {
        if (!empty(trim($statement))) {
            $db->getConnection()->exec($statement);
        }
    }

    echo "✓ Cards and devices tables created successfully!\n";
    echo "✓ Old client_cards table dropped if it existed\n";
    echo "\nTables created:\n";
    echo "  - client_cards_metadata (stores file version info)\n";
    echo "  - devices (stores device connections)\n";

} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
    exit(1);
}
