<?php
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/database/Database.php';

header('Content-Type: application/json');

try {
    $db = Database::getInstance();

    $migrationFile = __DIR__ . '/database/layouts_migration.sql';

    if (!file_exists($migrationFile)) {
        throw new Exception('Migration file not found');
    }

    $sql = file_get_contents($migrationFile);

    $pdo = $db->getConnection();
    $pdo->exec($sql);

    echo json_encode([
        'success' => true,
        'message' => 'Layouts migration applied successfully'
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
