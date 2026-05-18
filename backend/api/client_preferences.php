<?php
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/TokenManager.php';

setCorsHeaders();
session_start();

function cpAuthClient() {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (empty($token)) return null;
    $db = Database::getInstance();
    $tokenData = TokenManager::validateToken($db, $token);
    if (!$tokenData || $tokenData['user_type'] !== 'client') return null;
    return $tokenData['user_id'];
}

$method = $_SERVER['REQUEST_METHOD'];

try {
    $clientId = cpAuthClient();
    if (!$clientId) {
        http_response_code(401);
        echo json_encode(['error' => 'Client auth required']);
        exit;
    }

    $pdo = Database::getInstance()->getConnection();

    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT preferences FROM clients WHERE id = ?');
        $stmt->execute([$clientId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $prefs = ($row && $row['preferences']) ? json_decode($row['preferences'], true) : new stdClass();
        echo json_encode(['preferences' => $prefs]);
        exit;
    }

    if ($method === 'PUT' || $method === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true) ?? [];
        $prefs = $body['preferences'] ?? null;
        if (!is_array($prefs)) {
            http_response_code(400);
            echo json_encode(['error' => 'preferences must be an object']);
            exit;
        }
        $stmt = $pdo->prepare('UPDATE clients SET preferences = ? WHERE id = ?');
        $stmt->execute([json_encode($prefs), $clientId]);
        echo json_encode(['success' => true, 'preferences' => $prefs]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    error_log('client_preferences.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
