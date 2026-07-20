<?php

/**
 * Scenarios API.
 *
 * Canonical columns on the `scenarios` table:
 *   - data            jsonb   Game configuration (e.g. available_languages, gameplay settings)
 *   - medias          jsonb   Media manifest: {images: {game_visual, background_image, ...}, video, sounds, ...}
 *   - scenario_layout jsonb   Hotspot/element layout: array of {id, type, x, y, width, height, label}
 *   - version         text    Scenario version string (default '1.0')
 *   - status          text    'draft' | 'published' | 'archived'
 *   - scenario_type   text    'product' (Taghunter template) | 'custom' (client-authored)
 *
 * Uploaded files (including the bundled ZIP) live in the separate `scenario_files` table.
 * The `game_meta` and `media_url` columns were dropped 2026-04-29; do not re-add.
 */

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

session_start();

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/ScenarioHashes.php';

function jsonResponse($data, $statusCode = 200) {
    header('Content-Type: application/json');
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

// Token takes precedence; session fallback requires explicit user_type.
// A stale session from a prior admin login must not shadow the current token.
function requireAuth() {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header !== '') {
        $tokenData = TokenManager::validateToken(Database::getInstance(), $header);
        if ($tokenData) {
            // Overwrite any stale session with the authoritative token values.
            $_SESSION['user_id'] = $tokenData['user_id'];
            $_SESSION['user_type'] = $tokenData['user_type'];
            return;
        }
    }

    if (isset($_SESSION['user_id']) && isset($_SESSION['user_type'])) {
        return;
    }

    jsonResponse(['error' => 'Unauthorized'], 401);
}

function getRequestData() {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];

    switch ($action) {
        case 'create':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            // Phase 4a: require a real token or session. The legacy email-based
            // path (client sends their email in the body) is no longer trusted -
            // auth must come from a validated token.
            requireAuth();

            // Get raw input to check if it's JSON
            $rawInput = file_get_contents('php://input');
            $jsonInput = json_decode($rawInput, true);

            // Log incoming request data for debugging
            Logger::log('scenarios', $method, 'create_incoming', $_SESSION['user_id'] ?? null, [
                'POST' => $_POST,
                'raw_input' => $rawInput ? substr($rawInput, 0, 500) : 'EMPTY',
                'json_input' => $jsonInput,
                'FILES' => isset($_FILES) ? array_map(function($file) {
                    return [
                        'name' => $file['name'] ?? null,
                        'size' => $file['size'] ?? null,
                        'error' => $file['error'] ?? null
                    ];
                }, $_FILES) : [],
                'content_type' => $_SERVER['CONTENT_TYPE'] ?? null
            ], ['message' => 'Incoming create request'], 200);

            // Post-Phase-4a: admin vs client is decided by the token's user_type,
            // not just session-has-a-user (which is now true for clients too after requireAuth).
            $isAdminRequest = ($_SESSION['user_type'] ?? '') === 'admin';
            // Extract email from multiple possible locations
            $email = $_POST['email'] ?? ($jsonInput['email'] ?? null);
            $logSource = $isAdminRequest ? 'admin' : 'creator';

            Logger::log('scenarios', $method, 'email_extraction', null, [
                'email_from_POST' => $_POST['email'] ?? 'NOT_SET',
                'email_from_jsonInput' => $jsonInput['email'] ?? 'NOT_SET',
                'final_email' => $email,
                'jsonInput_keys' => is_array($jsonInput) ? array_keys($jsonInput) : 'NOT_ARRAY'
            ], ['message' => 'Email extraction from request'], 200, 'creator');

            if (!$isAdminRequest && !$email) {
                Logger::log('scenarios', $method, 'create', null, $_POST, ['error' => 'Unauthorized - no session or email'], 401, 'creator');
                jsonResponse(['error' => 'Unauthorized'], 401);
            }

            // Parse scenario data - check both form data and raw JSON
            $scenarioData = null;

            // Case 1: Form data with scenarioData as JSON string
            if (isset($_POST['scenarioData'])) {
                $scenarioData = json_decode($_POST['scenarioData'], true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Invalid JSON in scenarioData'], 400);
                    jsonResponse(['error' => 'Invalid JSON in scenarioData'], 400);
                }
            }
            // Case 2: Raw JSON body with scenarioData field
            elseif (isset($jsonInput['scenarioData'])) {
                $scenarioData = $jsonInput['scenarioData'];
            }
            // Case 3: Raw JSON body IS the scenario data
            elseif ($jsonInput && !empty($jsonInput)) {
                $scenarioData = $jsonInput;
            }

            // If email not found yet, check inside scenarioData
            if (!$email && $scenarioData && isset($scenarioData['email'])) {
                $email = $scenarioData['email'];
            }

            // Log parsed scenario data if we have it
            if ($scenarioData) {
                Logger::log('scenarios', $method, 'create_parsed', $_SESSION['user_id'] ?? null, [
                    'scenarioData' => $scenarioData,
                    'has_data_field' => isset($scenarioData['data']),
                    'data_value' => $scenarioData['data'] ?? 'NOT_SET',
                    'has_media_field' => isset($scenarioData['media']),
                    'media_value' => $scenarioData['media'] ?? 'NOT_SET',
                    'email' => $email,
                    'all_keys' => array_keys($scenarioData)
                ], ['message' => 'Parsed scenarioData'], 200);
            }

            // Get fields from either direct POST or scenarioData
            $client_id = null;
            $emailBasedCreatedBy = null;
            $title = null;
            $description = null;
            $data = null;
            $medias = null;
            $game_type = null;
            $scenario_type = null;
            $scenario_layout = null;
            $status = null;

            if ($scenarioData) {
                // Client app format
                // Store the 'data' field in data column (default to empty object if not present)
                $data = $scenarioData['data'] ?? [];
                // Store the 'media' field in medias column (default to empty object if not present)
                $medias = $scenarioData['media'] ?? [];
                $title = $scenarioData['title'] ?? null;
                $description = $scenarioData['description'] ?? null;
                $game_type = $scenarioData['game_type'] ?? null;
                $scenario_type = $scenarioData['scenario_type'] ?? null;
                $scenario_layout = $scenarioData['scenario_layout'] ?? null;
                $status = $scenarioData['status'] ?? 'draft';
                $uniqid = $scenarioData['uniqid'] ?? null;

                // NEW: Extract is_admin and client_id from request
                $raw_is_admin = $scenarioData['is_admin'] ?? false;
                $is_admin_from_creator = $raw_is_admin === true || $raw_is_admin === 1 || $raw_is_admin === '1' || $raw_is_admin === 'true';
                $client_id_from_creator = isset($scenarioData['client_id']) ? (int)$scenarioData['client_id'] : null;

                Logger::log('scenarios', $method, 'creator_fields', null, [
                    'is_admin' => $is_admin_from_creator,
                    'client_id' => $client_id_from_creator,
                    'email' => $email
                ], ['message' => 'Fields from Creator app'], 200, 'creator');

                // Use the fields from Creator directly
                if ($is_admin_from_creator) {
                    // is_admin is true/1 - force client_id to null regardless of any other value
                    $client_id = null;
                    $client_id_from_creator = null;
                    // Look up admin ID by email if provided
                    if ($email) {
                        $admin = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);
                        if ($admin) {
                            $emailBasedCreatedBy = (int)$admin['id'];
                            Logger::log('scenarios', $method, 'admin_id_set', null, [
                                'emailBasedCreatedBy' => $emailBasedCreatedBy,
                                'source' => 'email_lookup',
                                'email' => $email
                            ], ['message' => 'Admin ID set from email lookup'], 200, 'creator');
                        } else {
                            Logger::log('scenarios', $method, 'admin_not_found', null, [
                                'email' => $email
                            ], ['error' => 'Admin not found'], 404, 'creator');
                            jsonResponse(['error' => 'Admin with this email not found'], 404);
                        }
                    }
                } else {
                    // This is a client scenario - use client_id from Creator
                    if ($client_id_from_creator) {
                        $client_id = $client_id_from_creator;
                        $emailBasedCreatedBy = null;
                        Logger::log('scenarios', $method, 'client_id_set', null, [
                            'client_id' => $client_id,
                            'source' => 'creator_field'
                        ], ['message' => 'Client ID set from Creator field'], 200, 'creator');
                    } else {
                        // Fallback: lookup client by email
                        if ($email) {
                            $client = $db->fetch('SELECT id FROM clients WHERE email = ?', [$email]);
                            if ($client) {
                                $client_id = (int)$client['id'];
                                $emailBasedCreatedBy = null;
                                Logger::log('scenarios', $method, 'client_id_set', null, [
                                    'client_id' => $client_id,
                                    'source' => 'email_lookup_fallback',
                                    'email' => $email
                                ], ['message' => 'Client ID set from email fallback lookup'], 200, 'creator');
                            } else {
                                Logger::log('scenarios', $method, 'client_not_found', null, [
                                    'email' => $email
                                ], ['error' => 'Client not found'], 404, 'creator');
                                jsonResponse(['error' => 'Client with this email not found'], 404);
                            }
                        } else {
                            Logger::log('scenarios', $method, 'no_client_id', null, [], ['error' => 'No client_id or email provided'], 400, 'creator');
                            jsonResponse(['error' => 'No client_id or email provided'], 400);
                        }
                    }
                }
            } else {
                // Admin format - check for both 'media' and 'medias' field names
                $client_id = isset($_POST['client_id']) ? (int)$_POST['client_id'] : null;
                $title = $_POST['title'] ?? null;
                $description = $_POST['description'] ?? null;
                $data = $_POST['data'] ?? null;
                // Canonical field is 'medias' (matches DB column). 'media' (singular) is a deprecated alias
                // accepted for one release window; emit a log when seen so we can track remaining callers.
                if (!isset($_POST['medias']) && isset($_POST['media'])) {
                    Logger::log('scenarios', $method, 'deprecated_field', $_SESSION['user_id'] ?? null, [
                        'field' => 'media',
                        'replacement' => 'medias'
                    ], ['message' => 'Deprecated singular "media" field received; rename to "medias"'], 200);
                }
                $medias = $_POST['medias'] ?? $_POST['media'] ?? null;
                $game_type = $_POST['game_type'] ?? null;
                $scenario_type = $_POST['scenario_type'] ?? null;
                $scenario_layout = $_POST['scenario_layout'] ?? null;
                $status = $_POST['status'] ?? 'draft';
                $uniqid = $_POST['uniqid'] ?? null;
            }

            // Phase 4a: for non-admin tokens, override client_id and scenario_type
            // with server-derived safe values. A client cannot self-promote their
            // scenario to a Taghunter product template or assign it to another user.
            if (!$isAdminRequest) {
                $client_id = (int)$_SESSION['user_id'];
                $scenario_type = 'custom';
            }

            // Log extracted fields before processing
            Logger::log('scenarios', $method, 'create_extracted', $_SESSION['user_id'] ?? null, [
                'medias_raw' => $medias,
                'medias_type' => gettype($medias),
                'medias_length' => is_string($medias) ? strlen($medias) : 'N/A',
                'medias_first_100' => is_string($medias) ? substr($medias, 0, 100) : $medias,
                'has_POST_media' => isset($_POST['media']),
                'has_POST_medias' => isset($_POST['medias'])
            ], ['message' => 'Extracted fields from POST'], 200);

            // Convert data to JSON string if it's an array
            if (is_array($data)) {
                $data = json_encode($data);
            } elseif (is_string($data) && !empty($data)) {
                // Validate it's valid JSON
                json_decode($data);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, ['data' => $data], ['error' => 'Invalid JSON in data'], 400);
                    jsonResponse(['error' => 'data must be valid JSON string or object'], 400);
                }
            }

            // Convert medias to JSON string if it's an array
            if (is_array($medias)) {
                $medias = json_encode($medias);
            } elseif (is_string($medias) && !empty($medias)) {
                // Validate it's valid JSON
                json_decode($medias);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, ['medias' => $medias], ['error' => 'Invalid JSON in medias'], 400);
                    jsonResponse(['error' => 'medias must be valid JSON string or object'], 400);
                }
            }

            // Convert scenario_layout to JSON string if it's an array
            if (is_array($scenario_layout)) {
                $scenario_layout = json_encode($scenario_layout);
            } elseif (is_string($scenario_layout) && !empty($scenario_layout)) {
                // Validate it's valid JSON
                json_decode($scenario_layout);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, ['scenario_layout' => $scenario_layout], ['error' => 'Invalid JSON in scenario_layout'], 400);
                    jsonResponse(['error' => 'scenario_layout must be valid JSON string or array'], 400);
                }
            }

            // Ensure data and medias are never null - use empty JSON object if needed
            if ($data === null || $data === '') {
                $data = '{}';
            }
            if ($medias === null || $medias === '') {
                $medias = '{}';
            }
            if ($scenario_layout === null || $scenario_layout === '') {
                $scenario_layout = '[]';
            }

            // Validate required fields
            if (!$title || !$description || !$uniqid) {
                Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Missing required fields'], 400);
                jsonResponse(['error' => 'Missing required fields: title, description, uniqid'], 400);
            }

            $title = trim($title);
            $description = trim($description);
            $uniqid = trim($uniqid);

            if (empty($title) || empty($description) || empty($uniqid)) {
                Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Empty fields'], 400);
                jsonResponse(['error' => 'Title, description, and uniqid cannot be empty'], 400);
            }

            // Verify client exists if client_id provided (client_id is optional)
            if ($client_id) {
                $client = $db->fetch('SELECT id FROM clients WHERE id = ?', [$client_id]);
                if (!$client) {
                    Logger::log('scenarios', $method, 'create', $_SESSION['user_id'] ?? null, $_POST, ['error' => 'Client not found'], 404);
                    jsonResponse(['error' => 'Client not found'], 404);
                }
            }

            // File uploads are handled separately via scenario_files.php
            // Check if scenario with this uniqid already exists
            $existingScenario = $db->fetch('SELECT id, created_at FROM scenarios WHERE uniqid = ?', [$uniqid]);

            // Set created_by: prefer session user, fall back to email-based lookup
            $created_by = $_SESSION['user_id'] ?? ($emailBasedCreatedBy ?? null);
            $isUpdate = false;
            $scenario_id = null;
            $created_at = null;

            // Debug: Log client_id state right before database operation
            Logger::log('scenarios', $method, 'client_id_final', $_SESSION['user_id'] ?? null, [
                'client_id' => $client_id,
                'client_id_type' => gettype($client_id),
                'email' => $email,
                'emailBasedCreatedBy' => $emailBasedCreatedBy,
                'created_by' => $created_by
            ], ['message' => 'Final client_id before DB operation'], 200, $logSource);

            // Log final values before database operation
            // is_taghunter_product: true only if scenario_type is NOT 'custom' (i.e., it's a template or base game)
            $is_taghunter_product = ($scenario_type !== 'custom');

            Logger::log('scenarios', $method, 'create_pre_db', $_SESSION['user_id'] ?? null, [
                'client_id' => $client_id,
                'created_by' => $created_by,
                'is_taghunter_product' => $is_taghunter_product,
                'email' => $email,
                'title' => $title,
                'description' => substr($description, 0, 100),
                'data' => $data === '{}' ? 'EMPTY_OBJECT' : (is_string($data) ? substr($data, 0, 200) : 'ARRAY'),
                'medias' => $medias === '{}' ? 'EMPTY_OBJECT' : (is_string($medias) ? substr($medias, 0, 200) : 'ARRAY'),
                'medias_full' => $medias,
                'game_type' => $game_type,
                'scenario_type' => $scenario_type,
                'uniqid' => $uniqid,
                'is_update' => $existingScenario ? true : false
            ], ['message' => 'Values before DB operation'], 200);

            if ($existingScenario) {
                // Update existing scenario
                $scenario_id = $existingScenario['id'];
                $created_at = $existingScenario['created_at'];
                $isUpdate = true;

                $sql = 'UPDATE scenarios SET client_id = ?, title = ?, description = ?, data = ?, medias = ?, game_type = ?, scenario_type = ?, scenario_layout = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE uniqid = ?';
                $db->query($sql, [$client_id, $title, $description, $data, $medias, $game_type, $scenario_type, $scenario_layout, $status, $uniqid]);
            } else {
                // Insert new scenario
                $sql = 'INSERT INTO scenarios (client_id, title, description, data, medias, game_type, scenario_type, scenario_layout, status, uniqid, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                $db->query($sql, [$client_id, $title, $description, $data, $medias, $game_type, $scenario_type, $scenario_layout, $status, $uniqid, $created_by]);
                $scenario_id = $db->getConnection()->lastInsertId();
                $created_at = date('Y-m-d H:i:s');
            }

            // Refresh content hashes (data + media) so the playground's
            // incremental sync sees this change. Never let a hashing hiccup
            // fail the save - the manifest builder has a NULL-hash fallback.
            try {
                ScenarioHashes::recompute($db->getConnection(), $uniqid);
            } catch (Exception $e) {
                Logger::log('scenarios', $method, 'recompute_hashes', $_SESSION['user_id'] ?? null, ['uniqid' => $uniqid], ['error' => $e->getMessage()], 200);
            }

            $responseData = [
                'success' => true,
                'data' => [
                    'id' => $scenario_id,
                    'client_id' => $client_id,
                    'email' => $email,
                    'is_taghunter_product' => $client_id === null,
                    'title' => $title,
                    'description' => $description,
                    'data' => $data,
                    'medias' => $medias,
                    'game_type' => $game_type,
                    'scenario_type' => $scenario_type,
                    'status' => $status,
                    'uniqid' => $uniqid,
                    'created_at' => $created_at
                ],
                'message' => $isUpdate ? 'Scenario updated successfully' : 'Scenario created successfully'
            ];

            Logger::log('scenarios', $method, $isUpdate ? 'update' : 'create', $_SESSION['user_id'] ?? null, [
                'client_id' => $client_id,
                'is_taghunter_product' => $client_id === null,
                'title' => $title,
                'email' => $email,
                'uniqid' => $uniqid
            ], $responseData, $isUpdate ? 200 : 201, $logSource);

            if ($status === 'published') {
                $notifAction = $isUpdate ? 'published (updated)' : 'published';
                $notifMeta = json_encode([
                    'creator_email' => $email,
                    'item_id' => $scenario_id,
                    'item_name' => $title,
                    'navigate_to' => 'scenarios'
                ]);
                // Notifications are a side-effect - never fail a publish for them.
                // (Was load-bearing before: a missing admin_notifications table
                // returned 500 even though the scenario row had already been
                // saved. Caught during Stage 2 QA on 2026-05-05.)
                try {
                    $db->execute(
                        'INSERT INTO admin_notifications (type, title, message, metadata) VALUES (?, ?, ?, ?)',
                        ['scenario_created', 'Scenario published', '"' . $title . '" was ' . $notifAction . ' by ' . $email, $notifMeta]
                    );
                } catch (Throwable $notifErr) {
                    error_log('scenarios.php: admin_notifications insert failed (non-fatal): ' . $notifErr->getMessage());
                }
            }

            jsonResponse($responseData, $isUpdate ? 200 : 201);
            break;

        case 'list':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                Logger::log('scenarios', $method, 'list', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $client_id = $_GET['client_id'] ?? null;

            if ($client_id) {
                $scenarios = $db->fetchAll(
                    'SELECT s.*, a.name as creator_name
                     FROM scenarios s
                     LEFT JOIN admin_users a ON s.created_by = a.id
                     WHERE s.client_id = ?
                     ORDER BY s.created_at DESC',
                    [(int)$client_id]
                );
            } else {
                $scenarios = $db->fetchAll(
                    'SELECT s.*, a.name as creator_name, c.name as client_name, c.email as client_email
                     FROM scenarios s
                     LEFT JOIN admin_users a ON s.created_by = a.id
                     LEFT JOIN clients c ON s.client_id = c.id
                     ORDER BY s.created_at DESC'
                );
            }

            Logger::log('scenarios', $method, 'list', $_SESSION['user_id'], ['client_id' => $client_id], ['count' => count($scenarios)], 200);
            jsonResponse(['scenarios' => $scenarios]);
            break;

        case 'get':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
                Logger::log('scenarios', $method, 'get', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $id = $_GET['id'] ?? null;
            if (!$id) {
                Logger::log('scenarios', $method, 'get', $_SESSION['user_id'], [], ['error' => 'Missing ID'], 400);
                jsonResponse(['error' => 'Scenario ID is required'], 400);
            }

            $scenario = $db->fetch(
                'SELECT s.*, a.name as creator_name, c.name as client_name, c.email as client_email
                 FROM scenarios s
                 LEFT JOIN admin_users a ON s.created_by = a.id
                 LEFT JOIN clients c ON s.client_id = c.id
                 WHERE s.id = ?',
                [(int)$id]
            );

            if (!$scenario) {
                Logger::log('scenarios', $method, 'get', $_SESSION['user_id'], ['id' => $id], ['error' => 'Not found'], 404);
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            Logger::log('scenarios', $method, 'get', $_SESSION['user_id'], ['id' => $id], ['success' => true], 200);
            jsonResponse(['scenario' => $scenario]);
            break;

        case 'update':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            if (!isset($_POST['id'])) {
                jsonResponse(['error' => 'Scenario ID is required'], 400);
            }

            $id = (int)$_POST['id'];

            // Verify scenario exists
            $scenario = $db->fetch('SELECT * FROM scenarios WHERE id = ?', [$id]);
            if (!$scenario) {
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            // Phase 4a: non-admin tokens can only update scenarios they own,
            // and cannot change scenario_type (handled below after the assignment).
            $isAdminToken = ($_SESSION['user_type'] ?? '') === 'admin';
            if (!$isAdminToken) {
                if ((int)($scenario['client_id'] ?? 0) !== (int)$_SESSION['user_id']) {
                    jsonResponse(['error' => 'Forbidden'], 403);
                }
            }

            $title = isset($_POST['title']) ? trim($_POST['title']) : $scenario['title'];
            $description = isset($_POST['description']) ? trim($_POST['description']) : $scenario['description'];
            $data = isset($_POST['data']) ? $_POST['data'] : $scenario['data'];
            $medias = isset($_POST['medias']) ? $_POST['medias'] : $scenario['medias'];
            $game_type = isset($_POST['game_type']) ? $_POST['game_type'] : $scenario['game_type'];
            $scenario_type = isset($_POST['scenario_type']) ? $_POST['scenario_type'] : $scenario['scenario_type'];
            $status = isset($_POST['status']) ? $_POST['status'] : $scenario['status'];

            // Phase 4a: non-admin tokens cannot change scenario_type.
            if (!$isAdminToken) {
                $scenario_type = $scenario['scenario_type'];
            }

            // Convert data to JSON string if it's an array
            if (is_array($data)) {
                $data = json_encode($data);
            } elseif (is_string($data) && !empty($data)) {
                // Validate it's valid JSON
                json_decode($data);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    jsonResponse(['error' => 'data must be valid JSON string or object'], 400);
                }
            }

            // Convert medias to JSON string if it's an array
            if (is_array($medias)) {
                $medias = json_encode($medias);
            } elseif (is_string($medias) && !empty($medias)) {
                // Validate it's valid JSON
                json_decode($medias);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    jsonResponse(['error' => 'medias must be valid JSON string or object'], 400);
                }
            }

            // Ensure data and medias are never null - use empty JSON object if needed
            if ($data === null || $data === '') {
                $data = '{}';
            }
            if ($medias === null || $medias === '') {
                $medias = '{}';
            }

            // Handle new zip file upload - store as a row in scenario_files (mime_type=application/zip)
            if (isset($_FILES['zip_file']) && $_FILES['zip_file']['error'] === UPLOAD_ERR_OK) {
                $file = $_FILES['zip_file'];

                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                $mimeType = finfo_file($finfo, $file['tmp_name']);
                finfo_close($finfo);

                $allowedTypes = ['application/zip', 'application/x-zip-compressed'];
                if (!in_array($mimeType, $allowedTypes)) {
                    jsonResponse(['error' => 'Only zip files are allowed'], 400);
                }

                if ($file['size'] > 50 * 1024 * 1024) {
                    jsonResponse(['error' => 'File size must be less than 50MB'], 400);
                }

                $scenarioUniqid = $scenario['uniqid'];
                $uploadDir = __DIR__ . '/../../media/' . $scenarioUniqid . '/files/';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0755, true);
                }

                // Remove any prior bundled-zip rows for this scenario (and their files)
                $priorZips = $db->fetchAll(
                    'SELECT id, file_path FROM scenario_files WHERE scenario_id = ? AND mime_type IN (?, ?)',
                    [$id, 'application/zip', 'application/x-zip-compressed']
                );
                foreach ($priorZips as $prior) {
                    $priorFull = __DIR__ . '/../../media/' . $prior['file_path'];
                    if (file_exists($priorFull)) {
                        unlink($priorFull);
                    }
                    $db->query('DELETE FROM scenario_files WHERE id = ?', [$prior['id']]);
                }

                $fileExtension = pathinfo($file['name'], PATHINFO_EXTENSION);
                $uniqueName = uniqid('scenario_', true) . '.' . $fileExtension;
                $uploadPath = $uploadDir . $uniqueName;

                if (!move_uploaded_file($file['tmp_name'], $uploadPath)) {
                    jsonResponse(['error' => 'Failed to upload file'], 500);
                }

                $relativePath = $scenarioUniqid . '/files/' . $uniqueName;
                $db->query(
                    'INSERT INTO scenario_files (scenario_id, name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?)',
                    [$id, 'Scenario Bundle', $relativePath, filesize($uploadPath), $mimeType]
                );
            }

            // Update scenario
            $sql = 'UPDATE scenarios SET title = ?, description = ?, data = ?, medias = ?, game_type = ?, scenario_type = ?, status = ?, updated_at = NOW() WHERE id = ?';
            $db->query($sql, [$title, $description, $data, $medias, $game_type, $scenario_type, $status, $id]);

            try {
                ScenarioHashes::recompute($db->getConnection(), $scenario['uniqid']);
            } catch (Exception $e) {
                Logger::log('scenarios', $method, 'recompute_hashes', $_SESSION['user_id'] ?? null, ['uniqid' => $scenario['uniqid']], ['error' => $e->getMessage()], 200);
            }

            jsonResponse([
                'success' => true,
                'scenario' => [
                    'id' => $id,
                    'title' => $title,
                    'description' => $description,
                    'data' => $data,
                    'medias' => $medias,
                    'game_type' => $game_type,
                    'scenario_type' => $scenario_type,
                    'status' => $status
                ],
                'message' => 'Scenario updated successfully'
            ]);
            break;

        case 'delete':
            requireAuth();

            if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'DELETE') {
                Logger::log('scenarios', $method, 'delete', $_SESSION['user_id'] ?? null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            $data = getRequestData();
            $id = $data['id'] ?? $_GET['id'] ?? null;

            if (!$id) {
                Logger::log('scenarios', $method, 'delete', $_SESSION['user_id'], [], ['error' => 'Missing ID'], 400);
                jsonResponse(['error' => 'Scenario ID is required'], 400);
            }

            // Get scenario to delete associated files
            $scenario = $db->fetch('SELECT uniqid FROM scenarios WHERE id = ?', [(int)$id]);
            if (!$scenario) {
                Logger::log('scenarios', $method, 'delete', $_SESSION['user_id'], ['id' => $id], ['error' => 'Not found'], 404);
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            // Unlink files registered in scenario_files, then drop their rows
            $registeredFiles = $db->fetchAll('SELECT id, file_path FROM scenario_files WHERE scenario_id = ?', [(int)$id]);
            foreach ($registeredFiles as $registered) {
                $registeredFull = __DIR__ . '/../../media/' . $registered['file_path'];
                if (file_exists($registeredFull)) {
                    unlink($registeredFull);
                }
            }
            $db->query('DELETE FROM scenario_files WHERE scenario_id = ?', [(int)$id]);

            // Delete media directory if exists (recursively, since /files/ subdir is now used)
            if ($scenario['uniqid']) {
                $mediaDir = __DIR__ . '/../../media/' . $scenario['uniqid'];
                if (is_dir($mediaDir)) {
                    $rrmdir = function ($dir) use (&$rrmdir) {
                        foreach (array_diff(scandir($dir), ['.', '..']) as $entry) {
                            $full = $dir . '/' . $entry;
                            is_dir($full) ? $rrmdir($full) : unlink($full);
                        }
                        rmdir($dir);
                    };
                    $rrmdir($mediaDir);
                }
            }

            // Delete scenario from database
            $db->query('DELETE FROM scenarios WHERE id = ?', [(int)$id]);

            Logger::log('scenarios', $method, 'delete', $_SESSION['user_id'], ['id' => $id], ['success' => true], 200);
            jsonResponse([
                'success' => true,
                'message' => 'Scenario deleted successfully'
            ]);
            break;

        case 'upload_media':
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                Logger::log('scenarios', $method, 'upload_media', null, [], ['error' => 'Method not allowed'], 405);
                jsonResponse(['error' => 'Method not allowed'], 405);
            }

            // Get required fields
            $uniqid = $_POST['uniqid'] ?? null;
            $email = $_POST['email'] ?? null;

            // Validate required fields
            if (!$uniqid || !$email) {
                Logger::log('scenarios', $method, 'upload_media', null, $_POST, ['error' => 'Missing required fields'], 400);
                jsonResponse(['error' => 'uniqid and email are required'], 400);
            }

            // Validate file upload
            if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                $errorMsg = isset($_FILES['file']) ? 'Upload error: ' . $_FILES['file']['error'] : 'No file uploaded';
                Logger::log('scenarios', $method, 'upload_media', null, $_POST, ['error' => $errorMsg], 400);
                jsonResponse(['error' => $errorMsg], 400);
            }

            $file = $_FILES['file'];

            // Verify scenario exists and belongs to user
            $scenario = $db->fetch(
                'SELECT s.id, s.uniqid, s.client_id, s.created_by,
                        c.email as client_email,
                        a.email as admin_email
                 FROM scenarios s
                 LEFT JOIN clients c ON s.client_id = c.id
                 LEFT JOIN admin_users a ON s.created_by = a.id
                 WHERE s.uniqid = ?',
                [$uniqid]
            );

            if (!$scenario) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid, 'email' => $email], ['error' => 'Scenario not found'], 404);
                jsonResponse(['error' => 'Scenario not found'], 404);
            }

            // Verify ownership - check if email matches scenario's client or creator, or user is an admin
            $isOwner = ($scenario['client_email'] === $email) || ($scenario['admin_email'] === $email);

            // Also check if the email exists in admin_users table (for any admin)
            $isAdmin = false;
            if (!$isOwner) {
                $adminCheck = $db->fetch('SELECT id FROM admin_users WHERE email = ?', [$email]);
                $isAdmin = ($adminCheck !== false);
            }

            if (!$isOwner && !$isAdmin) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid, 'email' => $email], ['error' => 'Unauthorized - email mismatch'], 403);
                jsonResponse(['error' => 'Unauthorized - scenario does not belong to this user'], 403);
            }

            // Validate file size (50MB max)
            if ($file['size'] > 50 * 1024 * 1024) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid], ['error' => 'File too large'], 400);
                jsonResponse(['error' => 'File size must be less than 50MB'], 400);
            }

            // Create media directory structure: /media/{uniqid}/
            $mediaBaseDir = __DIR__ . '/../../media/';

            // Ensure the media base exists and is writable before creating the
            // per-scenario subdir - on a fresh prod deploy media/ may be absent
            // (it's on the never-overwrite list), which otherwise fails confusingly.
            if (!is_dir($mediaBaseDir)) {
                if (!@mkdir($mediaBaseDir, 0775, true) && !is_dir($mediaBaseDir)) {
                    Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid], ['error' => 'Media base directory missing and could not be created', 'path' => $mediaBaseDir], 500);
                    jsonResponse(['error' => 'Media base directory is missing and could not be created. Create media/ at the web root, writable by the web server user.'], 500);
                }
            }
            if (!is_writable($mediaBaseDir)) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid], ['error' => 'Media base directory not writable', 'path' => $mediaBaseDir], 500);
                jsonResponse(['error' => 'Media base directory is not writable by the web server user.'], 500);
            }

            $scenarioMediaDir = $mediaBaseDir . $uniqid . '/';

            if (!is_dir($scenarioMediaDir)) {
                if (!mkdir($scenarioMediaDir, 0755, true) && !is_dir($scenarioMediaDir)) {
                    Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid], ['error' => 'Failed to create directory', 'path' => $scenarioMediaDir], 500);
                    jsonResponse(['error' => 'Failed to create media directory'], 500);
                }
            }

            // Sanitize filename
            $originalFilename = basename($file['name']);
            $originalFilename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $originalFilename);

            // Full path for the file
            $filePath = $scenarioMediaDir . $originalFilename;

            // Move uploaded file
            if (!move_uploaded_file($file['tmp_name'], $filePath)) {
                Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid], ['error' => 'Failed to move file'], 500);
                jsonResponse(['error' => 'Failed to save file'], 500);
            }

            // New/replaced media file → refresh content hashes.
            try {
                ScenarioHashes::recompute($db->getConnection(), $uniqid);
            } catch (Exception $e) {
                Logger::log('scenarios', $method, 'recompute_hashes', null, ['uniqid' => $uniqid], ['error' => $e->getMessage()], 200);
            }

            // Build response - return relative path; the frontend prefixes with VITE_MEDIA_BASE_URL.
            $relativePath = '/media/' . $uniqid . '/' . $originalFilename;
            $fullUrl = $relativePath;

            $responseData = [
                'success' => true,
                'data' => [
                    'name' => $originalFilename,
                    'path' => $relativePath,
                    'url' => $fullUrl
                ],
                'message' => 'File uploaded successfully'
            ];

            Logger::log('scenarios', $method, 'upload_media', null, ['uniqid' => $uniqid, 'email' => $email, 'filename' => $originalFilename], $responseData, 200, 'creator');
            jsonResponse($responseData, 200);
            break;

        default:
            Logger::log('scenarios', $method, $action ?: 'none', $_SESSION['user_id'] ?? null, [], ['error' => 'Invalid action'], 400);
            jsonResponse(['error' => 'Invalid action. Available actions: create, list, get, update, delete, upload_media'], 400);
    }
} catch (Exception $e) {
    Logger::log('scenarios', $method, $action ?? 'unknown', $_SESSION['user_id'] ?? null, [], ['error' => $e->getMessage()], 500);
    jsonResponse(['error' => 'Server error: ' . $e->getMessage()], 500);
}
