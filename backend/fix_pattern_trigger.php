<?php
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/database/Database.php';

header('Content-Type: application/json');

try {
    $db = Database::getInstance();
    $conn = $db->getConnection();

    $triggers = $db->fetchAll('SHOW TRIGGERS WHERE `Table` = ?', ['patterns']);

    $dropped = [];
    foreach ($triggers as $trigger) {
        $triggerName = $trigger['Trigger'];
        $conn->exec('DROP TRIGGER IF EXISTS `' . $triggerName . '`');
        $dropped[] = $triggerName;
    }

    echo json_encode([
        'success' => true,
        'triggers_found' => $triggers,
        'triggers_dropped' => $dropped,
        'message' => count($dropped) > 0
            ? 'Dropped ' . count($dropped) . ' trigger(s): ' . implode(', ', $dropped)
            : 'No triggers found on patterns table'
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
