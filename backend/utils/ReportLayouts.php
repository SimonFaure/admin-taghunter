<?php
// Shared helpers for the per-game-type mission-report PDF layouts (the "PDF
// editor" defaults). One row per game type, GLOBAL (admin-owned, not per
// client). Synced to playground via playground.php get_report_layouts, keyed by
// a single integer version bumped on any save. Per-scenario overrides live in
// the scenario's game_meta (report_layout) and travel via the normal scenario
// sync — they are NOT stored here.
//
// The default layouts below MUST stay in step with the playground's offline
// fallback (taghunter_playground/src/services/reportLayout.ts:defaultReportLayout)
// and the studio editor's seed. This PHP copy is the canonical seed that syncs.
//
// Mirrors RecoveryCodes.php / team_name_pools conventions.

class ReportLayouts {
    const GAME_TYPES = ['mystery', 'tracks', 'tagquest', 'clash'];
    const LAYOUT_VERSION = 1;
    const BASE_FONT = 'Times New Roman';

    // Stat field ids available per game type (used inside stat_grid blocks).
    const STAT_FIELDS = [
        'mystery'  => ['rate', 'success', 'fail', 'absent'],
        'tracks'   => ['rate', 'correct', 'wrong', 'missing'],
        'tagquest' => ['quests', 'points', 'level', 'combos'],
        'clash'    => ['territories', 'combos'],
    ];

    public static function ensureTables($db): void {
        $db->query('
            CREATE TABLE IF NOT EXISTS report_layouts (
                game_type VARCHAR(32) PRIMARY KEY,
                layout_json LONGTEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
        $db->query('
            CREATE TABLE IF NOT EXISTS report_layouts_meta (
                id INT PRIMARY KEY,
                current_version INT NOT NULL DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
        $db->query('INSERT IGNORE INTO report_layouts_meta (id, current_version) VALUES (1, 0)');
    }

    public static function normalizeType(string $raw): string {
        $v = strtolower($raw);
        return in_array($v, self::GAME_TYPES, true) ? $v : 'tagquest';
    }

    // The built-in default layout for a game type — mirrors the attached mystery
    // example and swaps in each type's native stat fields.
    public static function defaultLayout(string $gameType): array {
        $type = self::normalizeType($gameType);
        $fields = self::STAT_FIELDS[$type];
        $firstRow = array_slice($fields, 0, 2);
        $restRow = array_slice($fields, 2);

        // Refined-classic structure: centered header, a divider rule, the team
        // identity, then the stats inside a bordered frame. Mirrors the TS
        // defaults in reportLayout.ts / reportLayoutDefaults.ts.
        $statFrame = function (array $children): array {
            return ['type' => 'frame', 'show' => true, 'bordered' => true, 'borderColor' => '#333333', 'padding' => 12, 'radius' => 6, 'children' => $children];
        };

        $blocks = [
            ['type' => 'logo', 'show' => true, 'align' => 'center', 'logoSize' => 110],
            ['type' => 'game_title', 'show' => true, 'size' => 30, 'align' => 'center', 'bold' => false],
            ['type' => 'pdf_title', 'show' => true, 'size' => 18, 'align' => 'center', 'bold' => false],
            ['type' => 'divider', 'show' => true, 'thickness' => 1, 'width' => 70, 'color' => '#cccccc'],
            ['type' => 'team_name', 'show' => true, 'size' => 22, 'align' => 'center', 'bold' => true],
            ['type' => 'date', 'show' => true, 'size' => 18, 'align' => 'center', 'bold' => true],
        ];
        // Mystery, tagquest and clash print the team's elapsed time; tracks omits it.
        if ($type !== 'tracks') {
            $blocks[] = ['type' => 'duration', 'show' => true, 'size' => 16, 'align' => 'center', 'bold' => true];
        }
        if ($type === 'tracks' || $type === 'mystery') {
            $grids = [['type' => 'stat_grid', 'show' => true, 'fields' => $firstRow, 'size' => 16, 'align' => 'center']];
            if (count($restRow)) {
                $grids[] = ['type' => 'stat_grid', 'show' => true, 'fields' => $restRow, 'size' => 16, 'align' => 'center'];
            }
            $blocks[] = $statFrame($grids);
        } else {
            $blocks[] = $statFrame([['type' => 'stat_grid', 'show' => true, 'fields' => $fields, 'size' => 16, 'align' => 'center']]);
        }

        return [
            'version' => self::LAYOUT_VERSION,
            'font' => self::BASE_FONT,
            'background' => ['mode' => 'none'],
            'blocks' => $blocks,
            // Per-game-type default report texts. Blank by default; admins set
            // them in the studio "Report layouts" page. Scenarios override via
            // game_meta.pdf_title / game_meta.team_title.
            'pdfTitle' => '',
            'teamTitle' => '',
        ];
    }

    public static function currentVersion($db): int {
        $row = $db->fetch('SELECT current_version FROM report_layouts_meta WHERE id = 1');
        return (int)($row['current_version'] ?? 0);
    }

    // Insert a default row for any game type that has none. Idempotent. Does NOT
    // bump the version (seeding is invisible to clients — defaults == fallback).
    public static function ensureSeeded($db): void {
        self::ensureTables($db);
        foreach (self::GAME_TYPES as $type) {
            $existing = $db->fetch('SELECT game_type FROM report_layouts WHERE game_type = ?', [$type]);
            if (!$existing) {
                $db->query(
                    'INSERT INTO report_layouts (game_type, layout_json) VALUES (?, ?)',
                    [$type, json_encode(self::defaultLayout($type))]
                );
            }
        }
    }

    // game_type => layout (decoded). Seeds defaults first so all 4 are present.
    public static function getAll($db): array {
        self::ensureSeeded($db);
        $rows = $db->fetchAll('SELECT game_type, layout_json FROM report_layouts');
        $out = [];
        foreach ($rows as $r) {
            $decoded = json_decode($r['layout_json'], true);
            $out[$r['game_type']] = $decoded ?: self::defaultLayout($r['game_type']);
        }
        return $out;
    }

    // Upsert one game type's layout and bump the global version.
    public static function save($db, string $gameType, array $layout): int {
        self::ensureTables($db);
        $type = self::normalizeType($gameType);
        $db->query(
            'INSERT INTO report_layouts (game_type, layout_json) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE layout_json = VALUES(layout_json), updated_at = NOW()',
            [$type, json_encode($layout)]
        );
        $db->query('UPDATE report_layouts_meta SET current_version = current_version + 1, updated_at = NOW() WHERE id = 1');
        return self::currentVersion($db);
    }

    // Reset one game type back to its built-in default (and bump version).
    public static function resetToDefault($db, string $gameType): array {
        $type = self::normalizeType($gameType);
        $layout = self::defaultLayout($type);
        self::save($db, $type, $layout);
        return $layout;
    }
}
