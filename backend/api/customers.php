<?php
// Licensee customers ("Clients" in the FR UI) - the licensee's OWN customers,
// not `clients` (= the licensee). Design: add_licensee_customers.sql.
//
// Auth: licensee token (scoped to itself) or admin token/session with
// ?client_id=N (admins can view AND edit/merge a licensee's customers).
//
// GET  list        ?q, include_archived=0|1, sort=name|last_played|games
//                  -> customers + games_count + last_played_at (merged/deleted hidden)
// GET  get         ?id -> customer + stats + merged_from; {redirect_to} when merged
// GET  history     ?id -> the customer's games (newest first)
// GET  candidates  ?id, filter=untagged|other|all, q, limit, offset
//                  -> the licensee's games NOT attached to id (attach picker)
// POST create      {name, type?, contact_name?, email?, phone?, city?, notes?}
// POST update      {id, ...same fields}
// POST archive     {id, archived}
// POST delete      {id}  (409 HAS_GAMES unless the customer has no game)
// POST merge       {source_id, target_id}
// POST assign      {summary_uuids[], customer_id|null}
// POST import      {rows[]}  (<= 1000 per call; existing names skipped)
//
// Every change devices must see bumps licensee_customers_meta.current_version
// (manifest `customers_version` in playground.php).

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
session_start();
session_write_close();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/LicenseeCustomers.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function getRequestData(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

const CUSTOMER_COLS = 'c.id, c.name, c.customer_type, c.contact_name, c.email, c.phone, c.city,
                       c.notes, c.archived, c.created_source, c.created_at, c.updated_at';

// Customer fields from a request body. $partial: only keys present are returned.
function customerFields(array $data, bool $partial): array {
    $out = [];
    $map = [
        'name' => 190, 'contact_name' => 190, 'email' => 190, 'phone' => 50, 'city' => 120, 'notes' => 5000,
    ];
    foreach ($map as $key => $max) {
        if ($partial && !array_key_exists($key, $data)) continue;
        $out[$key] = LicenseeCustomers::str($data[$key] ?? null, $max);
    }
    if (!$partial || array_key_exists('type', $data)) {
        $out['customer_type'] = LicenseeCustomers::normalizeType($data['type'] ?? null);
    }
    return $out;
}

function shapeCustomer(array $r): array {
    return [
        'id' => $r['id'],
        'name' => $r['name'],
        'type' => $r['customer_type'],
        'contact_name' => $r['contact_name'],
        'email' => $r['email'],
        'phone' => $r['phone'],
        'city' => $r['city'],
        'notes' => $r['notes'],
        'archived' => (int)$r['archived'] === 1,
        'created_source' => $r['created_source'],
        'created_at' => $r['created_at'],
        'updated_at' => $r['updated_at'],
        'games_count' => isset($r['games_count']) ? (int)$r['games_count'] : 0,
        'last_played_at' => $r['last_played_at'] ?? null,
    ];
}

// A live (not merged, not deleted) customer of this licensee, or 404.
function requireLiveCustomer($db, int $clientId, $id): array {
    if (!LicenseeCustomers::isUuid($id)) jsonResponse(['error' => 'Invalid id'], 400);
    $row = LicenseeCustomers::find($db, $clientId, $id);
    if (!$row || !empty($row['merged_into_id']) || !empty($row['deleted_at'])) {
        jsonResponse(['error' => 'Customer not found'], 404);
    }
    return $row;
}

function gameRowsSelect(): string {
    return 'SELECT gs.summary_uuid, gs.name, gs.game_type, gs.scenario_uniqid, gs.played_at,
                   gs.teams_launched, gs.teams_played, gs.players_played, gs.customer_id,
                   gs.customer_assigned_at, gs.customer_assigned_source,
                   COALESCE(s.title, gs.scenario_uniqid) AS scenario_title, s.medias AS scenario_medias
            FROM game_summaries gs
            LEFT JOIN scenarios s ON s.uniqid = gs.scenario_uniqid';
}

function shapeGame(array $r): array {
    return [
        'summary_uuid' => $r['summary_uuid'],
        'name' => $r['name'],
        'game_type' => $r['game_type'],
        'scenario_uniqid' => $r['scenario_uniqid'],
        'scenario_title' => $r['scenario_title'],
        'scenario_medias' => $r['scenario_medias'] ? json_decode($r['scenario_medias'], true) : null,
        'played_at' => $r['played_at'],
        'teams_launched' => $r['teams_launched'] !== null ? (int)$r['teams_launched'] : null,
        'teams_played' => (int)$r['teams_played'],
        'players_played' => (int)$r['players_played'],
        'customer_id' => $r['customer_id'],
        'customer_name' => $r['customer_name'] ?? null,
    ];
}

$action = $_GET['action'] ?? 'list';

try {
    $db = Database::getInstance();
    if (!LicenseeCustomers::migrated()) {
        jsonResponse(['error' => 'Customers migration not applied'], 503);
    }
    $auth = LicenseeCustomers::requireAuth($db);
    $clientId = $auth['clientId'];
    $method = $_SERVER['REQUEST_METHOD'];
    $isRead = in_array($action, ['list', 'get', 'history', 'candidates'], true);
    if ($isRead && $method !== 'GET') jsonResponse(['error' => 'Method not allowed'], 405);
    if (!$isRead && $method !== 'POST') jsonResponse(['error' => 'Method not allowed'], 405);
    $data = $isRead ? [] : getRequestData();

    $log = function (array $details) use ($action, $auth) {
        Logger::log('customers', $_SERVER['REQUEST_METHOD'], $action, $auth['actorId'],
            $details + ['client_id' => $auth['clientId'], 'actor' => $auth['actor']], null, 200,
            $auth['actor'] === 'admin' ? 'admin' : 'client');
    };

    switch ($action) {
        case 'list': {
            $conds = ['c.client_id = ?', 'c.merged_into_id IS NULL', 'c.deleted_at IS NULL'];
            $args = [$clientId];
            if (empty($_GET['include_archived'])) {
                $conds[] = 'c.archived = 0';
            }
            $q = trim((string)($_GET['q'] ?? ''));
            if ($q !== '') {
                $like = '%' . $q . '%';
                $conds[] = '(c.name LIKE ? OR c.city LIKE ? OR c.contact_name LIKE ? OR c.email LIKE ?)';
                array_push($args, $like, $like, $like, $like);
            }
            $order = [
                'last_played' => 'last_played_at IS NULL, last_played_at DESC, c.name',
                'games' => 'games_count DESC, c.name',
            ][$_GET['sort'] ?? ''] ?? 'c.name';
            $rows = $db->fetchAll(
                'SELECT ' . CUSTOMER_COLS . ',
                        COUNT(gs.id) AS games_count, MAX(gs.played_at) AS last_played_at
                 FROM licensee_customers c
                 LEFT JOIN game_summaries gs ON gs.client_id = c.client_id AND gs.customer_id = c.id
                 WHERE ' . implode(' AND ', $conds) . '
                 GROUP BY c.id
                 ORDER BY ' . $order,
                $args
            );
            jsonResponse(['customers' => array_map('shapeCustomer', $rows)]);
        }

        case 'get': {
            $id = (string)($_GET['id'] ?? '');
            if (!LicenseeCustomers::isUuid($id)) jsonResponse(['error' => 'Invalid id'], 400);
            $row = LicenseeCustomers::find($db, $clientId, $id);
            if (!$row || !empty($row['deleted_at'])) jsonResponse(['error' => 'Customer not found'], 404);
            if (!empty($row['merged_into_id'])) {
                $final = LicenseeCustomers::resolve($db, $clientId, $id);
                jsonResponse(['redirect_to' => $final ? $final['id'] : null]);
            }
            $stats = $db->fetch(
                'SELECT COUNT(*) AS games_count, MAX(played_at) AS last_played_at
                 FROM game_summaries WHERE client_id = ? AND customer_id = ?',
                [$clientId, $id]
            );
            $mergedFrom = $db->fetchAll(
                'SELECT id, name FROM licensee_customers WHERE client_id = ? AND merged_into_id = ? ORDER BY name',
                [$clientId, $id]
            );
            jsonResponse([
                'customer' => shapeCustomer($row + $stats),
                'merged_from' => $mergedFrom,
            ]);
        }

        case 'history': {
            $row = requireLiveCustomer($db, $clientId, $_GET['id'] ?? '');
            $rows = $db->fetchAll(
                gameRowsSelect() . ' WHERE gs.client_id = ? AND gs.customer_id = ?
                 ORDER BY gs.played_at DESC, gs.id DESC',
                [$clientId, $row['id']]
            );
            jsonResponse(['games' => array_map('shapeGame', $rows)]);
        }

        case 'candidates': {
            $row = requireLiveCustomer($db, $clientId, $_GET['id'] ?? '');
            $conds = ['gs.client_id = ?'];
            $args = [$clientId];
            $filter = $_GET['filter'] ?? 'untagged';
            if ($filter === 'untagged') {
                $conds[] = 'gs.customer_id IS NULL';
            } elseif ($filter === 'other') {
                $conds[] = 'gs.customer_id IS NOT NULL AND gs.customer_id <> ?';
                $args[] = $row['id'];
            } else {
                $conds[] = '(gs.customer_id IS NULL OR gs.customer_id <> ?)';
                $args[] = $row['id'];
            }
            $q = trim((string)($_GET['q'] ?? ''));
            if ($q !== '') {
                $like = '%' . $q . '%';
                $conds[] = '(gs.name LIKE ? OR s.title LIKE ?)';
                array_push($args, $like, $like);
            }
            $limit = max(1, min(200, (int)($_GET['limit'] ?? 50)));
            $offset = max(0, (int)($_GET['offset'] ?? 0));
            $where = ' WHERE ' . implode(' AND ', $conds);
            $rows = $db->fetchAll(
                str_replace('FROM game_summaries gs', ', lc.name AS customer_name FROM game_summaries gs', gameRowsSelect()) .
                ' LEFT JOIN licensee_customers lc ON lc.id = gs.customer_id' . $where .
                ' ORDER BY gs.played_at DESC, gs.id DESC LIMIT ? OFFSET ?',
                array_merge($args, [$limit, $offset])
            );
            $total = $db->fetch(
                'SELECT COUNT(*) AS n FROM game_summaries gs
                 LEFT JOIN scenarios s ON s.uniqid = gs.scenario_uniqid' . $where,
                $args
            );
            jsonResponse(['games' => array_map('shapeGame', $rows), 'total' => (int)$total['n']]);
        }

        case 'create': {
            $f = customerFields($data, false);
            if ($f['name'] === null) jsonResponse(['error' => 'Name is required'], 400);
            $id = LicenseeCustomers::uuidV4();
            $db->execute(
                'INSERT INTO licensee_customers
                   (id, client_id, name, customer_type, contact_name, email, phone, city, notes, created_source)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$id, $clientId, $f['name'], $f['customer_type'], $f['contact_name'], $f['email'],
                 $f['phone'], $f['city'], $f['notes'], 'studio']
            );
            LicenseeCustomers::bumpVersion($db, $clientId);
            $log(['id' => $id]);
            $row = LicenseeCustomers::find($db, $clientId, $id);
            jsonResponse(['customer' => shapeCustomer($row)]);
        }

        case 'update': {
            $row = requireLiveCustomer($db, $clientId, $data['id'] ?? '');
            $f = customerFields($data, true);
            if (array_key_exists('name', $f) && $f['name'] === null) {
                jsonResponse(['error' => 'Name is required'], 400);
            }
            if ($f) {
                $sets = implode(', ', array_map(fn($k) => "$k = ?", array_keys($f)));
                $db->execute(
                    "UPDATE licensee_customers SET $sets WHERE id = ? AND client_id = ?",
                    array_merge(array_values($f), [$row['id'], $clientId])
                );
                LicenseeCustomers::bumpVersion($db, $clientId);
            }
            $log(['id' => $row['id']]);
            jsonResponse(['customer' => shapeCustomer(LicenseeCustomers::find($db, $clientId, $row['id']))]);
        }

        case 'archive': {
            $row = requireLiveCustomer($db, $clientId, $data['id'] ?? '');
            $db->execute(
                'UPDATE licensee_customers SET archived = ? WHERE id = ? AND client_id = ?',
                [!empty($data['archived']) ? 1 : 0, $row['id'], $clientId]
            );
            LicenseeCustomers::bumpVersion($db, $clientId);
            $log(['id' => $row['id'], 'archived' => !empty($data['archived'])]);
            jsonResponse(['success' => true]);
        }

        case 'delete': {
            $row = requireLiveCustomer($db, $clientId, $data['id'] ?? '');
            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                $n = $db->fetch(
                    'SELECT COUNT(*) AS n FROM game_summaries WHERE client_id = ? AND customer_id = ? FOR UPDATE',
                    [$clientId, $row['id']]
                );
                if ((int)$n['n'] > 0) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Customer has games', 'code' => 'HAS_GAMES'], 409);
                }
                $db->execute('UPDATE licensee_customers SET deleted_at = NOW() WHERE id = ?', [$row['id']]);
                $pdo->commit();
            } catch (Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
            LicenseeCustomers::bumpVersion($db, $clientId);
            $log(['id' => $row['id']]);
            jsonResponse(['success' => true]);
        }

        case 'merge': {
            $source = requireLiveCustomer($db, $clientId, $data['source_id'] ?? '');
            $target = requireLiveCustomer($db, $clientId, $data['target_id'] ?? '');
            if ($source['id'] === $target['id']) jsonResponse(['error' => 'Cannot merge into itself'], 400);
            $now = LicenseeCustomers::utcNowMs();
            $pdo = $db->getConnection();
            $pdo->beginTransaction();
            try {
                $moved = $db->query(
                    "UPDATE game_summaries SET customer_id = ?, customer_assigned_at = ?, customer_assigned_source = 'studio'
                     WHERE client_id = ? AND customer_id = ?",
                    [$target['id'], $now, $clientId, $source['id']]
                )->rowCount();
                // Keep chains flat: anything merged into the source now points at the target.
                $db->execute(
                    'UPDATE licensee_customers SET merged_into_id = ? WHERE client_id = ? AND merged_into_id = ?',
                    [$target['id'], $clientId, $source['id']]
                );
                $db->execute(
                    'UPDATE licensee_customers SET merged_into_id = ?, archived = 1 WHERE id = ?',
                    [$target['id'], $source['id']]
                );
                // Keep the source's details where the target has none.
                $db->execute(
                    'UPDATE licensee_customers SET
                       customer_type = COALESCE(customer_type, ?),
                       contact_name = COALESCE(contact_name, ?),
                       email = COALESCE(email, ?),
                       phone = COALESCE(phone, ?),
                       city = COALESCE(city, ?)
                     WHERE id = ?',
                    [$source['customer_type'], $source['contact_name'], $source['email'],
                     $source['phone'], $source['city'], $target['id']]
                );
                $pdo->commit();
            } catch (Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
            LicenseeCustomers::bumpVersion($db, $clientId);
            $log(['source_id' => $source['id'], 'target_id' => $target['id'], 'games_moved' => $moved]);
            jsonResponse(['success' => true, 'games_moved' => $moved]);
        }

        case 'assign': {
            $uuids = array_values(array_filter(
                is_array($data['summary_uuids'] ?? null) ? $data['summary_uuids'] : [],
                fn($u) => is_string($u) && $u !== '' && strlen($u) <= 36
            ));
            if (!$uuids || count($uuids) > 500) jsonResponse(['error' => 'summary_uuids: 1..500 required'], 400);
            $customerId = null;
            if (($data['customer_id'] ?? null) !== null) {
                $customerId = requireLiveCustomer($db, $clientId, $data['customer_id'])['id'];
            }
            $in = implode(',', array_fill(0, count($uuids), '?'));
            $n = $db->query(
                "UPDATE game_summaries SET customer_id = ?, customer_assigned_at = ?, customer_assigned_source = 'studio'
                 WHERE client_id = ? AND summary_uuid IN ($in)",
                array_merge([$customerId, LicenseeCustomers::utcNowMs(), $clientId], $uuids)
            )->rowCount();
            LicenseeCustomers::bumpVersion($db, $clientId);
            $log(['customer_id' => $customerId, 'count' => $n]);
            jsonResponse(['success' => true, 'updated' => $n]);
        }

        case 'import': {
            $rows = is_array($data['rows'] ?? null) ? $data['rows'] : [];
            if (count($rows) > 1000) jsonResponse(['error' => 'Max 1000 rows per call'], 400);
            // Name match uses the column's utf8mb4_unicode_ci collation (case- and
            // accent-insensitive). Rows inserted earlier in this call match too;
            // they are told apart as duplicate_in_file.
            $createdIds = [];
            $skipped = [];
            foreach ($rows as $i => $r) {
                if (!is_array($r)) { $skipped[] = ['index' => $i, 'reason' => 'invalid']; continue; }
                $f = customerFields($r, false);
                if ($f['name'] === null) { $skipped[] = ['index' => $i, 'reason' => 'invalid']; continue; }
                $match = $db->fetch(
                    'SELECT id FROM licensee_customers
                     WHERE client_id = ? AND name = ? AND merged_into_id IS NULL AND deleted_at IS NULL LIMIT 1',
                    [$clientId, $f['name']]
                );
                if ($match) {
                    $skipped[] = ['index' => $i, 'reason' => isset($createdIds[$match['id']]) ? 'duplicate_in_file' : 'exists'];
                    continue;
                }
                $id = LicenseeCustomers::uuidV4();
                $db->execute(
                    'INSERT INTO licensee_customers
                       (id, client_id, name, customer_type, contact_name, email, phone, city, notes, created_source)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$id, $clientId, $f['name'], $f['customer_type'], $f['contact_name'],
                     $f['email'], $f['phone'], $f['city'], $f['notes'], 'import']
                );
                $createdIds[$id] = true;
            }
            $created = count($createdIds);
            if ($created > 0) LicenseeCustomers::bumpVersion($db, $clientId);
            $log(['created' => $created, 'skipped' => count($skipped)]);
            jsonResponse(['created' => $created, 'skipped' => $skipped]);
        }

        default:
            jsonResponse(['error' => 'Invalid action'], 400);
    }
} catch (Exception $e) {
    Logger::log('customers', $_SERVER['REQUEST_METHOD'] ?? 'GET', $action, null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
