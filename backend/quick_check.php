<?php
/**
 * Quick check of cards data for client_id=1
 */

require_once __DIR__ . '/database/Database.php';

$db = Database::getInstance();
$clientId = 1;

echo "=== QUICK CHECK FOR CLIENT ID: $clientId ===\n\n";

// 1. Check if client exists
echo "1. CLIENT EXISTS?\n";
$client = $db->fetch('SELECT * FROM clients WHERE id = ?', [$clientId]);
if ($client) {
    echo "✓ Client found: {$client['name']}\n";
} else {
    echo "✗ Client NOT found in database!\n";
    exit(1);
}
echo "\n";

// 2. Check metadata
echo "2. METADATA IN client_cards_metadata?\n";
$metadata = $db->fetch('SELECT * FROM client_cards_metadata WHERE client_id = ?', [$clientId]);
if ($metadata) {
    echo "✓ Metadata found:\n";
    echo "   - Version: {$metadata['version']}\n";
    echo "   - Created: {$metadata['created_at']}\n";
    echo "   - Updated: {$metadata['updated_at']}\n";
} else {
    echo "✗ NO metadata found in client_cards_metadata table!\n";
}
echo "\n";

// 3. Check files on disk
echo "3. FILES ON DISK?\n";
$baseDir = __DIR__ . '/../cards';
$clientDir = $baseDir . '/' . $clientId;

if (!is_dir($clientDir)) {
    echo "✗ Directory does NOT exist: $clientDir\n";
} else {
    echo "✓ Directory exists: $clientDir\n";
    $files = scandir($clientDir);
    $csvFiles = array_filter($files, function($f) use ($clientDir) {
        return !in_array($f, ['.', '..']) && is_file($clientDir . '/' . $f);
    });

    if (empty($csvFiles)) {
        echo "✗ No files found in directory!\n";
    } else {
        echo "Files found:\n";
        foreach ($csvFiles as $file) {
            $filePath = $clientDir . '/' . $file;
            $size = filesize($filePath);
            echo "   - $file ($size bytes)\n";
        }
    }
}
echo "\n";

// 4. Summary and action
echo "=== SUMMARY ===\n";
if (!$metadata && is_dir($clientDir) && !empty($csvFiles)) {
    echo "⚠️  PROBLEM: Files exist but NO database metadata!\n";
    echo "\n";
    echo "SOLUTION: Run the sync script:\n";
    echo "   cd backend\n";
    echo "   php sync_cards_metadata.php\n";
} elseif ($metadata && (!is_dir($clientDir) || empty($csvFiles))) {
    echo "⚠️  PROBLEM: Metadata exists but NO files on disk!\n";
    echo "\n";
    echo "SOLUTION: Either upload a new CSV or delete the metadata.\n";
} elseif (!$metadata && (!is_dir($clientDir) || empty($csvFiles))) {
    echo "⚠️  PROBLEM: No metadata AND no files!\n";
    echo "\n";
    echo "SOLUTION: Upload a CSV file through the UI.\n";
} else {
    echo "✓ Everything looks good!\n";
    if ($metadata) {
        $expectedFile = $clientDir . '/cards_v' . $metadata['version'] . '.csv';
        if (file_exists($expectedFile)) {
            echo "✓ Expected file exists: " . basename($expectedFile) . "\n";
        } else {
            echo "⚠️  Expected file missing: " . basename($expectedFile) . "\n";
        }
    }
}
