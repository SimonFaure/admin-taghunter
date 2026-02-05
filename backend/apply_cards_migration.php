<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Creating client_cards table...\n";

    $sql = file_get_contents(__DIR__ . '/database/client_cards_migration.sql');

    $db->getConnection()->exec($sql);

    echo "✓ client_cards table created successfully!\n";

} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
    exit(1);
}
