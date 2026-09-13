<?php

// Applies the GO/Spot durations migration (clients.duration_catalog,
// client_scenarios.durations, go_scores.duration_minutes). Idempotent + guarded -
// safe to re-run. CLI equivalent of pasting database/add_go_durations.sql into
// phpMyAdmin (run BEFORE deploying go.php + client_scenarios.php).
// See project_go_spot_durations.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying GO/Spot durations migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_go_durations.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n";

    $checks = [
        'clients' => 'duration_catalog',
        'client_scenarios' => 'durations',
        'go_scores' => 'duration_minutes',
    ];
    foreach ($checks as $table => $column) {
        $found = null;
        foreach ($db->fetchAll("DESCRIBE $table") as $c) {
            if ($c['Field'] === $column) $found = $c;
        }
        echo "  $table.$column: " . ($found ? "{$found['Type']} (null: {$found['Null']})" : 'MISSING') . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
