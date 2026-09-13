<?php

// Folds authored mystery wrong-answer points to their SIGNED form.
//
// Enigma penalties used to be authored as a bare magnitude ("5") that every
// runtime silently subtracted, while the two game-level maluses
// (malus_both_answers_biped / malus_no_answer) were already authored signed
// ("-5"). One editor, two conventions. The editor now writes the sign the
// author sees; this script rewrites the scenarios saved before it, so an old
// scenario reopened (or just listed in the recap) reads like a new one.
//
// What it touches: scenarios.data -> game_meta.enigmas[].wrong_answer_points,
// mystery scenarios only, positives only ("5" -> "-5"). Values already negative,
// zero, blank or non-numeric are left exactly as they are, which makes the
// script idempotent - a second run reports 0 changes.
//
// Each rewritten scenario also gets the usual +0.1 version bump and a
// ScenarioHashes::recompute(), so already-synced playgrounds re-download it.
//
// DEPLOY ORDER - update the playgrounds FIRST, then run this.
//   A playground/GO build from before the sign convention subtracts whatever it
//   reads, so it would ADD points for a wrong answer once the stored value is
//   negative. Current builds read the value sign-agnostically (a positive
//   magnitude still penalises), so they are correct both before and after this
//   runs; older ones are only correct before it. Nothing forces the order but
//   the scores, so check the fleet is up to date first.
//
// Usage:
//   php backend/apply_mystery_wrong_points_sign.php --dry-run   (report only)
//   php backend/apply_mystery_wrong_points_sign.php             (apply)

require_once __DIR__ . '/database/Database.php';
require_once __DIR__ . '/utils/ScenarioHashes.php';

$dryRun = in_array('--dry-run', $argv ?? [], true);

// Same rule as the editor's normalizeWrongAnswerPoints() / the importer's
// ti_signed_wrong_points(): a positive number becomes its negative, everything
// else is returned untouched.
function signedWrongPoints($raw) {
    if ($raw === null) return null;
    if (is_int($raw) || is_float($raw)) {
        return $raw > 0 ? -$raw : $raw;
    }
    $s = trim((string)$raw);
    if ($s === '' || !is_numeric($s)) return $raw;
    $n = (float)$s;
    if ($n <= 0) return $raw;
    return '-' . ltrim($s, '+');
}

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    $rows = $db->fetchAll(
        "SELECT id, uniqid, title, version, data
           FROM scenarios
          WHERE game_type = 'mystery'"
    );
    echo "Mystery scenarios: " . count($rows) . ($dryRun ? "  (DRY RUN)\n\n" : "\n\n");

    $changedScenarios = 0;
    $changedEnigmas = 0;
    $skipped = 0;

    foreach ($rows as $row) {
        $data = json_decode((string)$row['data'], true);
        if (!is_array($data) || !is_array($data['game_meta'] ?? null)
            || !is_array($data['game_meta']['enigmas'] ?? null)) {
            $skipped++;
            continue;
        }

        $touched = [];
        foreach ($data['game_meta']['enigmas'] as $i => $e) {
            if (!is_array($e) || !array_key_exists('wrong_answer_points', $e)) continue;
            $before = $e['wrong_answer_points'];
            $after = signedWrongPoints($before);
            if ((string)$after === (string)$before) continue;
            $data['game_meta']['enigmas'][$i]['wrong_answer_points'] = $after;
            $touched[] = ($e['number'] ?? ($i + 1)) . ": {$before} -> {$after}";
        }

        if (!$touched) continue;

        $changedScenarios++;
        $changedEnigmas += count($touched);
        echo "#{$row['id']} {$row['title']} ({$row['uniqid']})\n";
        foreach ($touched as $line) echo "    enigma $line\n";

        if ($dryRun) { echo "\n"; continue; }

        // Mirror the editor's save: bump the row version AND the copy of it
        // inside game_meta (retours #15 - one version number, everywhere), so
        // synced playgrounds see a newer scenario and re-download it.
        $next = (string)round(((float)$row['version'] ?: 0) + 0.1, 1);
        $data['game_meta']['scenario_version'] = $next;

        $upd = $pdo->prepare('UPDATE scenarios SET data = ?, version = ? WHERE id = ?');
        $upd->execute([
            json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $next,
            $row['id'],
        ]);
        ScenarioHashes::recompute($pdo, $row['uniqid']);
        echo "    version {$row['version']} -> {$next}, hashes recomputed\n\n";
    }

    echo "\n";
    echo ($dryRun ? "Would rewrite " : "Rewrote ")
        . "$changedEnigmas enigma penalt" . ($changedEnigmas === 1 ? 'y' : 'ies')
        . " across $changedScenarios scenario" . ($changedScenarios === 1 ? '' : 's') . ".\n";
    if ($skipped) echo "Skipped $skipped scenario(s) with no authored enigmas.\n";
    if ($dryRun) echo "Nothing was written (--dry-run).\n";
} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
    exit(1);
}
