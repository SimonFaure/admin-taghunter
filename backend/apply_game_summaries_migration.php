<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying game_summaries migration...\n";

    $migrationFile = __DIR__ . '/database/add_game_summaries_table.sql';
    $sql = file_get_contents($migrationFile);

    $statements = array_filter(array_map('trim', explode(';', $sql)));

    foreach ($statements as $statement) {
        $codeLines = array_filter(
            preg_split('/\r?\n/', $statement),
            fn($line) => !preg_match('/^\s*--/', $line)
        );
        $code = trim(implode("\n", $codeLines));
        if ($code !== '') {
            $db->query($code);
        }
    }

    echo "Migration applied successfully!\n";

    $result = $db->fetchAll('DESCRIBE game_summaries');
    echo "\ngame_summaries structure:\n";
    foreach ($result as $column) {
        echo "  - {$column['Field']} ({$column['Type']})\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
