<?php
// Backfill: ensure every existing client has an offline PIN-recovery pool.
//
// Idempotent — a client that already has codes is skipped, so re-running only
// fills gaps. New clients get a pool automatically on creation (clients.php)
// and on first pool view (recovery_codes.php), so this only needs to run once
// to cover clients that predate the feature.
//
// Run from CLI:  php backend/database/recovery_codes_seed.php

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/../utils/RecoveryCodes.php';

$db = Database::getInstance();
RecoveryCodes::ensureTables($db);

$clients = $db->fetchAll('SELECT id FROM clients ORDER BY id ASC');
$generated = 0;
$skipped = 0;

foreach ($clients as $row) {
    $clientId = (int)$row['id'];
    if (RecoveryCodes::ensureForClient($db, $clientId)) {
        $generated++;
        echo "client {$clientId}: generated a recovery pool\n";
    } else {
        $skipped++;
    }
}

echo "\nDone. {$generated} client(s) provisioned, {$skipped} already had codes (" . count($clients) . " total).\n";
