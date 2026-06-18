<?php
// Content hashing for incremental scenario sync (CAS).
//
// Single source of truth for the three hash columns on `scenarios`:
//   data_hash    - sha256 of the inputs that determine the served game_data
//                  (data + medias + scenario_layout + game_type). This is the
//                  blob key the playground uses for game-data.json AND the
//                  "did the data change" signal. We hash all four columns (not
//                  just `data`) because get_scenario_game_data splices medias /
//                  layout / game-type-specific shape INTO the served JSON, so a
//                  change in any of them changes what the playground writes.
//   content_hash - Tier-1 gate: sha256 over data_hash + sorted (name:hash) of
//                  every top-level media file. Cheap "did anything change".
//   media_hashes - JSON map {name: {h:<sha256>, s:<size>, m:<mtime>}} for the
//                  flat top-level files in media/{uniqid}/ (the exact set the
//                  playground mirrors via get_media). s/m guard re-hashing.
//
// Call recompute($pdo, $uniqid) at the tail of EVERY scenario write path.
// Accepts a raw PDO so it works from both the Database wrapper
// ($db->getConnection()) and the importer's bare $pdo.

class ScenarioHashes {

    public static function mediaBase(): string {
        // backend/utils/ -> web root /media/
        return __DIR__ . '/../../media/';
    }

    // Re-derive and persist data_hash, content_hash, media_hashes for one scenario.
    // Re-hashes only files whose size or mtime changed since the last run.
    public static function recompute(PDO $pdo, string $uniqid): void {
        $stmt = $pdo->prepare('SELECT data, medias, scenario_layout, game_type, media_hashes FROM scenarios WHERE uniqid = ?');
        $stmt->execute([$uniqid]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return;
        }

        $dataHash = self::computeDataHash($row);

        // Previous map (for the size/mtime guard).
        $prev = [];
        if (!empty($row['media_hashes'])) {
            $decoded = json_decode($row['media_hashes'], true);
            if (is_array($decoded)) {
                $prev = $decoded;
            }
        }

        $map = self::hashMediaDir($uniqid, $prev);

        // content_hash = sha256( "data:<dataHash>\n<name>:<hash>\n..." ), names sorted.
        ksort($map);
        $parts = ['data:' . $dataHash];
        foreach ($map as $name => $meta) {
            $parts[] = $name . ':' . $meta['h'];
        }
        $contentHash = hash('sha256', implode("\n", $parts));

        $upd = $pdo->prepare('UPDATE scenarios SET data_hash = ?, content_hash = ?, media_hashes = ? WHERE uniqid = ?');
        $upd->execute([$dataHash, $contentHash, json_encode($map, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $uniqid]);
    }

    // Hash of the four columns that feed the served game_data. Null columns
    // normalize to '' so the hash is stable.
    private static function computeDataHash(array $row): string {
        $payload = ($row['data'] ?? '') . "\x00"
                 . ($row['medias'] ?? '') . "\x00"
                 . ($row['scenario_layout'] ?? '') . "\x00"
                 . ($row['game_type'] ?? '');
        return hash('sha256', $payload);
    }

    // Walk the flat top-level media dir; reuse a prior hash when size+mtime match.
    private static function hashMediaDir(string $uniqid, array $prev): array {
        $map = [];
        $mediaDir = self::mediaBase() . $uniqid;
        if (!is_dir($mediaDir)) {
            return $map;
        }
        foreach (scandir($mediaDir) as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $path = $mediaDir . '/' . $entry;
            if (!is_file($path)) {
                continue; // subdirs (e.g. files/ ZIP uploads) are not synced media
            }
            $size = (int) filesize($path);
            $mtime = (int) filemtime($path);
            $p = $prev[$entry] ?? null;
            if (is_array($p) && isset($p['h'], $p['s'], $p['m'])
                && (int) $p['s'] === $size && (int) $p['m'] === $mtime) {
                $map[$entry] = ['h' => $p['h'], 's' => $size, 'm' => $mtime];
            } else {
                $map[$entry] = ['h' => hash_file('sha256', $path), 's' => $size, 'm' => $mtime];
            }
        }
        return $map;
    }

    // Tier-1 value with NULL-hash lazy fallback (compute + persist on the spot).
    public static function contentHash(PDO $pdo, string $uniqid): ?string {
        $val = self::readColumn($pdo, $uniqid, 'content_hash');
        if ($val !== null && $val !== '') {
            return $val;
        }
        self::recompute($pdo, $uniqid);
        return self::readColumn($pdo, $uniqid, 'content_hash');
    }

    // Tier-2 file manifest [{rel_path, hash, size}] for get_scenario_game_data,
    // with the same NULL-hash lazy fallback. Returns game-data.json keyed by
    // data_hash as the first entry so the playground treats it like any blob.
    public static function fileManifest(PDO $pdo, string $uniqid): array {
        $row = self::readRow($pdo, $uniqid);
        if ($row === null) {
            return [];
        }
        if (empty($row['media_hashes']) || empty($row['content_hash'])) {
            self::recompute($pdo, $uniqid);
            $row = self::readRow($pdo, $uniqid);
        }
        $out = [];
        if ($row && !empty($row['data_hash'])) {
            $out[] = ['rel_path' => 'game-data.json', 'hash' => $row['data_hash'], 'size' => 0];
        }
        $map = [];
        if ($row && !empty($row['media_hashes'])) {
            $decoded = json_decode($row['media_hashes'], true);
            if (is_array($decoded)) {
                $map = $decoded;
            }
        }
        foreach ($map as $name => $meta) {
            $out[] = ['rel_path' => $name, 'hash' => $meta['h'], 'size' => (int) ($meta['s'] ?? 0)];
        }
        return $out;
    }

    private static function readColumn(PDO $pdo, string $uniqid, string $col): ?string {
        $stmt = $pdo->prepare("SELECT `$col` AS v FROM scenarios WHERE uniqid = ?");
        $stmt->execute([$uniqid]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);
        return $r ? ($r['v'] ?? null) : null;
    }

    private static function readRow(PDO $pdo, string $uniqid): ?array {
        $stmt = $pdo->prepare('SELECT data_hash, content_hash, media_hashes FROM scenarios WHERE uniqid = ?');
        $stmt->execute([$uniqid]);
        $r = $stmt->fetch(PDO::FETCH_ASSOC);
        return $r ?: null;
    }
}
