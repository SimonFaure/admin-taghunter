<?php

// Applies the GO/Spot player-language migration (client_scenarios.player_languages).
// Idempotent + guarded - safe to re-run. CLI equivalent of pasting
// database/add_go_player_languages.sql into phpMyAdmin (run BEFORE deploying
// go.php: its `load` action reads the new column).
// See project_go_spot_player_languages.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying GO/Spot player languages migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_go_player_languages.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n";

    $found = null;
    foreach ($db->fetchAll('DESCRIBE client_scenarios') as $c) {
        if ($c['Field'] === 'player_languages') $found = $c;
    }
    echo '  client_scenarios.player_languages: ' . ($found ? "{$found['Type']} (null: {$found['Null']})" : 'MISSING') . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
