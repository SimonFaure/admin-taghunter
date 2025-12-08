<?php

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';

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
    requireAuth();
    $db = Database::getInstance();
    $action = $_GET['action'] ?? 'overview';

    switch ($action) {
        case 'overview':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            // Total games launched
            $totalGames = $db->fetch('SELECT COUNT(*) as count FROM launched_games');

            // Total unique clients who launched games
            $uniqueClients = $db->fetch('SELECT COUNT(DISTINCT client_id) as count FROM launched_games');

            // Average duration
            $avgDuration = $db->fetch('SELECT AVG(duration_minutes) as avg FROM launched_games WHERE duration_minutes > 0');

            // Completion rate
            $completionStats = $db->fetch('
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
                FROM launched_games
            ');
            $completionRate = $completionStats['total'] > 0
                ? round(($completionStats['completed'] / $completionStats['total']) * 100, 1)
                : 0;

            // Games launched per day (last 30 days)
            $gamesPerDay = $db->fetchAll('
                SELECT
                    DATE(launched_at) as date,
                    COUNT(*) as count
                FROM launched_games
                WHERE launched_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY DATE(launched_at)
                ORDER BY date DESC
            ');

            // Top scenarios
            $topScenarios = $db->fetchAll('
                SELECT
                    s.id,
                    s.title,
                    COUNT(lg.id) as launches
                FROM scenarios s
                LEFT JOIN launched_games lg ON s.id = lg.scenario_id
                GROUP BY s.id, s.title
                ORDER BY launches DESC
                LIMIT 10
            ');

            // Top clients
            $topClients = $db->fetchAll('
                SELECT
                    c.id,
                    c.name,
                    c.email,
                    COUNT(lg.id) as launches
                FROM clients c
                LEFT JOIN launched_games lg ON c.id = lg.client_id
                GROUP BY c.id, c.name, c.email
                ORDER BY launches DESC
                LIMIT 10
            ');

            jsonResponse([
                'overview' => [
                    'total_games' => (int)$totalGames['count'],
                    'unique_clients' => (int)$uniqueClients['count'],
                    'avg_duration' => round($avgDuration['avg'] ?? 0, 1),
                    'completion_rate' => $completionRate
                ],
                'games_per_day' => $gamesPerDay,
                'top_scenarios' => $topScenarios,
                'top_clients' => $topClients
            ]);
            break;

        case 'recent':
            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
            $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

            $recentGames = $db->fetchAll('
                SELECT
                    lg.*,
                    c.name as client_name,
                    c.email as client_email,
                    s.title as scenario_title
                FROM launched_games lg
                LEFT JOIN clients c ON lg.client_id = c.id
                LEFT JOIN scenarios s ON lg.scenario_id = s.id
                ORDER BY lg.launched_at DESC
                LIMIT ? OFFSET ?
            ', [$limit, $offset]);

            $total = $db->fetch('SELECT COUNT(*) as count FROM launched_games');

            jsonResponse([
                'games' => $recentGames,
                'total' => (int)$total['count'],
                'limit' => $limit,
                'offset' => $offset
            ]);
            break;

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
