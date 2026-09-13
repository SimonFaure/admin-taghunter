<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying Client App columns migration (clients.playground_enabled / go_billing_* / spot_*)...\n";

    $migrationFile = __DIR__ . '/database/add_client_app_columns.sql';
    $sql = file_get_contents($migrationFile);

    // Strip comments before splitting on ';' -- a ';' inside a comment would
    // otherwise break the statement split (same approach as the other runners;
    // see project_studio_migration_runner_bugs).
    $sql = preg_replace('/--[^\n]*\n/', "\n", $sql);
    $sql = preg_replace('/\/\*.*?\*\//s', '', $sql);

    $statements = array_filter(array_map('trim', explode(';', $sql)));

    foreach ($statements as $statement) {
        if (!empty($statement)) {
            $db->query($statement);
        }
    }

    echo "Migration applied successfully!\n\n";

    $cols = [
        'playground_enabled',
        'go_billing_overdue_since', 'go_billing_grace_days',
        'spot_enabled', 'spot_billing_ok', 'spot_billing_overdue_since', 'spot_billing_grace_days',
    ];
    $result = $db->fetchAll('DESCRIBE clients');
    echo "clients per-app columns:\n";
    foreach ($result as $column) {
        if (in_array($column['Field'], $cols, true)) {
            echo "  - {$column['Field']} ({$column['Type']}, default {$column['Default']})\n";
        }
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
