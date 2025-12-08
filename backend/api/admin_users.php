<?php
require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';

SecurityHeaders::set();

session_start();

if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$database = new Database();
$db = $database->getConnection();
$logger = Logger::getInstance();

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'list':
        handleListAdmins($db, $logger);
        break;
    case 'create':
        handleCreateAdmin($db, $logger);
        break;
    case 'update':
        handleUpdateAdmin($db, $logger);
        break;
    case 'delete':
        handleDeleteAdmin($db, $logger);
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
        break;
}

function handleListAdmins($db, $logger) {
    try {
        $stmt = $db->prepare("
            SELECT id, email, name, created_at, updated_at
            FROM admin_users
            ORDER BY created_at DESC
        ");
        $stmt->execute();
        $admins = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $logger->log('admin_users_list', 'Admin users listed', [
            'admin_id' => $_SESSION['user_id'],
            'count' => count($admins)
        ]);

        echo json_encode(['admins' => $admins]);
    } catch (PDOException $e) {
        $logger->log('admin_users_list_error', 'Failed to list admin users', [
            'error' => $e->getMessage()
        ]);
        http_response_code(500);
        echo json_encode(['error' => 'Failed to fetch admin users']);
    }
}

function handleCreateAdmin($db, $logger) {
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['email']) || !isset($data['password'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Email and password are required']);
        return;
    }

    if (!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid email format']);
        return;
    }

    if (strlen($data['password']) < 8) {
        http_response_code(400);
        echo json_encode(['error' => 'Password must be at least 8 characters']);
        return;
    }

    try {
        $checkStmt = $db->prepare("SELECT id FROM admin_users WHERE email = ?");
        $checkStmt->execute([$data['email']]);
        if ($checkStmt->fetch()) {
            http_response_code(400);
            echo json_encode(['error' => 'Email already exists']);
            return;
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

        $logger->log('admin_user_created', 'Admin user created', [
            'admin_id' => $_SESSION['user_id'],
            'new_admin_id' => $adminId,
            'email' => $data['email']
        ]);

        echo json_encode(['admin' => $admin]);
    } catch (PDOException $e) {
        $logger->log('admin_user_create_error', 'Failed to create admin user', [
            'error' => $e->getMessage()
        ]);
        http_response_code(500);
        echo json_encode(['error' => 'Failed to create admin user']);
    }
}

function handleUpdateAdmin($db, $logger) {
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Admin ID is required']);
        return;
    }

    if (isset($data['email']) && !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid email format']);
        return;
    }

    try {
        if (isset($data['email'])) {
            $checkStmt = $db->prepare("SELECT id FROM admin_users WHERE email = ? AND id != ?");
            $checkStmt->execute([$data['email'], $data['id']]);
            if ($checkStmt->fetch()) {
                http_response_code(400);
                echo json_encode(['error' => 'Email already exists']);
                return;
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
                http_response_code(400);
                echo json_encode(['error' => 'Password must be at least 8 characters']);
                return;
            }
            $fields[] = "password = ?";
            $params[] = password_hash($data['password'], PASSWORD_DEFAULT);
        }

        if (empty($fields)) {
            http_response_code(400);
            echo json_encode(['error' => 'No fields to update']);
            return;
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

        $logger->log('admin_user_updated', 'Admin user updated', [
            'admin_id' => $_SESSION['user_id'],
            'updated_admin_id' => $data['id']
        ]);

        echo json_encode(['admin' => $admin]);
    } catch (PDOException $e) {
        $logger->log('admin_user_update_error', 'Failed to update admin user', [
            'error' => $e->getMessage()
        ]);
        http_response_code(500);
        echo json_encode(['error' => 'Failed to update admin user']);
    }
}

function handleDeleteAdmin($db, $logger) {
    $data = json_decode(file_get_contents('php://input'), true);

    if (!isset($data['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Admin ID is required']);
        return;
    }

    if ($data['id'] == $_SESSION['user_id']) {
        http_response_code(400);
        echo json_encode(['error' => 'Cannot delete your own account']);
        return;
    }

    try {
        $stmt = $db->prepare("DELETE FROM admin_users WHERE id = ?");
        $stmt->execute([$data['id']]);

        $logger->log('admin_user_deleted', 'Admin user deleted', [
            'admin_id' => $_SESSION['user_id'],
            'deleted_admin_id' => $data['id']
        ]);

        echo json_encode(['success' => true]);
    } catch (PDOException $e) {
        $logger->log('admin_user_delete_error', 'Failed to delete admin user', [
            'error' => $e->getMessage()
        ]);
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete admin user']);
    }
}
