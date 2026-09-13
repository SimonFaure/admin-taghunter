<?php

// Applies the "Tag Hunter Drop -> Tag Hunter Spot" rename migration:
// clients.drop_* -> spot_*, the go_scores/go_loads/go_tutorial_slides `app`
// ENUM value, client_scenarios.mode, and the authored JSON keys inside
// scenarios (adaptable_drop / drop_question).
//
// Idempotent + guarded - safe to re-run, and a no-op on a database that never
// had the Drop naming. CLI equivalent of pasting
// database/rename_drop_to_spot.sql into phpMyAdmin.
//
// RUN THIS BEFORE deploying go.php / client_scenarios.php / clients.php /
// secure_auth.php - the new code reads spot_* and writes app='spot'.
// See project_taghunter_spot.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying Drop -> Spot rename migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/rename_drop_to_spot.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n\n";

    // ---- report ------------------------------------------------------------
    $clientCols = $db->fetchAll("SHOW COLUMNS FROM clients");
    $names = array_map(fn($c) => $c['Field'], $clientCols);
    echo "clients:\n";
    foreach (['spot_enabled', 'spot_billing_ok', 'spot_billing_overdue_since', 'spot_billing_grace_days'] as $c) {
        echo "  - $c: " . (in_array($c, $names, true) ? 'present' : 'MISSING') . "\n";
    }
    $legacy = array_values(array_filter($names, fn($n) => strpos($n, 'drop_') === 0));
    echo "  - legacy drop_* columns left: " . ($legacy ? implode(', ', $legacy) : 'none') . "\n";

    foreach (['go_loads', 'go_scores', 'go_tutorial_slides'] as $table) {
        $exists = $db->fetch(
            "SELECT COUNT(*) c FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
            [$table]
        );
        if (empty($exists['c'])) { echo "\n$table: (table absent)\n"; continue; }
        $col = $db->fetch(
            "SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'app'",
            [$table]
        );
        echo "\n$table.app: " . ($col['COLUMN_TYPE'] ?? '(absent)') . "\n";
    }

    $modes = $db->fetchAll("SELECT mode, COUNT(*) c FROM client_scenarios GROUP BY mode");
    echo "\nclient_scenarios.mode:\n";
    foreach ($modes as $m) {
        echo "  - {$m['mode']}: {$m['c']}\n";
    }

    $stale = $db->fetch(
        "SELECT COUNT(*) c FROM scenarios
          WHERE data LIKE '%\"adaptable_drop\"%' OR data LIKE '%\"drop_question\"%'"
    );
    echo "\nscenarios still carrying Drop JSON keys: " . (int)($stale['c'] ?? 0) . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
