<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/cors.php';

header('Content-Type: application/json');
setCorsHeaders();

try {
    $db = Database::getInstance();

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if (!$data) {
        echo json_encode(['error' => 'No JSON body provided']);
        exit;
    }

    $patternData = $data['pattern_data'] ?? null;

    if (!$patternData) {
        echo json_encode(['error' => 'No pattern_data in request']);
        exit;
    }

    $jsonData = is_string($patternData) ? $patternData : json_encode($patternData);

    $insertId = $db->execute(
        'INSERT INTO patterns (name, game_type, version, pattern_data, is_default, owner_type, owner_id, created_by_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['DEBUG_TEST', 'mystery', '1', $jsonData, 0, 'system', null, 'debug@test.com']
    );

    $fetched = $db->fetch('SELECT id, pattern_data FROM patterns WHERE id = ?', [$insertId]);

    $db->execute('DELETE FROM patterns WHERE id = ?', [$insertId]);

    echo json_encode([
        'inserted_json' => $jsonData,
        'fetched_pattern_data' => $fetched['pattern_data'],
        'match' => ($jsonData === $fetched['pattern_data']),
        'inserted_decoded' => json_decode($jsonData, true),
        'fetched_decoded' => json_decode($fetched['pattern_data'], true),
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
