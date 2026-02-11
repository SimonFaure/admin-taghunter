<?php
// Apply migration to add source column to api_logs table

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    echo "Connected to database successfully.\n";

    // Read and execute migration
    $sql = file_get_contents(__DIR__ . '/database/add_source_to_api_logs.sql');

    // Split by semicolon and execute each statement
    $statements = array_filter(array_map('trim', explode(';', $sql)));

    foreach ($statements as $statement) {
        if (!empty($statement) && !preg_match('/^--/', $statement)) {
            echo "Executing: " . substr($statement, 0, 80) . "...\n";
            $db->execute($statement);
        }
    }

    echo "Migration applied successfully!\n";

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
