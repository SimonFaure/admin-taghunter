<?php

// Applies the Tag Hunter GO foundations migration. The SQL is idempotent and
// guarded (information_schema checks + prepared statements), so it is safe to
// run on a fresh DB AND safe to re-run.
//
// NOTE: the guards use PREPARE/EXECUTE with session @vars, so the whole file
// must run on ONE connection as a multi-statement batch - we exec() it as a
// single string rather than splitting on ';'.
//
// PRODUCTION: prefer pasting database/add_taghunter_go_foundations.sql into
// phpMyAdmin (run BEFORE deploying the PHP). This script is the CLI equivalent.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying Tag Hunter GO foundations migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_taghunter_go_foundations.sql');
    // Run the whole batch on one connection so PREPARE/EXECUTE + @vars work.
    $pdo->exec($sql);

    echo "Migration applied successfully!\n";

    foreach (
        [
            'clients' => ['go_enabled', 'go_subscription_active', 'go_subscription_valid_until'],
            'client_scenarios' => ['mode', 'pattern_id'],
            'patterns' => ['mode', 'answer_count'],
        ] as $table => $cols
    ) {
        $result = $db->fetchAll("DESCRIBE $table");
        echo "\n$table:\n";
        foreach ($result as $column) {
            if (in_array($column['Field'], $cols, true)) {
                echo "  - {$column['Field']} ({$column['Type']}, default {$column['Default']})\n";
            }
        }
    }

    foreach (['go_loads', 'go_scores'] as $table) {
        $exists = $db->fetchAll("SHOW TABLES LIKE '$table'");
        echo "\ntable $table: " . (count($exists) ? "OK" : "MISSING") . "\n";
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
