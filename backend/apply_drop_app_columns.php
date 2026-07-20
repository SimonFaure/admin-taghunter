<?php

// Applies the Tag Hunter Drop foundations migration (app column on
// go_loads/go_scores + go_scores re-key). Idempotent + guarded - safe to re-run.
// CLI equivalent of pasting database/add_drop_app_columns.sql into phpMyAdmin
// (run BEFORE deploying go.php). See project_taghunter_drop.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying Tag Hunter Drop app-column migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_drop_app_columns.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n";

    foreach (['go_loads', 'go_scores'] as $table) {
        $cols = $db->fetchAll("DESCRIBE $table");
        echo "\n$table:\n";
        foreach ($cols as $c) {
            if ($c['Field'] === 'app') {
                echo "  - app ({$c['Type']}, default {$c['Default']})\n";
            }
        }
        $idx = $db->fetchAll("SHOW INDEX FROM $table");
        $names = array_unique(array_map(fn($r) => $r['Key_name'], $idx));
        echo "  indexes: " . implode(', ', $names) . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
