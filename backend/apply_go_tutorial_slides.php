<?php

// Applies the GO/Spot tutorial-carousel migration (go_tutorial_slides table).
// Idempotent - safe to re-run. CLI equivalent of pasting
// database/add_go_tutorial_slides.sql into phpMyAdmin (run BEFORE deploying
// go.php, which reads the table on `load`). See project_taghunter_go.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying GO tutorial-slides migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_go_tutorial_slides.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n\ngo_tutorial_slides:\n";
    foreach ($db->fetchAll('DESCRIBE go_tutorial_slides') as $c) {
        echo "  - {$c['Field']} ({$c['Type']})\n";
    }
    $rows = $db->fetch('SELECT COUNT(*) AS n FROM go_tutorial_slides');
    echo "  rows: " . (int)($rows['n'] ?? 0) . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
