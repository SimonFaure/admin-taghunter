<?php

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $sql = file_get_contents(__DIR__ . '/database/admin_notifications_migration.sql');

    $statements = array_filter(array_map('trim', explode(';', $sql)));
    foreach ($statements as $statement) {
        if (!empty($statement)) {
            $db->query($statement);
        }
    }

    echo json_encode(['success' => true, 'message' => 'admin_notifications table created successfully']);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
