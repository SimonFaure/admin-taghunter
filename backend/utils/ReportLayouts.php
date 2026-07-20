<?php
// Shared helpers for the per-game-type mission-report PDF layouts (the "PDF
// editor" defaults). One row per game type, GLOBAL (admin-owned, not per
// client). Synced to playground via playground.php get_report_layouts, keyed by
// a single integer version bumped on any save. Per-scenario overrides live in
// the scenario's game_meta (report_layout) and travel via the normal scenario
// sync - they are NOT stored here.
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
                current_version DECIMAL(10,2) NOT NULL DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
        $db->query('INSERT IGNORE INTO report_layouts_meta (id, current_version) VALUES (1, 0)');
        // Per-client layout overrides (client-portal "Report layouts" page). A row
        // here wins over the global row for that client's playgrounds; no row ⇒
        // the client inherits the admin default.
        $db->query('
            CREATE TABLE IF NOT EXISTS client_report_layouts (
                client_id INT NOT NULL,
                game_type VARCHAR(32) NOT NULL,
                layout_json LONGTEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (client_id, game_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
        $db->query('
            CREATE TABLE IF NOT EXISTS client_report_layouts_meta (
                client_id INT PRIMARY KEY,
                current_version DECIMAL(10,2) NOT NULL DEFAULT 0,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
        // One-time migration: both version columns started life as INT (bumped
        // by 1); they are DECIMAL now (bumped by 0.1, cards-style). Existing
        // integer values keep their magnitude - monotonicity is preserved.
        $col = $db->fetch(
            "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'report_layouts_meta' AND COLUMN_NAME = 'current_version'"
        );
        if ($col && strtolower($col['DATA_TYPE']) === 'int') {
            $db->query('ALTER TABLE report_layouts_meta MODIFY current_version DECIMAL(10,2) NOT NULL DEFAULT 0');
            $db->query('ALTER TABLE client_report_layouts_meta MODIFY current_version DECIMAL(10,2) NOT NULL DEFAULT 0');
        }
        // Studio-defined default print format (paper + orientation). Global,
        // admin-owned; a playground device's local Settings → Printing choice
        // always wins - this only seeds fresh installs.
        $db->query('
            CREATE TABLE IF NOT EXISTS report_layouts_print_format (
                id INT PRIMARY KEY,
                format_json TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
        // Per-client print format override (client portal). Wins over the admin
        // default for that client's playgrounds; a device's local choice still
        // wins over both.
        $db->query('
            CREATE TABLE IF NOT EXISTS client_report_print_format (
                client_id INT PRIMARY KEY,
                format_json TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');
    }

    public static function normalizeType(string $raw): string {
        $v = strtolower($raw);
        return in_array($v, self::GAME_TYPES, true) ? $v : 'tagquest';
    }

    // The built-in default layout for a game type - mirrors the attached mystery
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

    // Versions are DECIMAL(10,2) bumped by 0.1 per save (cards-style). Always
    // round after float casts so JSON emits clean numbers (0.3, not 0.30000004).
    public static function currentVersion($db): float {
        $row = $db->fetch('SELECT current_version FROM report_layouts_meta WHERE id = 1');
        return round((float)($row['current_version'] ?? 0), 2);
    }

    // Insert a default row for any game type that has none. Idempotent. Does NOT
    // bump the version (seeding is invisible to clients - defaults == fallback).
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
    public static function save($db, string $gameType, array $layout): float {
        self::ensureTables($db);
        $type = self::normalizeType($gameType);
        $db->query(
            'INSERT INTO report_layouts (game_type, layout_json) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE layout_json = VALUES(layout_json), updated_at = NOW()',
            [$type, json_encode($layout)]
        );
        $db->query('UPDATE report_layouts_meta SET current_version = current_version + 0.1, updated_at = NOW() WHERE id = 1');
        return self::currentVersion($db);
    }

    // Reset one game type back to its built-in default (and bump version).
    public static function resetToDefault($db, string $gameType): array {
        $type = self::normalizeType($gameType);
        $layout = self::defaultLayout($type);
        self::save($db, $type, $layout);
        return $layout;
    }

    // ───────────────────── default print format (admin, global) ─────────────────

    // Mirrors the playground's printPrefsStore paper presets.
    const PAPER_PRESETS = ['ticket_100x150', 'a4', 'a5', 'a6', 'custom'];

    // Validate/normalize a {paper, customMm{width,height}, orientation} payload.
    // Returns null when the shape is unusable.
    public static function normalizePrintFormat($raw): ?array {
        if (!is_array($raw)) return null;
        $paper = $raw['paper'] ?? '';
        if (!in_array($paper, self::PAPER_PRESETS, true)) return null;
        $w = (float)($raw['customMm']['width'] ?? 0);
        $h = (float)($raw['customMm']['height'] ?? 0);
        if ($paper === 'custom' && ($w <= 0 || $h <= 0)) return null;
        return [
            'paper' => $paper,
            'customMm' => ['width' => $w > 0 ? $w : 100, 'height' => $h > 0 ? $h : 150],
            'orientation' => (($raw['orientation'] ?? '') === 'landscape') ? 'landscape' : 'portrait',
        ];
    }

    // The studio-defined default print format, or null when the admin never set
    // one (playground then keeps its built-in 100×150 ticket default).
    public static function getPrintFormat($db): ?array {
        self::ensureTables($db);
        $row = $db->fetch('SELECT format_json FROM report_layouts_print_format WHERE id = 1');
        if (!$row) return null;
        return self::normalizePrintFormat(json_decode($row['format_json'], true));
    }

    // Save the default print format and bump the global version so playgrounds
    // re-pull get_report_layouts. Returns the new version.
    public static function savePrintFormat($db, array $format): float {
        self::ensureTables($db);
        $db->query(
            'INSERT INTO report_layouts_print_format (id, format_json) VALUES (1, ?)
             ON DUPLICATE KEY UPDATE format_json = VALUES(format_json), updated_at = NOW()',
            [json_encode($format)]
        );
        $db->query('UPDATE report_layouts_meta SET current_version = current_version + 0.1, updated_at = NOW() WHERE id = 1');
        return self::currentVersion($db);
    }

    // The client's own print format, or null when the client never set one
    // (their playgrounds then use the admin default).
    public static function getClientPrintFormat($db, int $clientId): ?array {
        self::ensureTables($db);
        $row = $db->fetch('SELECT format_json FROM client_report_print_format WHERE client_id = ?', [$clientId]);
        if (!$row) return null;
        return self::normalizePrintFormat(json_decode($row['format_json'], true));
    }

    // Save (or clear, with $format === null) the client's print format and bump
    // the client version so its playgrounds re-pull.
    public static function saveClientPrintFormat($db, int $clientId, ?array $format): void {
        self::ensureTables($db);
        if ($format === null) {
            $db->query('DELETE FROM client_report_print_format WHERE client_id = ?', [$clientId]);
        } else {
            $db->query(
                'INSERT INTO client_report_print_format (client_id, format_json) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE format_json = VALUES(format_json), updated_at = NOW()',
                [$clientId, json_encode($format)]
            );
        }
        self::bumpClientVersion($db, $clientId);
    }

    // The print format a client's playgrounds should default to: the client's
    // own when set, else the admin default, else null (device built-in wins).
    public static function effectivePrintFormat($db, int $clientId): ?array {
        return self::getClientPrintFormat($db, $clientId) ?? self::getPrintFormat($db);
    }

    // ───────────────────── per-client layout overrides ──────────────────────────

    public static function clientVersion($db, int $clientId): float {
        $row = $db->fetch('SELECT current_version FROM client_report_layouts_meta WHERE client_id = ?', [$clientId]);
        return round((float)($row['current_version'] ?? 0), 2);
    }

    // Version advertised to a client's playgrounds. Admin and client versions
    // both only ever increase, so their sum is monotonic - a bump on either
    // side makes devices re-pull the merged set.
    public static function combinedVersion($db, int $clientId): float {
        return round(self::currentVersion($db) + self::clientVersion($db, $clientId), 2);
    }

    private static function bumpClientVersion($db, int $clientId): float {
        $db->query(
            'INSERT INTO client_report_layouts_meta (client_id, current_version) VALUES (?, 0.1)
             ON DUPLICATE KEY UPDATE current_version = current_version + 0.1, updated_at = NOW()',
            [$clientId]
        );
        return self::clientVersion($db, $clientId);
    }

    // game_type => layout with the client's overrides layered over the global
    // defaults. Also reports which types are customized by this client.
    public static function getAllForClient($db, int $clientId): array {
        $layouts = self::getAll($db); // seeds + global set
        $customized = array_fill_keys(self::GAME_TYPES, false);
        $rows = $db->fetchAll('SELECT game_type, layout_json FROM client_report_layouts WHERE client_id = ?', [$clientId]);
        foreach ($rows as $r) {
            $decoded = json_decode($r['layout_json'], true);
            if ($decoded && isset($layouts[$r['game_type']])) {
                $layouts[$r['game_type']] = $decoded;
                $customized[$r['game_type']] = true;
            }
        }
        return ['layouts' => $layouts, 'customized' => $customized];
    }

    // Upsert one game type's client override and bump the client version.
    public static function saveClient($db, int $clientId, string $gameType, array $layout): void {
        self::ensureTables($db);
        $type = self::normalizeType($gameType);
        $db->query(
            'INSERT INTO client_report_layouts (client_id, game_type, layout_json) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE layout_json = VALUES(layout_json), updated_at = NOW()',
            [$clientId, $type, json_encode($layout)]
        );
        self::bumpClientVersion($db, $clientId);
    }

    // Drop the client's override so the game type falls back to the global
    // default. Returns that default. Bumps even when no row existed (harmless).
    public static function resetClient($db, int $clientId, string $gameType): array {
        self::ensureTables($db);
        $type = self::normalizeType($gameType);
        $db->query('DELETE FROM client_report_layouts WHERE client_id = ? AND game_type = ?', [$clientId, $type]);
        self::bumpClientVersion($db, $clientId);
        $all = self::getAll($db);
        return $all[$type] ?? self::defaultLayout($type);
    }
}
