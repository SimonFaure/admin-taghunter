<?php

// Applies the tutorial-subtitles versioning migration: adds
// `tutorial_subtitles_version` to `game_types` and `client_game_type_overrides`
// so a subtitle edit no longer forces devices to re-download the video.
//
// Idempotent - safe to re-run. CLI equivalent of pasting
// database/add_tutorial_subtitles_version.sql into phpMyAdmin. RUN THIS BEFORE
// deploying the PHP that reads the new column (playground sync manifest).

require_once __DIR__ . '/database/Database.php';

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Applying tutorial-subtitles versioning migration (idempotent)...\n";
    foreach (['game_types', 'client_game_type_overrides'] as $t) {
        $col = $db->fetch(
            "SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'tutorial_subtitles_version'",
            [$t]
        );
        if ($col) {
            echo "$t.tutorial_subtitles_version: already present ({$col['t']})\n";
            continue;
        }
        $pdo->exec("ALTER TABLE $t ADD COLUMN tutorial_subtitles_version INT NOT NULL DEFAULT 0");
        echo "$t.tutorial_subtitles_version: added\n";
    }
    echo "Done.\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}
