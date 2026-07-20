<?php
// One-time backfill: migrate every scenario's `data` JSON to the new catalog
// metadata shape introduced with the difficulty/audience/univers redesign.
//
// For each scenario's game_meta:
//   - audience_bands : derived from the legacy game_public tier when absent
//   - game_public    : rewritten as the derived name-pool tier (oldest band wins)
//   - difficulty     : coerced from the legacy easy/medium/hard enum to int 1–5
//   - univers        : ensured to be an array (defaults to [])
//
// Idempotent - already-migrated rows resolve to the same values, so re-running is
// safe. A read-side fallback in playground.php covers any row this misses
// (legacy ZIP imports, rows edited between this run and the deploy).
//
// Run from CLI:  php backend/database/scenarios_audience_difficulty_backfill.php
//   add `--dry` to preview without writing.

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/../utils/AudienceCompat.php';

$dryRun = in_array('--dry', $argv ?? [], true);

$db = Database::getInstance();
$scenarios = $db->fetchAll('SELECT id, data FROM scenarios ORDER BY id ASC');

$updated = 0;
$skipped = 0;
$failed = 0;

foreach ($scenarios as $row) {
    $id = (int) $row['id'];
    $raw = $row['data'];
    if (empty($raw)) {
        $skipped++;
        continue;
    }

    $data = json_decode($raw, true);
    if (!is_array($data) || !is_array($data['game_meta'] ?? null)) {
        $skipped++;
        continue;
    }

    $gm = $data['game_meta'];

    // --- audience bands (source of truth) + derived game_public shadow --------
    $bands = AudienceCompat::normalizeBands($gm['audience_bands'] ?? null);
    if (empty($bands)) {
        $bands = AudienceCompat::bandsFromTier($gm['game_public'] ?? '');
    }
    $newGamePublic = AudienceCompat::bandsToTier($bands);

    // --- difficulty enum → int 1–5 -------------------------------------------
    $newDifficulty = AudienceCompat::coerceDifficulty($gm['difficulty'] ?? null);

    // --- univers always an array ---------------------------------------------
    $newUnivers = is_array($gm['univers'] ?? null) ? array_values(array_filter(
        array_map(fn($t) => is_string($t) ? trim($t) : '', $gm['univers']),
        fn($t) => $t !== ''
    )) : [];

    // Skip if nothing would change (idempotent re-runs).
    $unchanged =
        ($gm['audience_bands'] ?? null) === $bands &&
        ($gm['game_public'] ?? null) === $newGamePublic &&
        ($gm['difficulty'] ?? null) === $newDifficulty &&
        ($gm['univers'] ?? null) === $newUnivers;
    if ($unchanged) {
        $skipped++;
        continue;
    }

    $gm['audience_bands'] = $bands;
    $gm['game_public'] = $newGamePublic;
    $gm['difficulty'] = $newDifficulty;
    $gm['univers'] = $newUnivers;
    $data['game_meta'] = $gm;

    $encoded = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($encoded === false) {
        echo "scenario {$id}: JSON encode failed, skipped\n";
        $failed++;
        continue;
    }

    if ($dryRun) {
        echo "scenario {$id}: would set bands=[" . implode(',', $bands) . "] tier={$newGamePublic} difficulty={$newDifficulty} univers=[" . implode(',', $newUnivers) . "]\n";
        $updated++;
        continue;
    }

    try {
        $db->query('UPDATE scenarios SET data = ? WHERE id = ?', [$encoded, $id]);
        $updated++;
        echo "scenario {$id}: bands=[" . implode(',', $bands) . "] tier={$newGamePublic} difficulty={$newDifficulty}\n";
    } catch (Throwable $e) {
        echo "scenario {$id}: UPDATE failed - {$e->getMessage()}\n";
        $failed++;
    }
}

$mode = $dryRun ? ' (dry run, no writes)' : '';
echo "\nDone{$mode}. {$updated} updated, {$skipped} unchanged/skipped, {$failed} failed (" . count($scenarios) . " total).\n";
