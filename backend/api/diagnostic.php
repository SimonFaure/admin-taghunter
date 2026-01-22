<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$diagnostics = [
    'php_version' => phpversion(),
    'timestamp' => date('Y-m-d H:i:s'),
    'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'Unknown',
    'extensions' => [],
    'config_readable' => false,
    'database' => [
        'pdo_available' => extension_loaded('pdo'),
        'pdo_mysql_available' => extension_loaded('pdo_mysql'),
        'connection' => 'not_tested'
    ],
    'paths' => [
        'current_dir' => __DIR__,
        'config_exists' => file_exists(__DIR__ . '/../config/database.php'),
        'database_class_exists' => file_exists(__DIR__ . '/../database/Database.php'),
        'logger_exists' => file_exists(__DIR__ . '/../utils/Logger.php'),
        'cors_exists' => file_exists(__DIR__ . '/../utils/cors.php'),
        'security_headers_exists' => file_exists(__DIR__ . '/../utils/SecurityHeaders.php')
    ]
];

// Check PHP extensions
$required_extensions = ['pdo', 'pdo_mysql', 'json', 'mbstring'];
foreach ($required_extensions as $ext) {
    $diagnostics['extensions'][$ext] = extension_loaded($ext);
}

// Try to read config
try {
    if (file_exists(__DIR__ . '/../config/database.php')) {
        $config = require __DIR__ . '/../config/database.php';
        $diagnostics['config_readable'] = true;
        $diagnostics['config'] = [
            'host' => $config['host'] ?? 'not_set',
            'port' => $config['port'] ?? 'not_set',
            'database' => $config['database'] ?? 'not_set',
            'username' => isset($config['username']) ? '***set***' : 'not_set',
            'password' => isset($config['password']) ? '***set***' : 'not_set'
        ];

        // Try database connection
        if (extension_loaded('pdo') && extension_loaded('pdo_mysql')) {
            try {
                $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset={$config['charset']}";
                $pdo = new PDO($dsn, $config['username'], $config['password'], [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
                ]);
                $diagnostics['database']['connection'] = 'success';
                $diagnostics['database']['server_version'] = $pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
            } catch (PDOException $e) {
                $diagnostics['database']['connection'] = 'failed';
                $diagnostics['database']['error'] = $e->getMessage();
                $diagnostics['database']['error_code'] = $e->getCode();
            }
        }
    }
} catch (Exception $e) {
    $diagnostics['config_error'] = $e->getMessage();
}

// Try to load other required files
$diagnostics['file_loading'] = [];
$files_to_test = [
    'Database' => __DIR__ . '/../database/Database.php',
    'Logger' => __DIR__ . '/../utils/Logger.php',
    'cors' => __DIR__ . '/../utils/cors.php',
    'SecurityHeaders' => __DIR__ . '/../utils/SecurityHeaders.php'
];

foreach ($files_to_test as $name => $path) {
    try {
        if (file_exists($path)) {
            require_once $path;
            $diagnostics['file_loading'][$name] = 'loaded';
        } else {
            $diagnostics['file_loading'][$name] = 'file_not_found';
        }
    } catch (Exception $e) {
        $diagnostics['file_loading'][$name] = 'error: ' . $e->getMessage();
    }
}

// Check if api_logs table exists
if ($diagnostics['database']['connection'] === 'success') {
    try {
        $stmt = $pdo->query("SHOW TABLES LIKE 'api_logs'");
        $table_exists = $stmt->rowCount() > 0;
        $diagnostics['database']['api_logs_table_exists'] = $table_exists;

        if ($table_exists) {
            // Get table structure
            $stmt = $pdo->query("DESCRIBE api_logs");
            $diagnostics['database']['api_logs_structure'] = $stmt->fetchAll();
        }

        // List all tables
        $stmt = $pdo->query("SHOW TABLES");
        $diagnostics['database']['all_tables'] = $stmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (PDOException $e) {
        $diagnostics['database']['table_check_error'] = $e->getMessage();
    }
}

echo json_encode($diagnostics, JSON_PRETTY_PRINT);
