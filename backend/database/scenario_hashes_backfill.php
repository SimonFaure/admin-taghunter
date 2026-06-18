<?php
// One-time backfill: compute data_hash / content_hash / media_hashes for every
// existing scenario. Safe to re-run (recompute is idempotent and the size/mtime
// guard makes repeat runs cheap). Invoked automatically by
// apply_scenario_content_hashes_migration.php, or runnable standalone:
//   php backend/database/scenario_hashes_backfill.php

if (!isset($pdo) || !($pdo instanceof PDO)) {
    $config = require __DIR__ . '/../config/database.php';
    $pdo = new PDO(
        "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset={$config['charset']}",
        $config['username'],
        $config['password'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
}

require_once __DIR__ . '/../utils/ScenarioHashes.php';

$rows = $pdo->query('SELECT uniqid FROM scenarios')->fetchAll(PDO::FETCH_ASSOC);
$total = count($rows);
$done = 0;
foreach ($rows as $r) {
    $uniqid = $r['uniqid'] ?? '';
    if ($uniqid === '') {
        continue;
    }
    try {
        ScenarioHashes::recompute($pdo, $uniqid);
        $done++;
    } catch (Exception $e) {
        echo "  WARN: $uniqid failed: " . $e->getMessage() . "\n";
    }
}
echo "Backfill complete: hashed $done / $total scenarios.\n";
