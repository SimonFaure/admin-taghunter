<?php
// One-shot "apply every migration" runner for studio.
//
// WHY THIS IS SAFE TO RE-RUN:
//   Every backend/database/*.sql migration is idempotent — CREATE TABLE IF NOT
//   EXISTS, INFORMATION_SCHEMA-gated ALTERs, or INSERT ... ON DUPLICATE KEY — so
//   an already-applied migration is a no-op. Errors are caught per-statement and
//   reported, never fatal, so a "column already exists" on a non-guarded ALTER
//   just gets logged and the run continues.
//
//   The ONLY destructive migrations are the two scenarios-refactor column drops
//   (drop_game_meta / drop_media_url). They are NOT run unless you pass
//   ?drops=1, because DROP COLUMN is irreversible. Run them only once you've
//   confirmed those columns are empty in prod (the refactor verified empty on dev).
//
// USAGE (browser, after fixing backend/config/database.php prod credentials):
//   https://YOUR-STUDIO-DOMAIN/backend/apply_all_migrations.php?token=YOUR_SECRET
//   add &drops=1   to also run the destructive scenarios column drops
//   add &seeds=1   to also run the idempotent PHP seeds (team names + recovery codes)
//
// USAGE (CLI on the server):
//   php backend/apply_all_migrations.php --token=YOUR_SECRET [--drops] [--seeds]
//
// DELETE THIS FILE after the deploy — it executes arbitrary migrations.

header('Content-Type: text/plain; charset=utf-8');

// --- crude auth so this can't be hit anonymously on prod -------------------
$REQUIRED_TOKEN = 'CHANGE_ME_BEFORE_DEPLOY';

$isCli   = (php_sapi_name() === 'cli');
$token   = $isCli ? null : ($_GET['token']   ?? '');
$runDrops = $isCli ? false : isset($_GET['drops']);
$runSeeds = $isCli ? false : isset($_GET['seeds']);

if ($isCli) {
    foreach ($argv as $arg) {
        if (strpos($arg, '--token=') === 0) $token = substr($arg, 8);
        if ($arg === '--drops') $runDrops = true;
        if ($arg === '--seeds') $runSeeds = true;
    }
}

if ($token !== $REQUIRED_TOKEN || $REQUIRED_TOKEN === 'CHANGE_ME_BEFORE_DEPLOY') {
    http_response_code(403);
    echo "Forbidden. Edit \$REQUIRED_TOKEN in this file and pass ?token=... (and remove the placeholder).\n";
    exit;
}

require_once __DIR__ . '/database/Database.php';

$dir = __DIR__ . '/database';

// Run the base schema first (core tables other migrations FK to), then every
// other *.sql in alphabetical order. The two destructive drops go last and only
// when explicitly requested.
$drops = ['drop_game_meta_from_scenarios.sql', 'drop_media_url_from_scenarios.sql'];

$all = array_map('basename', glob($dir . '/*.sql'));
sort($all);

$ordered = array_merge(
    ['migration.sql'],
    array_values(array_filter($all, fn($f) => $f !== 'migration.sql' && !in_array($f, $drops, true)))
);
if ($runDrops) {
    $ordered = array_merge($ordered, $drops);
} else {
    echo "NOTE: skipping destructive column drops (" . implode(', ', $drops) . "). Pass drops=1 to run them.\n\n";
}

$db = Database::getInstance();

$okStmts = 0;
$errStmts = 0;
$fileCount = 0;

foreach ($ordered as $file) {
    $path = $dir . '/' . $file;
    if (!is_file($path)) { echo "SKIP (missing): {$file}\n"; continue; }
    $fileCount++;
    echo "=== {$file} ===\n";

    $sql = file_get_contents($path);

    // Strip full-line `-- ...` comments BEFORE splitting on `;`. Comment prose
    // frequently contains semicolons (e.g. "if present; otherwise INSERT") — if
    // we split first and strip per-chunk, that `;` cuts the comment in half and
    // the trailing fragment (no longer starting with `--`) gets glued onto the
    // next real statement, corrupting it. Strip first, then split.
    $codeLines = array_filter(
        preg_split('/\r?\n/', $sql),
        fn($line) => !preg_match('/^\s*--/', $line)
    );
    $sqlNoComments = implode("\n", $codeLines);
    $statements = array_filter(array_map('trim', explode(';', $sqlNoComments)));

    foreach ($statements as $code) {
        if ($code === '') continue;

        try {
            $db->query($code);
            $okStmts++;
        } catch (Exception $e) {
            $errStmts++;
            $msg = $e->getMessage();
            // "already exists" / "Duplicate column" are expected when re-applying — flag, don't alarm
            echo "  ! " . substr(preg_replace('/\s+/', ' ', $msg), 0, 200) . "\n";
        }
    }
}

echo "\n--- migrations done: {$fileCount} files, {$okStmts} statements ok, {$errStmts} errors (errors are usually 'already applied') ---\n";

if ($runSeeds) {
    echo "\n=== seeds ===\n";
    foreach (['team_name_pools_seed.php', 'recovery_codes_seed.php'] as $seed) {
        echo "--- {$seed} ---\n";
        try {
            require $dir . '/' . $seed; // both are idempotent (skip existing)
        } catch (Throwable $e) {
            echo "  ! seed error: " . $e->getMessage() . "\n";
        }
    }
} else {
    echo "\nNOTE: skipping PHP seeds (team names + recovery codes). Pass seeds=1 to run them (they are idempotent).\n";
}

echo "\nALL DONE. Delete this file from the server now.\n";
