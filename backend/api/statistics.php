<?php
// Game statistics, read from game_summaries (per-game played-stats pushed up
// from playgrounds via telemetry). Serves both audiences off one endpoint:
//   - admin (session OR admin token): fleet-wide, optional ?client_id filter
//   - client (token):                 auto-scoped to their own client_id
//
// Actions (all GET):
//   overview  → totals (games/teams/players) + games-per-day + top scenarios
//               (+ top clients for admin)
//   list      → paginated per-game rows (the table)
//   filters   → distinct game_types / scenarios (+ clients for admin) for the
//               filter dropdowns, within the caller's scope
//   timeseries→ per-day × per-game-type rows (games count + teams sum) for the
//               activity chart; defaults to the last 30 days when no from/to
//
// Filters (query params): from, to (dates), game_type, scenario_uniqid,
// and client_id (admin only).

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

// Token (studio web UI / admin) OR PHP session (legacy admin). Clients are
// scoped to their own client_id; admins see everything.
function requireStatsAuth($db): array {
    $token = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? '';
    if (!empty($token)) {
        $tokenData = TokenManager::validateToken($db, $token);
        if ($tokenData) {
            $type = ($tokenData['user_type'] ?? '') === 'admin' ? 'admin' : 'client';
            return ['id' => (int)$tokenData['user_id'], 'type' => $type];
        }
    }
    if (isset($_SESSION['user_id'])) {
        return ['id' => (int)$_SESSION['user_id'], 'type' => 'admin'];
    }
    jsonResponse(['error' => 'Unauthorized'], 401);
}

// Build WHERE conditions (alias gs) from the caller's scope + query filters.
// $scopeOnly limits to the client/admin scope (used by the `filters` action so
// the option lists aren't narrowed by the very filters they populate).
function summaryConditions(array $auth, bool $scopeOnly = false): array {
    $conds = [];
    $args = [];

    if ($auth['type'] === 'client') {
        $conds[] = 'gs.client_id = ?';
        $args[] = $auth['id'];
    } elseif (!empty($_GET['client_id'])) {
        $conds[] = 'gs.client_id = ?';
        $args[] = (int)$_GET['client_id'];
    }

    if ($scopeOnly) {
        return [$conds, $args];
    }

    if (!empty($_GET['game_type'])) {
        $conds[] = 'gs.game_type = ?';
        $args[] = (string)$_GET['game_type'];
    }
    if (!empty($_GET['scenario_uniqid'])) {
        $conds[] = 'gs.scenario_uniqid = ?';
        $args[] = (string)$_GET['scenario_uniqid'];
    }
    if (!empty($_GET['from']) && ($ts = strtotime((string)$_GET['from'])) !== false) {
        $conds[] = 'gs.played_at >= ?';
        $args[] = date('Y-m-d 00:00:00', $ts);
    }
    if (!empty($_GET['to']) && ($ts = strtotime((string)$_GET['to'])) !== false) {
        $conds[] = 'gs.played_at <= ?';
        $args[] = date('Y-m-d 23:59:59', $ts);
    }

    return [$conds, $args];
}

function whereOf(array $conds): string {
    return empty($conds) ? '' : (' WHERE ' . implode(' AND ', $conds));
}

try {
    $db = Database::getInstance();
    $auth = requireStatsAuth($db);
    $isAdmin = $auth['type'] === 'admin';
    $action = $_GET['action'] ?? 'overview';

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        jsonResponse(['error' => 'Method not allowed'], 405);
    }

    switch ($action) {
        case 'overview': {
            [$conds, $args] = summaryConditions($auth);

            $totals = $db->fetch(
                'SELECT COUNT(*) AS games,
                        COALESCE(SUM(teams_played), 0) AS teams,
                        COALESCE(SUM(players_played), 0) AS players
                 FROM game_summaries gs' . whereOf($conds),
                $args
            );

            $perDayConds = array_merge($conds, ['gs.played_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)']);
            $gamesPerDay = $db->fetchAll(
                'SELECT DATE(gs.played_at) AS date, COUNT(*) AS count
                 FROM game_summaries gs' . whereOf($perDayConds) .
                ' GROUP BY DATE(gs.played_at)
                 ORDER BY date DESC',
                $args
            );

            $topScenarios = $db->fetchAll(
                'SELECT gs.scenario_uniqid,
                        COALESCE(s.title, gs.scenario_uniqid) AS title,
                        COUNT(*) AS launches,
                        COALESCE(SUM(gs.players_played), 0) AS players
                 FROM game_summaries gs
                 LEFT JOIN scenarios s ON s.uniqid = gs.scenario_uniqid' . whereOf($conds) .
                ' GROUP BY gs.scenario_uniqid, title
                 ORDER BY launches DESC
                 LIMIT 10',
                $args
            );

            $response = [
                'overview' => [
                    'total_games' => (int)$totals['games'],
                    'total_teams' => (int)$totals['teams'],
                    'total_players' => (int)$totals['players'],
                ],
                'games_per_day' => $gamesPerDay,
                'top_scenarios' => $topScenarios,
                'is_admin' => $isAdmin,
            ];

            if ($isAdmin) {
                $response['top_clients'] = $db->fetchAll(
                    'SELECT gs.client_id, c.name, c.email, COUNT(*) AS launches
                     FROM game_summaries gs
                     LEFT JOIN clients c ON c.id = gs.client_id' . whereOf($conds) .
                    ' GROUP BY gs.client_id, c.name, c.email
                     ORDER BY launches DESC
                     LIMIT 10',
                    $args
                );
            }

            jsonResponse($response);
            break;
        }

        case 'list': {
            [$conds, $args] = summaryConditions($auth);
            $limit = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 100;
            $offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;

            $rows = $db->fetchAll(
                'SELECT gs.summary_uuid, gs.name, gs.game_type, gs.scenario_uniqid,
                        gs.played_at, gs.teams_launched, gs.teams_played, gs.players_played,
                        gs.created_at, gs.client_id,
                        c.name AS client_name, c.email AS client_email,
                        COALESCE(s.title, gs.scenario_uniqid) AS scenario_title
                 FROM game_summaries gs
                 LEFT JOIN clients c ON c.id = gs.client_id
                 LEFT JOIN scenarios s ON s.uniqid = gs.scenario_uniqid' . whereOf($conds) .
                ' ORDER BY gs.played_at DESC, gs.id DESC
                 LIMIT ? OFFSET ?',
                array_merge($args, [$limit, $offset])
            );

            $total = $db->fetch(
                'SELECT COUNT(*) AS count FROM game_summaries gs' . whereOf($conds),
                $args
            );

            jsonResponse([
                'games' => $rows,
                'total' => (int)$total['count'],
                'limit' => $limit,
                'offset' => $offset,
                'is_admin' => $isAdmin,
            ]);
            break;
        }

        case 'timeseries': {
            [$conds, $args] = summaryConditions($auth);
            $conds[] = 'gs.played_at IS NOT NULL';
            if (empty($_GET['from']) && empty($_GET['to'])) {
                $conds[] = 'gs.played_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
            }

            $rows = $db->fetchAll(
                'SELECT DATE(gs.played_at) AS date, gs.game_type,
                        COUNT(*) AS games,
                        COALESCE(SUM(gs.teams_played), 0) AS teams
                 FROM game_summaries gs' . whereOf($conds) .
                ' GROUP BY DATE(gs.played_at), gs.game_type
                 ORDER BY date',
                $args
            );

            jsonResponse([
                'rows' => array_map(fn($r) => [
                    'date' => $r['date'],
                    'game_type' => $r['game_type'],
                    'games' => (int)$r['games'],
                    'teams' => (int)$r['teams'],
                ], $rows),
                'is_admin' => $isAdmin,
            ]);
            break;
        }

        case 'filters': {
            [$conds, $args] = summaryConditions($auth, true);
            $scopeWhere = whereOf($conds);

            $gameTypes = $db->fetchAll(
                'SELECT DISTINCT gs.game_type FROM game_summaries gs' . $scopeWhere .
                ' ORDER BY gs.game_type',
                $args
            );

            $scenarioConds = array_merge($conds, ['gs.scenario_uniqid IS NOT NULL']);
            $scenarios = $db->fetchAll(
                'SELECT DISTINCT gs.scenario_uniqid,
                        COALESCE(s.title, gs.scenario_uniqid) AS title
                 FROM game_summaries gs
                 LEFT JOIN scenarios s ON s.uniqid = gs.scenario_uniqid' . whereOf($scenarioConds) .
                ' ORDER BY title',
                $args
            );

            $response = [
                'game_types' => array_map(fn($r) => $r['game_type'], $gameTypes),
                'scenarios' => $scenarios,
            ];

            if ($isAdmin) {
                $response['clients'] = $db->fetchAll(
                    'SELECT DISTINCT gs.client_id, c.name, c.email
                     FROM game_summaries gs
                     LEFT JOIN clients c ON c.id = gs.client_id' . $scopeWhere .
                    ' ORDER BY c.name',
                    $args
                );
            }

            jsonResponse($response);
            break;
        }

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    Logger::log('statistics', $_SERVER['REQUEST_METHOD'] ?? 'GET', $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
