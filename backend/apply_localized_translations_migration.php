<?php

/**
 * Stage 3 (D5) one-shot migration: rewrites every scenarios.data row from the
 * legacy `translations[lang] = {full copy}` envelope into per-field
 * `Localized<string>` maps inline in `game_meta`. After this runs:
 *
 *   data = { game_meta: {title:{fr,en}, levels:{1:{name:{fr,en},...}}}, default_language, available_languages }
 *
 * Idempotent - already-migrated rows pass through unchanged.
 *
 * Usage:
 *   curl http://studio.taghunter.test/backend/apply_localized_translations_migration.php
 *   (or browse to the URL; or run via PHP CLI)
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/database/Database.php';
require_once __DIR__ . '/utils/LocalizedCompat.php';

header('Content-Type: application/json');

try {
    $db = Database::getInstance();

    // `default_language` lives inside the JSON data column, not as a row column.
    $rows = $db->fetchAll('SELECT id, uniqid, data FROM scenarios');

    $stats = [
        'total' => count($rows),
        'migrated' => 0,
        'already_new' => 0,
        'skipped_empty' => 0,
        'errors' => [],
    ];

    foreach ($rows as $row) {
        try {
            $rawData = $row['data'];
            if ($rawData === null || $rawData === '') {
                $stats['skipped_empty']++;
                continue;
            }

            $parsed = json_decode($rawData, true);
            if (!is_array($parsed)) {
                $stats['skipped_empty']++;
                continue;
            }

            if (!LocalizedCompat::isLegacyShape($parsed)) {
                $stats['already_new']++;
                continue;
            }

            $defaultLang = $parsed['default_language'] ?? 'fr';
            $migrated = LocalizedCompat::toNewShape($parsed, $defaultLang);

            $db->execute(
                'UPDATE scenarios SET data = ? WHERE id = ?',
                [json_encode($migrated, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $row['id']]
            );
            $stats['migrated']++;
        } catch (Throwable $rowErr) {
            $stats['errors'][] = [
                'id' => $row['id'] ?? null,
                'uniqid' => $row['uniqid'] ?? null,
                'message' => $rowErr->getMessage(),
            ];
        }
    }

    echo json_encode([
        'success' => true,
        'message' => sprintf(
            '%d rows: %d migrated, %d already new, %d skipped (empty), %d errors',
            $stats['total'],
            $stats['migrated'],
            $stats['already_new'],
            $stats['skipped_empty'],
            count($stats['errors'])
        ),
        'stats' => $stats,
    ], JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage(),
    ]);
}
