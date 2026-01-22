<?php
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

SecurityHeaders::set();
handleCors();

header('Content-Type: application/json');

function jsonResponse($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

try {
    $db = Database::getInstance();
    $method = $_SERVER['REQUEST_METHOD'];
    $action = $_GET['action'] ?? '';

    switch ($action) {
    case 'test':
        // Simple test endpoint to verify API is working
        jsonResponse([
            'status' => 'ok',
            'timestamp' => time(),
            'database' => 'connected'
        ]);
        break;

    case 'get_user_scenarios':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_user_scenarios', null, [], ['error' => 'Method not allowed'], 405);
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_user_scenarios', null, [], ['error' => 'Missing email'], 400);
            jsonResponse(['error' => 'email is required'], 400);
        }

        $client = $db->fetch('SELECT * FROM clients WHERE email = ?', [$email]);

        if (!$client) {
            Logger::log('playground', $method, 'get_user_scenarios', null, ['email' => $email], ['error' => 'Client not found'], 404);
            jsonResponse(['error' => 'Client not found'], 404);
        }

        $scenarios = [];

        if ($client['licence_type'] === 'premium') {
            $scenarios = $db->fetchAll(
                'SELECT s.* FROM scenarios s
                 WHERE s.client_id = ? OR s.scenario_type = "product"
                 ORDER BY s.created_at DESC',
                [$client['id']]
            );
        } else {
            $scenarios = $db->fetchAll(
                'SELECT s.* FROM scenarios s
                 LEFT JOIN client_scenarios cs ON s.id = cs.scenario_id AND cs.client_id = ?
                 WHERE s.client_id = ? OR cs.id IS NOT NULL
                 ORDER BY s.created_at DESC',
                [$client['id'], $client['id']]
            );
        }

        foreach ($scenarios as &$scenario) {
            $fileCount = 0;
            $totalSize = 0;

            if (!empty($scenario['uniqid'])) {
                $mediaDir = __DIR__ . '/../../media/' . $scenario['uniqid'];

                if (is_dir($mediaDir)) {
                    $files = scandir($mediaDir);

                    foreach ($files as $file) {
                        if ($file !== '.' && $file !== '..') {
                            $filePath = $mediaDir . '/' . $file;

                            if (is_file($filePath)) {
                                $fileCount++;
                                $totalSize += filesize($filePath);
                            }
                        }
                    }
                }
            }

            $scenario['file_count'] = $fileCount;
            $scenario['total_size'] = $totalSize;
        }

        $responseData = [
            'client' => [
                'id' => $client['id'],
                'email' => $client['email'],
                'licence_type' => $client['licence_type'],
                'company_name' => $client['company_name']
            ],
            'scenarios' => $scenarios
        ];

        Logger::log('playground', $method, 'get_user_scenarios', null, ['email' => $email], ['count' => count($scenarios)], 200);
        jsonResponse($responseData);
        break;

    case 'get_available_scenarios':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_available_scenarios', null, [], ['error' => 'Method not allowed'], 405);
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $email = $_GET['email'] ?? null;

        if (!$email) {
            Logger::log('playground', $method, 'get_available_scenarios', null, [], ['error' => 'Missing email'], 400);
            jsonResponse(['error' => 'email is required'], 400);
        }

        $client = $db->fetch('SELECT * FROM clients WHERE email = ?', [$email]);

        if (!$client) {
            Logger::log('playground', $method, 'get_available_scenarios', null, ['email' => $email], ['error' => 'Client not found'], 404);
            jsonResponse(['error' => 'Client not found'], 404);
        }

        if ($client['licence_type'] === 'premium') {
            Logger::log('playground', $method, 'get_available_scenarios', null, ['email' => $email], ['scenarios' => []], 200);
            jsonResponse(['scenarios' => []]);
        }

        $availableScenarios = $db->fetchAll(
            'SELECT s.* FROM scenarios s
             WHERE s.scenario_type = "product"
             AND s.id NOT IN (
                 SELECT scenario_id FROM client_scenarios WHERE client_id = ?
             )
             ORDER BY s.created_at DESC',
            [$client['id']]
        );

        Logger::log('playground', $method, 'get_available_scenarios', null, ['email' => $email], ['count' => count($availableScenarios)], 200);
        jsonResponse(['scenarios' => $availableScenarios]);
        break;

    case 'get_media':
        if ($method !== 'GET') {
            Logger::log('playground', $method, 'get_media', null, [], ['error' => 'Method not allowed'], 405);
            jsonResponse(['error' => 'Method not allowed'], 405);
        }

        $uniqid = $_GET['uniqid'] ?? null;
        $filename = $_GET['filename'] ?? null;

        if (!$uniqid || !$filename) {
            Logger::log('playground', $method, 'get_media', null, [], ['error' => 'Missing parameters'], 400);
            jsonResponse(['error' => 'uniqid and filename are required'], 400);
        }

        $scenario = $db->fetch('SELECT id FROM scenarios WHERE uniqid = ?', [$uniqid]);

        if (!$scenario) {
            Logger::log('playground', $method, 'get_media', null, ['uniqid' => $uniqid], ['error' => 'Scenario not found'], 404);
            jsonResponse(['error' => 'Scenario not found'], 404);
        }

        $mediaPath = __DIR__ . '/../../media/' . $uniqid . '/' . $filename;

        if (!file_exists($mediaPath)) {
            Logger::log('playground', $method, 'get_media', null, ['uniqid' => $uniqid, 'filename' => $filename], ['error' => 'File not found'], 404);
            jsonResponse(['error' => 'Media file not found'], 404);
        }

        $mimeType = mime_content_type($mediaPath);
        header('Content-Type: ' . $mimeType);
        header('Content-Length: ' . filesize($mediaPath));
        header('Content-Disposition: inline; filename="' . basename($filename) . '"');

        Logger::log('playground', $method, 'get_media', null, ['uniqid' => $uniqid, 'filename' => $filename], ['success' => true], 200);

        readfile($mediaPath);
        exit;

    default:
        Logger::log('playground', $method, $action ?: 'none', null, [], ['error' => 'Invalid action'], 400);
        jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    $errorDetails = [
        'error' => $e->getMessage(),
        'file' => $e->getFile(),
        'line' => $e->getLine(),
        'trace' => $e->getTraceAsString()
    ];

    Logger::log('playground', $_SERVER['REQUEST_METHOD'], $_GET['action'] ?? 'unknown', null, $_GET, $errorDetails, 500);

    jsonResponse([
        'error' => 'Internal server error',
        'message' => $e->getMessage(),
        'details' => $errorDetails
    ], 500);
}
