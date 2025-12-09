<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function requireAuth() {
    if (!isset($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
    return $_SESSION['user_id'];
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    switch ($action) {
        case 'list':
            handleListAdmins($db);
            break;
        case 'create':
            handleCreateAdmin($db);
            break;
        case 'update':
            handleUpdateAdmin($db);
            break;
        case 'delete':
            handleDeleteAdmin($db);
            break;
        default:
            jsonResponse(['error' => 'Invalid action'], 400);
            break;
    }
} catch (Exception $e) {
    Logger::log('admin_users', $_SERVER['REQUEST_METHOD'], $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Internal server error'], 500);
}

function handleListAdmins($db) {
    $userId = requireAuth();

    $stmt = $db->prepare("
        SELECT id, email, name, created_at, updated_at
        FROM admin_users
        ORDER BY created_at DESC
    ");
    $stmt->execute();
    $admins = $stmt->fetchAll(PDO::FETCH_ASSOC);

    Logger::log('admin_users', 'GET', 'list', $userId, [], ['count' => count($admins)], 200);
    jsonResponse(['admins' => $admins]);
}

function handleCreateAdmin($db) {
    $userId = requireAuth();
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['email']) || !isset($data['password'])) {
        Logger::log('admin_users', 'POST', 'create', $userId, $data, ['error' => 'Missing fields'], 400);
        jsonResponse(['error' => 'Email and password are required'], 400);
    }

    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        Logger::log('admin_users', 'POST', 'create', $userId, $data, ['error' => 'Invalid email'], 400);
        jsonResponse(['error' => 'Invalid email format'], 400);
    }

    if (strlen($data['password']) < 8) {
        Logger::log('admin_users', 'POST', 'create', $userId, $data, ['error' => 'Password too short'], 400);
        jsonResponse(['error' => 'Password must be at least 8 characters'], 400);
    }

    $checkStmt = $db->prepare("SELECT id FROM admin_users WHERE email = ?");
    $checkStmt->execute([$data['email']]);
    if ($checkStmt->fetch()) {
        Logger::log('admin_users', 'POST', 'create', $userId, $data, ['error' => 'Email exists'], 400);
        jsonResponse(['error' => 'Email already exists'], 400);
    }

    $hashedPassword = password_hash($data['password'], PASSWORD_DEFAULT);

    $stmt = $db->prepare("
        INSERT INTO admin_users (email, password, name)
        VALUES (?, ?, ?)
    ");
    $stmt->execute([
        $data['email'],
        $hashedPassword,
        $data['name'] ?? null
    ]);

    $adminId = $db->lastInsertId();

    $getStmt = $db->prepare("
        SELECT id, email, name, created_at, updated_at
        FROM admin_users
        WHERE id = ?
    ");
    $getStmt->execute([$adminId]);
    $admin = $getStmt->fetch(PDO::FETCH_ASSOC);

    Logger::log('admin_users', 'POST', 'create', $userId, $data, ['admin_id' => $adminId], 200);
    jsonResponse(['admin' => $admin]);
}

function handleUpdateAdmin($db) {
    $userId = requireAuth();
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['id'])) {
        Logger::log('admin_users', 'POST', 'update', $userId, $data, ['error' => 'Missing ID'], 400);
        jsonResponse(['error' => 'Admin ID is required'], 400);
    }

    if (isset($data['email']) && !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        Logger::log('admin_users', 'POST', 'update', $userId, $data, ['error' => 'Invalid email'], 400);
        jsonResponse(['error' => 'Invalid email format'], 400);
    }

    if (isset($data['email'])) {
        $checkStmt = $db->prepare("SELECT id FROM admin_users WHERE email = ? AND id != ?");
        $checkStmt->execute([$data['email'], $data['id']]);
        if ($checkStmt->fetch()) {
            Logger::log('admin_users', 'POST', 'update', $userId, $data, ['error' => 'Email exists'], 400);
            jsonResponse(['error' => 'Email already exists'], 400);
        }
    }

    $fields = [];
    $params = [];

    if (isset($data['email'])) {
        $fields[] = "email = ?";
        $params[] = $data['email'];
    }

    if (isset($data['name'])) {
        $fields[] = "name = ?";
        $params[] = $data['name'];
    }

    if (isset($data['password']) && !empty($data['password'])) {
        if (strlen($data['password']) < 8) {
            Logger::log('admin_users', 'POST', 'update', $userId, $data, ['error' => 'Password too short'], 400);
            jsonResponse(['error' => 'Password must be at least 8 characters'], 400);
        }
        $fields[] = "password = ?";
        $params[] = password_hash($data['password'], PASSWORD_DEFAULT);
    }

    if (empty($fields)) {
        Logger::log('admin_users', 'POST', 'update', $userId, $data, ['error' => 'No fields'], 400);
        jsonResponse(['error' => 'No fields to update'], 400);
    }

    $params[] = $data['id'];

    $stmt = $db->prepare("
        UPDATE admin_users
        SET " . implode(', ', $fields) . "
        WHERE id = ?
    ");
    $stmt->execute($params);

    $getStmt = $db->prepare("
        SELECT id, email, name, created_at, updated_at
        FROM admin_users
        WHERE id = ?
    ");
    $getStmt->execute([$data['id']]);
    $admin = $getStmt->fetch(PDO::FETCH_ASSOC);

    Logger::log('admin_users', 'POST', 'update', $userId, $data, ['admin_id' => $data['id']], 200);
    jsonResponse(['admin' => $admin]);
}

function handleDeleteAdmin($db) {
    $userId = requireAuth();
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['id'])) {
        Logger::log('admin_users', 'POST', 'delete', $userId, $data, ['error' => 'Missing ID'], 400);
        jsonResponse(['error' => 'Admin ID is required'], 400);
    }

    if ($data['id'] == $userId) {
        Logger::log('admin_users', 'POST', 'delete', $userId, $data, ['error' => 'Self delete'], 400);
        jsonResponse(['error' => 'Cannot delete your own account'], 400);
    }

    $stmt = $db->prepare("DELETE FROM admin_users WHERE id = ?");
    $stmt->execute([$data['id']]);

    Logger::log('admin_users', 'POST', 'delete', $userId, $data, ['deleted_id' => $data['id']], 200);
    jsonResponse(['success' => true]);
}
