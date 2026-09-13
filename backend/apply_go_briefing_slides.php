<?php

// Applies the per-scenario BRIEFING migration (go_tutorial_slides.scenario_id).
// Idempotent - safe to re-run. CLI equivalent of pasting
// database/add_go_briefing_slides.sql into phpMyAdmin. Run BEFORE deploying
// go.php, which reads the new column on `load`. See project_taghunter_go (#67).

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying GO/Spot briefing-slides migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_go_briefing_slides.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n\ngo_tutorial_slides:\n";
    foreach ($db->fetchAll('DESCRIBE go_tutorial_slides') as $c) {
        echo "  - {$c['Field']} ({$c['Type']})\n";
    }
    $t = $db->fetch('SELECT COUNT(*) AS n FROM go_tutorial_slides WHERE scenario_id IS NULL');
    $b = $db->fetch('SELECT COUNT(*) AS n FROM go_tutorial_slides WHERE scenario_id IS NOT NULL');
    echo "  tutorial slides (global): " . (int)($t['n'] ?? 0) . "\n";
    echo "  briefing slides (per scenario): " . (int)($b['n'] ?? 0) . "\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
