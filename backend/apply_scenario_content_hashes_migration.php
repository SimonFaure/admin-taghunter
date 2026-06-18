<?php
// One-shot migration runner for the scenario content-hash columns.
// Mirrors apply_version_to_scenarios_migration.php (column-existence guarded,
// safe to re-run). After adding the columns it runs the backfill so existing
// scenarios get hashes immediately.

$config = require __DIR__ . '/config/database.php';

try {
    $pdo = new PDO(
        "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset={$config['charset']}",
        $config['username'],
        $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $cols = [
        'data_hash'    => "ALTER TABLE scenarios ADD COLUMN `data_hash` CHAR(64) NULL",
        'content_hash' => "ALTER TABLE scenarios ADD COLUMN `content_hash` CHAR(64) NULL",
        'media_hashes' => "ALTER TABLE scenarios ADD COLUMN `media_hashes` LONGTEXT NULL",
    ];
    foreach ($cols as $name => $ddl) {
        $stmt = $pdo->query("SHOW COLUMNS FROM scenarios LIKE " . $pdo->quote($name));
        if ($stmt->rowCount() === 0) {
            $pdo->exec($ddl);
            echo "OK: '$name' column added to scenarios.\n";
        } else {
            echo "SKIP: '$name' column already exists.\n";
        }
    }

    echo "Running hash backfill...\n";
    require __DIR__ . '/database/scenario_hashes_backfill.php';
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}
