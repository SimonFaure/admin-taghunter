<?php
/**
 * Global switches for playground releases (table playground_release_settings,
 * migration database/add_playground_release_settings.sql).
 */
class PlaygroundReleaseSettings {
    const ANDROID_VISIBLE = 'android_visible_to_clients';

    /** Whether licensees see the Android release. Fail-closed: no table/row = hidden. */
    public static function androidVisibleToClients(Database $db): bool {
        try {
            $row = $db->fetch(
                'SELECT value FROM playground_release_settings WHERE name = ?',
                [self::ANDROID_VISIBLE]
            );
            return $row && $row['value'] === '1';
        } catch (Throwable $e) {
            return false;
        }
    }

    public static function setAndroidVisibleToClients(Database $db, bool $visible, ?int $userId): void {
        $db->query(
            'INSERT INTO playground_release_settings (name, value, updated_by) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)',
            [self::ANDROID_VISIBLE, $visible ? '1' : '0', $userId]
        );
    }
}
