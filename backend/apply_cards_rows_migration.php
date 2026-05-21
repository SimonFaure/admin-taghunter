<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying row-based cards migration...\n";

    $sql = file_get_contents(__DIR__ . '/database/cards_rows_migration.sql');

    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        function ($stmt) { return !empty($stmt); }
    );

    foreach ($statements as $statement) {
        if (!empty(trim($statement))) {
            $db->getConnection()->exec($statement);
        }
    }

    echo "✓ client_cards (row-based) table created.\n";
    echo "  Legacy client_cards table dropped if it existed.\n";
    echo "  client_cards_metadata.version is now bumped on every row mutation.\n";

} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
    exit(1);
}
