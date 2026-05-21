<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Switching client_cards_metadata.version to DECIMAL(10,2)...\n";

    $sql = file_get_contents(__DIR__ . '/database/cards_version_decimal_migration.sql');

    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        function ($stmt) { return !empty($stmt); }
    );

    foreach ($statements as $statement) {
        if (!empty(trim($statement))) {
            $db->getConnection()->exec($statement);
        }
    }

    echo "✓ client_cards_metadata.version is now DECIMAL(10,2). Bumps are +0.01.\n";

} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
    exit(1);
}
