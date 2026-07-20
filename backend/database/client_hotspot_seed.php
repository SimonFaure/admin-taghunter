<?php
// Backfill: ensure every existing client has a studio-authored Wi-Fi hotspot.
//
// Idempotent - a client that already has a lan_networks row is skipped, so
// re-running only fills gaps. New clients get a hotspot automatically on
// creation (clients.php) and on first admin read (clients.php?action=hotspot_get),
// so this only needs to run once to cover clients that predate the feature.
//
// Run from CLI:  php backend/database/client_hotspot_seed.php
// Or via apply_all_migrations.php?token=...&seeds=1

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/../utils/ClientHotspot.php';

$db = Database::getInstance();

$clients = $db->fetchAll('SELECT id, name FROM clients ORDER BY id ASC');
$generated = 0;
$skipped = 0;

foreach ($clients as $row) {
    $clientId = (int)$row['id'];
    if (ClientHotspot::ensureForClient($db, $clientId, $row['name'])) {
        $generated++;
        echo "client {$clientId}: seeded hotspot " . ClientHotspot::defaultSsid($row['name']) . "\n";
    } else {
        $skipped++;
    }
}

echo "\nDone. {$generated} client(s) seeded, {$skipped} already had a hotspot (" . count($clients) . " total).\n";
