<?php

class PlaygroundAuthState {
    public static function build(object $db, int $clientId, ?int $deviceId = null): ?array {
        $client = $db->fetch(
            'SELECT id, email, name, license_type, billing_up_to_date,
                    avatar_url, company_logo_url, company_logo_uses_avatar,
                    max_devices, offline_grace_days
             FROM clients WHERE id = ?',
            [$clientId]
        );

        if (!$client) {
            return null;
        }

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
            ],
            'brand_logo_url' => $brandLogoUrl,
            'max_devices' => (int)$client['max_devices'],
            'offline_grace_days' => (int)$client['offline_grace_days'],
            'server_time' => date('c'),
        ];

        if ($deviceId !== null) {
            $device = $db->fetch(
                'SELECT id, display_name, device_label FROM devices WHERE id = ?',
                [$deviceId]
            );
            if ($device) {
                $state['device'] = [
                    'id' => (int)$device['id'],
                    'display_name' => $device['display_name'] ?? null,
                    'device_label' => $device['device_label'] ?? null,
                ];
            }
        }

        return $state;
    }
}
