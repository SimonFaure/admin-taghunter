<?php

// Applies the "Players Instructions" styled-slide migration: go_tutorial_slides
// gains its styling columns (font / colour / size / placement / scrim /
// background), `filename` becomes nullable, legacy slides are auto-converted and
// flagged for review, and go_app_settings appears for the per-app carousel
// heading.
//
// Idempotent - safe to re-run; the legacy back-fill only fires on the run that
// actually adds the columns. CLI equivalent of pasting
// database/add_go_slide_styling.sql into phpMyAdmin. Run BEFORE deploying
// go.php, which reads the new columns on `load`.
//
// See memory project_go_spot_players_instructions_carousel.

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying GO/Spot Players-Instructions slide-styling migration (idempotent)...\n";

    $sql = file_get_contents(__DIR__ . '/database/add_go_slide_styling.sql');
    $pdo->exec($sql);

    echo "Migration applied successfully!\n\ngo_tutorial_slides:\n";
    foreach ($db->fetchAll('DESCRIBE go_tutorial_slides') as $c) {
        echo "  - {$c['Field']} ({$c['Type']})\n";
    }

    $review = $db->fetch('SELECT COUNT(*) AS n FROM go_tutorial_slides WHERE needs_review = 1');
    $colour = $db->fetch('SELECT COUNT(*) AS n FROM go_tutorial_slides WHERE filename IS NULL');
    echo "\n  slides converted from image+caption (flagged for review): " . (int)($review['n'] ?? 0) . "\n";
    echo "  colour-background slides (no image): " . (int)($colour['n'] ?? 0) . "\n";

    echo "\ngo_app_settings:\n";
    foreach ($db->fetchAll('SELECT app, instructions_title FROM go_app_settings ORDER BY app') as $r) {
        echo "  - {$r['app']}: " . ($r['instructions_title'] ?: '(PWA default heading)') . "\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
