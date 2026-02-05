<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Fixing client_id data type in client_cards_metadata table...\n";

    $sql = file_get_contents(__DIR__ . '/database/fix_cards_metadata_client_id_type.sql');

    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        function($stmt) { return !empty($stmt) && strpos($stmt, '--') !== 0; }
    );

    foreach ($statements as $statement) {
        if (!empty(trim($statement))) {
            echo "Executing: " . substr($statement, 0, 100) . "...\n";
            $db->getConnection()->exec($statement);
        }
    }

    echo "✓ client_cards_metadata.client_id changed from VARCHAR(255) to INT successfully!\n";
    echo "✓ This matches the clients.id column type\n";

} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
    exit(1);
}
