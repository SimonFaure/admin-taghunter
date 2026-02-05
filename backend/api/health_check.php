<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');

$health = [
    'status' => 'ok',
    'timestamp' => date('Y-m-d H:i:s'),
    'checks' => []
];

try {
    $config = require __DIR__ . '/../config/database.php';
    $health['checks']['config'] = 'ok';

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        $config['host'],
        $config['port'],
        $config['database'],
        $config['charset']
    );

    $conn = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
    $health['checks']['database_connection'] = 'ok';

    $stmt = $conn->query("SELECT 1");
    $health['checks']['database_query'] = 'ok';

    $stmt = $conn->query("SHOW TABLES LIKE 'auth_tokens'");
    $tableExists = $stmt->fetch();
    $health['checks']['auth_tokens_table'] = $tableExists ? 'ok' : 'missing';

    if ($tableExists) {
        $stmt = $conn->query("SHOW COLUMNS FROM auth_tokens LIKE 'long_lived'");
        $columnExists = $stmt->fetch();
        $health['checks']['long_lived_column'] = $columnExists ? 'ok' : 'missing';

        if (!$columnExists) {
            $health['checks']['fix_available'] = 'Call /backend/api/fix_auth_tokens.php to add the column';
        }
    }

    $stmt = $conn->query("SHOW TABLES LIKE 'admin_users'");
    $adminTableExists = $stmt->fetch();
    $health['checks']['admin_users_table'] = $adminTableExists ? 'ok' : 'missing';

    if ($adminTableExists) {
        $stmt = $conn->query("SELECT COUNT(*) as count FROM admin_users");
        $result = $stmt->fetch();
        $health['checks']['admin_users_count'] = $result['count'];
    }

    $stmt = $conn->query("SHOW TABLES LIKE 'clients'");
    $clientsTableExists = $stmt->fetch();
    $health['checks']['clients_table'] = $clientsTableExists ? 'ok' : 'missing';

    $health['status'] = 'healthy';

} catch (PDOException $e) {
    $health['status'] = 'error';
    $health['error'] = $e->getMessage();
} catch (Exception $e) {
    $health['status'] = 'error';
    $health['error'] = $e->getMessage();
}

http_response_code($health['status'] === 'healthy' || $health['status'] === 'ok' ? 200 : 500);
echo json_encode($health, JSON_PRETTY_PRINT);
