<?php

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();

    echo "Applying client device-lock migration (clients.devices_disabled / billing_overdue_since / billing_grace_days / billing_reprieve_days, recovery_codes.used_context)...\n";

    $migrationFile = __DIR__ . '/database/add_client_device_lock_migration.sql';
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

    $cols = ['devices_disabled', 'billing_overdue_since', 'billing_grace_days', 'billing_reprieve_days'];
    $result = $db->fetchAll('DESCRIBE clients');
    echo "clients lock columns:\n";
    foreach ($result as $column) {
        if (in_array($column['Field'], $cols, true)) {
            echo "  - {$column['Field']} ({$column['Type']}, default {$column['Default']})\n";
        }
    }

    $result = $db->fetchAll('DESCRIBE recovery_codes');
    echo "\nrecovery_codes.used_context:\n";
    foreach ($result as $column) {
        if ($column['Field'] === 'used_context') {
            echo "  - {$column['Field']} ({$column['Type']}, default {$column['Default']})\n";
        }
    }

} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
