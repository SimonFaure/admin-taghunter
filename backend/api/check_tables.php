<?php
require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');

require_once __DIR__ . '/../database/Database.php';

try {
    $db = Database::getInstance();

    // Check if client_scenarios table exists
    $tables = $db->fetchAll("SHOW TABLES LIKE 'client_scenarios'");

    $response = [
        'client_scenarios_exists' => !empty($tables),
        'tables_found' => $tables
    ];

    // If table exists, get its structure
    if (!empty($tables)) {
        $structure = $db->fetchAll("DESCRIBE client_scenarios");
        $response['table_structure'] = $structure;

        // Get row count
        $count = $db->fetch("SELECT COUNT(*) as count FROM client_scenarios");
        $response['row_count'] = $count['count'];

        // Get sample data if exists
        $samples = $db->fetchAll("SELECT * FROM client_scenarios LIMIT 3");
        $response['sample_data'] = $samples;
    }

    // Also check scenarios table
    $scenariosTable = $db->fetchAll("SHOW TABLES LIKE 'scenarios'");
    $response['scenarios_exists'] = !empty($scenariosTable);

    if (!empty($scenariosTable)) {
        $scenariosCount = $db->fetch("SELECT COUNT(*) as count FROM scenarios");
        $response['scenarios_count'] = $scenariosCount['count'];
    }

    // Check clients table
    $clientsTable = $db->fetchAll("SHOW TABLES LIKE 'clients'");
    $response['clients_exists'] = !empty($clientsTable);

    if (!empty($clientsTable)) {
        $clientsCount = $db->fetch("SELECT COUNT(*) as count FROM clients");
        $response['clients_count'] = $clientsCount['count'];
    }

    // Check admin_users table
    $adminTable = $db->fetchAll("SHOW TABLES LIKE 'admin_users'");
    $response['admin_users_exists'] = !empty($adminTable);

    // Check api_logs table (required by Logger)
    $apiLogsTable = $db->fetchAll("SHOW TABLES LIKE 'api_logs'");
    $response['api_logs_exists'] = !empty($apiLogsTable);

    if (!empty($apiLogsTable)) {
        $apiLogsCount = $db->fetch("SELECT COUNT(*) as count FROM api_logs");
        $response['api_logs_count'] = $apiLogsCount['count'];
    }

    error_log("Table check results: " . json_encode($response));

    http_response_code(200);
    echo json_encode($response, JSON_PRETTY_PRINT);

} catch (Exception $e) {
    error_log("Table check error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'error' => $e->getMessage(),
        'trace' => $e->getTraceAsString()
    ], JSON_PRETTY_PRINT);
}
