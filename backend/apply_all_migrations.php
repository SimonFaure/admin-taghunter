<?php
// One-shot "apply every migration" runner for studio.
//
// WHY THIS IS SAFE TO RE-RUN:
//   Every backend/database/*.sql migration is idempotent - CREATE TABLE IF NOT
//   EXISTS, INFORMATION_SCHEMA-gated ALTERs, or INSERT ... ON DUPLICATE KEY - so
//   an already-applied migration is a no-op. Errors are caught per-statement and
//   reported, never fatal, so a "column already exists" on a non-guarded ALTER
//   just gets logged and the run continues.
//
// TWO EXECUTION MODES (auto-detected per file):
//   - Guarded files that emulate MySQL-8.4 "ADD COLUMN IF NOT EXISTS" with
//     `SET @s := IF(...); PREPARE s FROM @s; EXECUTE s; DEALLOCATE PREPARE s;`
//     MUST run as ONE batch on a single connection: the @vars are session-scoped
//     and PDO's prepared-statement protocol (what query() uses) cannot run
//     PREPARE/EXECUTE (MySQL error 1295). Any file containing PREPARE is run whole
//     via PDO::exec(). Splitting these on ';' silently no-ops the guarded ALTERs.
//   - Every other file is split on ';' and run statement-by-statement so a plain
//     re-run "Duplicate column" stays a logged warning, not a fatal abort.
//
//   The ONLY destructive migrations are the two scenarios-refactor column drops
//   (drop_game_meta / drop_media_url). They are NOT run unless you pass
//   ?drops=1, because DROP COLUMN is irreversible. Run them only once you've
//   confirmed those columns are empty in prod (the refactor verified empty on dev).
//
// USAGE (browser, after fixing backend/config/database.php prod credentials):
//   https://YOUR-STUDIO-DOMAIN/backend/apply_all_migrations.php?token=YOUR_SECRET
// https://studio.taghunter.fr/backend/apply_all_migrations.php?token=d2ef2a1198bde98b96746ef32e4ff5659e58b396a872cb2f&seeds=1
//   add &drops=1     to also run the destructive scenarios column drops
//   add &seeds=1     to also run the idempotent PHP seeds (team names + recovery codes)
//   add &backfills=1 to also run the idempotent PHP data backfills (scenario
//                    hashes + audience/difficulty/univers) - run AFTER the SQL
//
// USAGE (CLI on the server):
//   php backend/apply_all_migrations.php --token=YOUR_SECRET [--drops] [--seeds] [--backfills]
//
// DELETE THIS FILE after the deploy - it executes arbitrary migrations.

header('Content-Type: text/plain; charset=utf-8');

// --- crude auth so this can't be hit anonymously on prod -------------------
$REQUIRED_TOKEN = 'd2ef2a1198bde98b96746ef32e4ff5659e58b396a872cb2f';

$isCli   = (php_sapi_name() === 'cli');
$token   = $isCli ? null : ($_GET['token']   ?? '');
$runDrops = $isCli ? false : isset($_GET['drops']);
$runSeeds = $isCli ? false : isset($_GET['seeds']);
$runBackfills = $isCli ? false : isset($_GET['backfills']);

if ($isCli) {
    foreach ($argv as $arg) {
        if (strpos($arg, '--token=') === 0) $token = substr($arg, 8);
        if ($arg === '--drops') $runDrops = true;
        if ($arg === '--seeds') $runSeeds = true;
        if ($arg === '--backfills') $runBackfills = true;
    }
}

if ($token !== $REQUIRED_TOKEN || $REQUIRED_TOKEN === 'CHANGE_ME_BEFORE_DEPLOY') {
    http_response_code(403);
    echo "Forbidden. Edit \$REQUIRED_TOKEN in this file and pass ?token=... (and remove the placeholder).\n";
    exit;
}

require_once __DIR__ . '/database/Database.php';

/**
 * Strip SQL comments (`-- ` to EOL, `#` to EOL, and `/* ... *\/` blocks) while
 * respecting string/identifier literals, so we never split a statement on a `;`
 * that lives inside a trailing comment or a quoted value. Full-line stripping is
 * not enough: a TRAILING `-- … ; …` comment keeps its semicolon and the naive
 * explode(';') then cuts the statement in half (seen on team_name_pools).
 * Leaves MySQL executable comments (/*! … *\/) intact. Handles '' and \' escapes.
 */
function stripSqlComments(string $sql): string {
    $out = '';
    $len = strlen($sql);
    $q = null; // active quote char: ' " or `
    for ($i = 0; $i < $len; $i++) {
        $c = $sql[$i];
        $next = $i + 1 < $len ? $sql[$i + 1] : '';
        if ($q !== null) {
            $out .= $c;
            if ($c === '\\' && $q !== '`' && $next !== '') { $out .= $next; $i++; continue; }
            if ($c === $q) {
                if ($next === $q) { $out .= $next; $i++; continue; } // '' / "" / `` escaped quote
                $q = null;
            }
            continue;
        }
        if ($c === "'" || $c === '"' || $c === '`') { $q = $c; $out .= $c; continue; }
        if ($c === '-' && $next === '-') {
            $after = $i + 2 < $len ? $sql[$i + 2] : "\n";
            if ($after === ' ' || $after === "\t" || $after === "\r" || $after === "\n") {
                while ($i < $len && $sql[$i] !== "\n") $i++;
                $out .= "\n";
                continue;
            }
        }
        if ($c === '#') {
            while ($i < $len && $sql[$i] !== "\n") $i++;
            $out .= "\n";
            continue;
        }
        if ($c === '/' && $next === '*' && ($i + 2 >= $len || $sql[$i + 2] !== '!')) {
            $end = strpos($sql, '*/', $i + 2);
            $i = ($end === false) ? $len : $end + 1;
            continue;
        }
        $out .= $c;
    }
    return $out;
}

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

    // Strip comments (string-aware) BEFORE splitting on `;`. Both full-line AND
    // trailing `-- …` comments are removed - a semicolon inside a trailing comment
    // would otherwise cut the statement in half when we explode(';'). String/
    // identifier literals are respected so a `;` or `--` inside a value is safe.
    $sqlNoComments = stripSqlComments($sql);

    // Guarded files (PREPARE/EXECUTE + session @vars) must run as ONE batch on a
    // single connection - see the header note. Splitting them on ';' and running
    // each fragment via query() (PDO prepared-statement protocol) makes MySQL
    // reject PREPARE/EXECUTE (error 1295), silently no-op'ing every guarded ALTER.
    // PDO::exec() uses the text protocol + multi-statements, exactly like the
    // per-feature apply_*.php scripts do.
    if (preg_match('/\bPREPARE\b/i', $sqlNoComments)) {
        try {
            $db->getConnection()->exec($sqlNoComments);
            $okStmts++;
            echo "  (ran as one guarded batch)\n";
        } catch (Exception $e) {
            $errStmts++;
            echo "  ! " . substr(preg_replace('/\s+/', ' ', $e->getMessage()), 0, 200) . "\n";
        }
        continue;
    }

    $statements = array_filter(array_map('trim', explode(';', $sqlNoComments)));

    foreach ($statements as $code) {
        if ($code === '') continue;

        try {
            $db->query($code);
            $okStmts++;
        } catch (Exception $e) {
            $errStmts++;
            $msg = $e->getMessage();
            // "already exists" / "Duplicate column" are expected when re-applying - flag, don't alarm
            echo "  ! " . substr(preg_replace('/\s+/', ' ', $msg), 0, 200) . "\n";
        }
    }
}

echo "\n--- migrations done: {$fileCount} files, {$okStmts} statements ok, {$errStmts} errors (errors are usually 'already applied') ---\n";

if ($runSeeds) {
    echo "\n=== seeds ===\n";
    foreach (['team_name_pools_seed.php', 'recovery_codes_seed.php', 'client_hotspot_seed.php'] as $seed) {
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

if ($runBackfills) {
    // Data backfills run AFTER all schema migrations (they read columns/tables the
    // SQL above creates). Both are idempotent - already-migrated rows resolve to
    // the same values, so re-running is a cheap no-op.
    echo "\n=== backfills ===\n";
    foreach (['scenario_hashes_backfill.php', 'scenarios_audience_difficulty_backfill.php'] as $backfill) {
        echo "--- {$backfill} ---\n";
        try {
            require $dir . '/' . $backfill;
        } catch (Throwable $e) {
            echo "  ! backfill error: " . $e->getMessage() . "\n";
        }
    }
} else {
    echo "\nNOTE: skipping PHP data backfills (scenario hashes + audience/difficulty). Pass backfills=1 to run them (they are idempotent).\n";
}

echo "\nALL DONE. Delete this file from the server now.\n";
