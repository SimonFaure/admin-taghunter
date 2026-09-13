<?php

// Applies database/backfill_adaptable_spot.sql: ticks `game_meta.adaptable_spot`
// on every scenario that is already granted as Spot but predates that flag.
//
// RUN THIS BEFORE deploying go.php. The new `load` gate checks the app's own
// eligibility flag (Spot -> adaptable_spot, GO -> adaptable_go) instead of
// checking adaptable_go for both; without the backfill, a scenario granted as
// Spot before an admin re-opened it in the editor would start refusing with
// `not_spot`.
//
// Idempotent + guarded - only fills the key where it is ABSENT, so an explicit
// `adaptable_spot: false` (the admin unticked it) is never overwritten and a
// re-run is a no-op. See project_taghunter_spot / project_drop_to_spot_rename.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    $before = $db->fetch(
        "SELECT COUNT(*) c FROM scenarios s
          WHERE EXISTS (SELECT 1 FROM client_scenarios cs
                         WHERE cs.scenario_id = s.id AND cs.mode IN ('spot', 'drop'))"
    );
    echo "Scenarios granted as Spot: " . (int)($before['c'] ?? 0) . "\n";

    echo "Applying adaptable_spot backfill (idempotent)...\n";
    $pdo->exec(file_get_contents(__DIR__ . '/database/backfill_adaptable_spot.sql'));
    echo "Backfill applied successfully!\n\n";

    $rows = $db->fetchAll(
        "SELECT s.id, s.title,
                JSON_EXTRACT(s.data, '\$.game_meta.adaptable_go')   AS go_flag,
                JSON_EXTRACT(s.data, '\$.game_meta.adaptable_spot') AS spot_flag
           FROM scenarios s
          WHERE EXISTS (SELECT 1 FROM client_scenarios cs
                         WHERE cs.scenario_id = s.id AND cs.mode IN ('spot', 'drop'))"
    );
    foreach ($rows as $r) {
        echo "  #{$r['id']} {$r['title']}: adaptable_go="
            . var_export($r['go_flag'], true) . " adaptable_spot="
            . var_export($r['spot_flag'], true) . "\n";
    }

    $stillBlocked = array_filter($rows, fn($r) => $r['spot_flag'] !== 'true');
    if ($stillBlocked) {
        echo "\nWARNING: " . count($stillBlocked) . " granted scenario(s) still lack adaptable_spot\n"
           . "(explicitly unticked in the editor, or game_meta is missing). They will refuse\n"
           . "with `not_spot` until an admin ticks \"Adaptable a Tag Hunter Spot\".\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
