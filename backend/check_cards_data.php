<?php
/**
 * Diagnostic script to check cards data consistency
 * between database and filesystem
 */

require_once __DIR__ . '/database/Database.php';

$db = Database::getInstance();

echo "=== CARDS DATA DIAGNOSTIC ===\n\n";

// 1. Check database metadata
echo "1. DATABASE METADATA:\n";
echo "--------------------\n";
$allMetadata = $db->query('SELECT * FROM client_cards_metadata ORDER BY client_id');
if (empty($allMetadata)) {
    echo "⚠️  No metadata found in database!\n";
} else {
    foreach ($allMetadata as $meta) {
        echo "Client ID: {$meta['client_id']}, Version: {$meta['version']}, Created: {$meta['created_at']}\n";
    }
}
echo "\n";

// 2. Check filesystem
echo "2. FILESYSTEM:\n";
echo "--------------\n";
$baseDir = __DIR__ . '/../cards';
echo "Base directory: $baseDir\n";
if (!is_dir($baseDir)) {
    echo "⚠️  Cards directory does not exist!\n";
} else {
    echo "Cards directory exists: ✓\n";
    $dirs = scandir($baseDir);
    foreach ($dirs as $dir) {
        if ($dir !== '.' && $dir !== '..' && is_dir($baseDir . '/' . $dir)) {
            echo "\n  Client ID: $dir\n";
            $clientDir = $baseDir . '/' . $dir;
            $files = scandir($clientDir);
            foreach ($files as $file) {
                if ($file !== '.' && $file !== '..') {
                    $filePath = $clientDir . '/' . $file;
                    $size = filesize($filePath);
                    echo "    - $file (size: $size bytes)\n";
                }
            }
        }
    }
}
echo "\n";

// 3. Check for mismatches
echo "3. CONSISTENCY CHECK:\n";
echo "--------------------\n";
$issues = [];

// Check if metadata exists for each client with files
if (is_dir($baseDir)) {
    $dirs = scandir($baseDir);
    foreach ($dirs as $dir) {
        if ($dir !== '.' && $dir !== '..' && is_dir($baseDir . '/' . $dir)) {
            $clientId = (int)$dir;
            $metadata = $db->fetch(
                'SELECT * FROM client_cards_metadata WHERE client_id = ?',
                [$clientId]
            );

            if (!$metadata) {
                $issues[] = "⚠️  Client $clientId has files but NO database metadata";
            } else {
                // Check if the versioned file exists
                $expectedFile = $baseDir . '/' . $clientId . '/cards_v' . $metadata['version'] . '.csv';
                if (!file_exists($expectedFile)) {
                    $issues[] = "⚠️  Client $clientId metadata points to version {$metadata['version']} but file doesn't exist";
                } else {
                    echo "✓ Client $clientId is consistent (version {$metadata['version']})\n";
                }
            }
        }
    }
}

// Check if metadata exists for clients without files
foreach ($allMetadata as $meta) {
    $clientDir = $baseDir . '/' . $meta['client_id'];
    if (!is_dir($clientDir)) {
        $issues[] = "⚠️  Client {$meta['client_id']} has database metadata but NO files directory";
    }
}

echo "\n";

if (!empty($issues)) {
    echo "ISSUES FOUND:\n";
    echo "-------------\n";
    foreach ($issues as $issue) {
        echo "$issue\n";
    }
    echo "\n";
    echo "RECOMMENDATION: Run the sync script to fix inconsistencies.\n";
} else {
    echo "✓ All data is consistent!\n";
}

echo "\n=== END DIAGNOSTIC ===\n";
