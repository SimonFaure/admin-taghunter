<?php
require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

header('Content-Type: application/json');

session_start();

function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }
}

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

// Check authentication
requireAuth();

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

try {
    $db = Database::getInstance();
    $conn = $db->getConnection();

    // Define migration files in order
    $migrations = [
        'migration.sql',
        'add_roles_migration.sql',
        'add_uniqid_migration.sql',
        'launched_games_migration.sql',
        'client_scenarios_migration.sql',
        'api_logs.sql',
        'add_game_fields_migration.sql',
        'secure_auth_migration.sql',
        'add_user_type_to_auth_tokens.sql',
        'add_scenario_type_migration.sql',
        'add_app_versions_migration.sql',
        'add_game_meta_migration.sql'
    ];

    $results = [];
    $errors = [];

    foreach ($migrations as $migrationFile) {
        $filePath = __DIR__ . '/../database/' . $migrationFile;

        if (!file_exists($filePath)) {
            $errors[] = "Migration file not found: $migrationFile";
            continue;
        }

        $sql = file_get_contents($filePath);

        if ($sql === false) {
            $errors[] = "Failed to read migration file: $migrationFile";
            continue;
        }

        // Remove single-line comments (-- comments)
        $sql = preg_replace('/--[^\n]*\n/', "\n", $sql);

        // Remove multi-line comments (/* */ comments)
        $sql = preg_replace('/\/\*.*?\*\//s', '', $sql);

        // Split SQL file into individual statements
        $statements = array_filter(
            array_map('trim', explode(';', $sql)),
            function($stmt) {
                return !empty($stmt) && strlen(trim($stmt)) > 0;
            }
        );

        foreach ($statements as $statement) {
            $statement = trim($statement);
            if (empty($statement)) {
                continue;
            }

            try {
                $stmt = $conn->query($statement);
                if ($stmt) {
                    $stmt->closeCursor();
                }
                $results[] = "Executed: " . substr($statement, 0, 60) . "...";
            } catch (PDOException $e) {
                // Check if error is about table/column already existing
                if (strpos($e->getMessage(), 'already exists') !== false ||
                    strpos($e->getMessage(), 'Duplicate') !== false ||
                    strpos($e->getMessage(), 'Duplicate key') !== false) {
                    $results[] = "Skipped (already exists): " . substr($statement, 0, 40) . "...";
                } else {
                    $errors[] = "Error: " . $e->getMessage() . " | SQL: " . substr($statement, 0, 100);
                }
            }
        }
    }

    Logger::log(
        'migrations',
        'POST',
        'run',
        $_SESSION['user_id'],
        [],
        ['results' => $results, 'errors' => $errors],
        empty($errors) ? 200 : 500
    );

    if (!empty($errors)) {
        jsonResponse([
            'success' => false,
            'error' => 'Some migrations failed',
            'details' => $errors,
            'results' => $results
        ], 500);
    }

    jsonResponse([
        'success' => true,
        'message' => 'All migrations completed successfully',
        'details' => $results
    ]);

} catch (Exception $e) {
    Logger::log(
        'migrations',
        'POST',
        'run',
        $_SESSION['user_id'] ?? null,
        [],
        ['error' => $e->getMessage()],
        500
    );

    jsonResponse([
        'success' => false,
        'error' => 'Failed to run migrations: ' . $e->getMessage()
    ], 500);
}
