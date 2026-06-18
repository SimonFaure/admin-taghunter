<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $conn = $db->getConnection();

    echo "Applying game_types.enabled / client_game_type_overrides.enabled migration...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_game_type_enabled.sql');
    if ($sql === false) {
        die("Failed to read migration file\n");
    }

    $sql = preg_replace('/--[^\n]*\n/', "\n", $sql);
    $sql = preg_replace('/\/\*.*?\*\//s', '', $sql);

    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        function ($stmt) { return strlen(trim($stmt)) > 0; }
    );

    foreach ($statements as $statement) {
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

    echo "\ngame_types table structure:\n";
    foreach ($db->fetchAll('DESCRIBE game_types') as $column) {
        echo "  - {$column['Field']} ({$column['Type']})\n";
    }
    echo "\ngame_types enabled state:\n";
    foreach ($db->fetchAll('SELECT code, enabled FROM game_types ORDER BY code') as $row) {
        echo "  - {$row['code']}: " . ((int)$row['enabled'] ? 'enabled' : 'DISABLED') . "\n";
    }

    echo "\n✓ Migration completed successfully!\n";
} catch (Exception $e) {
    echo "✗ Failed: " . $e->getMessage() . "\n";
    exit(1);
}
