<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $conn = $db->getConnection();

    $sql = file_get_contents(__DIR__ . '/database/add_long_lived_tokens_migration.sql');

    if ($sql === false) {
        die("Failed to read migration file\n");
    }

    $sql = preg_replace('/--[^\n]*\n/', "\n", $sql);
    $sql = preg_replace('/\/\*.*?\*\//s', '', $sql);

    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        function($stmt) {
            return !empty($stmt) && strlen(trim($stmt)) > 0;
        }
    );

    foreach ($statements as $statement) {
        $statement = trim($statement);
        if (empty($statement)) {
            continue;
        }

        try {
            $stmt = $conn->query($statement);
            if ($stmt) {
                $stmt->closeCursor();
            }
            echo "✓ Executed: " . substr($statement, 0, 80) . "...\n";
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), 'Duplicate column') !== false) {
                echo "✓ Column already exists, skipping\n";
            } else {
                echo "✗ Error: " . $e->getMessage() . "\n";
            }
        }
    }

    echo "\n✓ Migration completed successfully!\n";

} catch (Exception $e) {
    echo "✗ Failed: " . $e->getMessage() . "\n";
    exit(1);
}
