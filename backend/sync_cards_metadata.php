<?php
/**
 * Sync script to create database metadata for existing card files
 */

require_once __DIR__ . '/database/Database.php';

$db = Database::getInstance();

echo "=== SYNCING CARDS METADATA ===\n\n";

$baseDir = __DIR__ . '/../cards';

if (!is_dir($baseDir)) {
    echo "❌ Cards directory does not exist: $baseDir\n";
    exit(1);
}

$synced = 0;
$errors = 0;

$dirs = scandir($baseDir);
foreach ($dirs as $dir) {
    if ($dir !== '.' && $dir !== '..' && is_dir($baseDir . '/' . $dir)) {
        $clientId = (int)$dir;

        echo "Checking client $clientId...\n";

        // Check if client exists in clients table
        $client = $db->fetch('SELECT id FROM clients WHERE id = ?', [$clientId]);
        if (!$client) {
            echo "  ⚠️  Skipping: Client $clientId does not exist in clients table\n";
            continue;
        }

        // Check if metadata exists
        $metadata = $db->fetch(
            'SELECT * FROM client_cards_metadata WHERE client_id = ?',
            [$clientId]
        );

        if ($metadata) {
            echo "  ✓ Metadata already exists (version {$metadata['version']})\n";
            continue;
        }

        // Find the CSV file
        $clientDir = $baseDir . '/' . $clientId;
        $files = scandir($clientDir);
        $csvFile = null;

        foreach ($files as $file) {
            if ($file !== '.' && $file !== '..' && str_ends_with($file, '.csv')) {
                $csvFile = $file;
                break;
            }
        }

        if (!$csvFile) {
            echo "  ⚠️  No CSV file found\n";
            continue;
        }

        // Extract version from filename (e.g., cards_v1.csv -> 1)
        $version = 1;
        if (preg_match('/cards_v(\d+)\.csv/', $csvFile, $matches)) {
            $version = (int)$matches[1];
        } else {
            // If no version in filename, rename it
            $oldPath = $clientDir . '/' . $csvFile;
            $newPath = $clientDir . '/cards_v1.csv';
            if (rename($oldPath, $newPath)) {
                echo "  ℹ️  Renamed $csvFile to cards_v1.csv\n";
                $csvFile = 'cards_v1.csv';
            }
        }

        // Create metadata entry
        try {
            $db->execute(
                'INSERT INTO client_cards_metadata (client_id, version, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
                [$clientId, $version]
            );
            echo "  ✓ Created metadata entry (version $version)\n";
            $synced++;
        } catch (Exception $e) {
            echo "  ❌ Error creating metadata: " . $e->getMessage() . "\n";
            $errors++;
        }
    }
}

echo "\n=== SYNC COMPLETE ===\n";
echo "Synced: $synced\n";
echo "Errors: $errors\n";
