<?php

class PlaygroundAuthState {
    public static function build(object $db, int $clientId, ?int $deviceId = null): ?array {
        $client = $db->fetch(
            'SELECT id, email, name, license_type, billing_up_to_date,
                    avatar_url, company_logo_url, company_logo_uses_avatar,
                    max_devices, offline_grace_days, language, update_channel
             FROM clients WHERE id = ?',
            [$clientId]
        );

        if (!$client) {
            return null;
        }

        // App-update channel resolution: a device override wins, else the client
        // value, else 'stable'. Computed here because this is the one place that
        // knows BOTH the client and the device; the resolved value travels in the
        // auth_state and is what the playground feeds the update endpoints.
        // Design: project_client_tester_update_channel.
        $resolvedChannel = $client['update_channel'] ?: 'stable';

        // The toggle is non-destructive: even if a logo is uploaded, company_logo_uses_avatar=1
        // means the avatar is the active brand image. Both rules collapse to the avatar when
        // there is no uploaded logo.
        $useAvatar = empty($client['company_logo_url']) || (int)$client['company_logo_uses_avatar'] === 1;
        $brandLogoUrl = $useAvatar ? ($client['avatar_url'] ?? null) : $client['company_logo_url'];

        $state = [
            'user' => [
                'client_id' => (int)$client['id'],
                'email' => $client['email'],
                'name' => $client['name'],
                'avatar_url' => $client['avatar_url'],
                'license_type' => $client['license_type'],
                'billing_up_to_date' => (bool)$client['billing_up_to_date'],
                'language' => $client['language'] ?? 'fr',
            ],
            'brand_logo_url' => $brandLogoUrl,
            'max_devices' => (int)$client['max_devices'],
            'offline_grace_days' => (int)$client['offline_grace_days'],
            'server_time' => date('c'),
        ];

        if ($deviceId !== null) {
            $device = $db->fetch(
                'SELECT id, display_name, device_label, update_channel FROM devices WHERE id = ?',
                [$deviceId]
            );
            if ($device) {
                $state['device'] = [
                    'id' => (int)$device['id'],
                    'display_name' => $device['display_name'] ?? null,
                    'device_label' => $device['device_label'] ?? null,
                ];
                // A non-empty device override beats the client channel.
                if (!empty($device['update_channel'])) {
                    $resolvedChannel = $device['update_channel'];
                }
            }
        }

        $state['update_channel'] = in_array($resolvedChannel, ['stable', 'test'], true)
            ? $resolvedChannel
            : 'stable';

        return $state;
    }
}
