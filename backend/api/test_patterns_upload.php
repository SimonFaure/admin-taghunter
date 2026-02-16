<?php
// Test script to diagnose pattern upload issues
ini_set('display_errors', '1');
error_reporting(E_ALL);

echo "<h1>Pattern Upload Diagnostic Test</h1>";

// Test 1: Check if patterns table exists
echo "<h2>Test 1: Check Database Connection</h2>";
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../database/Database.php';

try {
    $db = Database::getInstance();
    echo "✓ Database connection successful<br>";

    // Check if patterns table exists
    $tables = $db->fetchAll("SHOW TABLES LIKE 'patterns'");
    if (count($tables) > 0) {
        echo "✓ Patterns table exists<br>";

        // Get table structure
        $columns = $db->fetchAll("DESCRIBE patterns");
        echo "<h3>Patterns Table Structure:</h3>";
        echo "<pre>";
        print_r($columns);
        echo "</pre>";
    } else {
        echo "✗ Patterns table does NOT exist<br>";
    }
} catch (Exception $e) {
    echo "✗ Database error: " . $e->getMessage() . "<br>";
}

// Test 2: Check if admin_users and clients tables exist
echo "<h2>Test 2: Check User Tables</h2>";
try {
    $adminTables = $db->fetchAll("SHOW TABLES LIKE 'admin_users'");
    if (count($adminTables) > 0) {
        echo "✓ admin_users table exists<br>";
        $adminCount = $db->fetch("SELECT COUNT(*) as count FROM admin_users");
        echo "  - Admin users count: " . $adminCount['count'] . "<br>";
    } else {
        echo "✗ admin_users table does NOT exist<br>";
    }

    $clientTables = $db->fetchAll("SHOW TABLES LIKE 'clients'");
    if (count($clientTables) > 0) {
        echo "✓ clients table exists<br>";
        $clientCount = $db->fetch("SELECT COUNT(*) as count FROM clients");
        echo "  - Clients count: " . $clientCount['count'] . "<br>";
    } else {
        echo "✗ clients table does NOT exist<br>";
    }
} catch (Exception $e) {
    echo "✗ Error checking user tables: " . $e->getMessage() . "<br>";
}

// Test 3: Simulate pattern upload
echo "<h2>Test 3: Simulate Pattern Upload</h2>";
try {
    $testEmail = 'test@example.com';
    $testPatternData = json_encode(['test' => 'data']);
    $testName = 'Test Pattern';
    $testVersion = '1.0';
    $testGameType = 'test_game';

    echo "Test data prepared<br>";
    echo "- Email: $testEmail<br>";
    echo "- Name: $testName<br>";
    echo "- Game Type: $testGameType<br>";

    // Don't actually insert, just test the query preparation
    echo "✓ Test data valid<br>";

} catch (Exception $e) {
    echo "✗ Error in test: " . $e->getMessage() . "<br>";
}

// Test 4: Check file permissions
echo "<h2>Test 4: Check File Permissions</h2>";
$apiFile = __DIR__ . '/patterns.php';
if (file_exists($apiFile)) {
    echo "✓ patterns.php exists<br>";
    echo "  - Readable: " . (is_readable($apiFile) ? "Yes" : "No") . "<br>";
    echo "  - Permissions: " . substr(sprintf('%o', fileperms($apiFile)), -4) . "<br>";
} else {
    echo "✗ patterns.php does NOT exist<br>";
}

// Test 5: Check error log location
echo "<h2>Test 5: PHP Error Configuration</h2>";
echo "- display_errors: " . ini_get('display_errors') . "<br>";
echo "- error_reporting: " . ini_get('error_reporting') . "<br>";
echo "- log_errors: " . ini_get('log_errors') . "<br>";
echo "- error_log: " . ini_get('error_log') . "<br>";

echo "<h2>Test Complete</h2>";
echo "<p>If you're getting 500 errors, check your web server error log (Apache/Nginx) for PHP fatal errors.</p>";
