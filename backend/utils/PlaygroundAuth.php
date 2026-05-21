<?php
// Shared bearer-auth helpers for playground endpoints (playground.php and
// launched_games.php). Slice 3 extracted these from playground.php so any new
// playground-facing PHP file can require_once this and get the same auth gate
// + auth_state-on-every-response wrapping.

require_once __DIR__ . '/TokenManager.php';
require_once __DIR__ . '/DeviceManager.php';
require_once __DIR__ . '/PlaygroundAuthState.php';

if (!function_exists('jsonResponse')) {
    function jsonResponse($data, $status = 200) {
        http_response_code($status);
        echo json_encode($data);
        exit;
    }
}

// Bearer-auth gate. Returns the client array or terminates with 401/403.
// Also bumps devices.last_seen_at on the linked device for grace-period tracking.
if (!function_exists('requirePlaygroundClient')) {
    function requirePlaygroundClient($db) {
        $token = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if (strpos($token, 'Bearer ') === 0) {
            $token = substr($token, 7);
        }

        if (empty($token)) {
            jsonResponse(['error' => 'Unauthorized - Bearer token required'], 401);
        }

        $tokenData = TokenManager::validateToken($db, $token);
        if (!$tokenData) {
            jsonResponse(['error' => 'Unauthorized - Invalid or expired token'], 401);
        }

        if ($tokenData['user_type'] !== 'client') {
            jsonResponse(['error' => 'Forbidden - Playground requires a client account'], 403);
        }

        if (!empty($tokenData['device_id'])) {
            DeviceManager::bumpLastSeen($db, (int)$tokenData['device_id']);
        }

        return [
            'id' => (int)$tokenData['user_id'],
            'email' => $tokenData['email'],
            'name' => $tokenData['name'],
            'license_type' => $tokenData['license_type'] ?? null,
            'billing_up_to_date' => $tokenData['billing_up_to_date'] ?? false,
            'avatar_url' => $tokenData['avatar_url'] ?? null,
            'device_id' => $tokenData['device_id'] ?? null,
        ];
    }
}

// Wrap a response payload with the current auth_state block. Every authenticated
// playground response carries this so the client can refresh its local cache and
// reset its "last_server_check_at" for the offline grace-period clock.
if (!function_exists('jsonResponseWithAuthState')) {
    // $deviceId is optional: when provided, auth_state.device is populated with the
    // user-given display_name + OS device_label for that device. Callers that don't
    // pass it still get auth_state.user + brand_logo_url, just no device block.
    function jsonResponseWithAuthState($db, $clientId, array $data, int $status = 200, ?int $deviceId = null): void {
        $authState = PlaygroundAuthState::build($db, $clientId, $deviceId);
        $data['auth_state'] = $authState;
        http_response_code($status);
        echo json_encode($data);
        exit;
    }
}
