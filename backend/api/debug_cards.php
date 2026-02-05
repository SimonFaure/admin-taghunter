<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/TokenManager.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_PRETTY_PRINT);
    exit;
}

function requireClientAuth($db) {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';

    if (strpos($token, 'Bearer ') === 0) {
        $token = substr($token, 7);
    }

    if (empty($token)) {
        jsonResponse(['error' => 'Unauthorized - Token required'], 401);
    }

    $tokenData = TokenManager::validateToken($db, $token);

    if (!$tokenData) {
        jsonResponse(['error' => 'Unauthorized - Invalid or expired token'], 401);
    }

    if ($tokenData['user_type'] !== 'client') {
        jsonResponse(['error' => 'Unauthorized - Client login required'], 403);
    }

    return $tokenData['user_id'];
}

function getCardsDirectory($clientId) {
    $baseDir = __DIR__ . '/../../cards';
    $clientDir = $baseDir . '/' . $clientId;

    if (!is_dir($baseDir)) {
        mkdir($baseDir, 0755, true);
    }

    if (!is_dir($clientDir)) {
        mkdir($clientDir, 0755, true);
    }

    return $clientDir;
}

try {
    $db = Database::getInstance();
    $clientId = requireClientAuth($db);

    $cardsDir = getCardsDirectory($clientId);
    $cardsFile = $cardsDir . '/cards.csv';

    $debug = [
        'client_id' => $clientId,
        'cards_directory' => $cardsDir,
        'cards_file_path' => $cardsFile,
        'directory_exists' => is_dir($cardsDir),
        'file_exists' => file_exists($cardsFile),
        'directory_contents' => [],
        'metadata_in_db' => null,
        'file_size' => null,
        'file_permissions' => null,
    ];

    if (is_dir($cardsDir)) {
        $files = scandir($cardsDir);
        $debug['directory_contents'] = array_filter($files, function($file) {
            return $file !== '.' && $file !== '..';
        });
    }

    if (file_exists($cardsFile)) {
        $debug['file_size'] = filesize($cardsFile);
        $debug['file_permissions'] = substr(sprintf('%o', fileperms($cardsFile)), -4);
        $debug['file_readable'] = is_readable($cardsFile);
    }

    $metadata = $db->fetch(
        'SELECT * FROM client_cards_metadata WHERE client_id = ?',
        [$clientId]
    );

    $debug['metadata_in_db'] = $metadata;

    $tables = $db->fetchAll("SHOW TABLES LIKE 'client_cards_metadata'");
    $debug['table_exists'] = !empty($tables);

    jsonResponse($debug);

} catch (Exception $e) {
    jsonResponse(['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()], 500);
}
