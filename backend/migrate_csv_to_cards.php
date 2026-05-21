<?php
/**
 * One-off migration: read each client's latest cards_v{N}.csv from the
 * filesystem and upsert the rows into the new row-based client_cards table.
 *
 * Idempotent: re-running converges to the same state. Does NOT bump
 * client_cards_metadata.version (the existing version already matches the
 * CSV that was on disk; the row table is being filled to match it).
 *
 * Does NOT delete CSV files — Unit 7 of the plan handles cleanup once all
 * Playground clients have moved off the CSV endpoints.
 *
 * Run via: php backend/migrate_csv_to_cards.php
 */

require_once __DIR__ . '/database/Database.php';

$cardsDir = __DIR__ . '/../cards';

function findLatestCardsCsv($clientDir) {
    if (!is_dir($clientDir)) {
        return [null, null];
    }
    $best = null;
    $bestVersion = 0;
    foreach (scandir($clientDir) as $name) {
        if (preg_match('/^cards_v(\d+)\.csv$/', $name, $m)) {
            $v = (int)$m[1];
            if ($v > $bestVersion) {
                $bestVersion = $v;
                $best = $clientDir . '/' . $name;
            }
        }
    }
    return [$best, $bestVersion];
}

function parseCsv($filePath) {
    $rows = [];
    $expectedHeaders = ['key_name', 'color', 'key_number', 'id'];
    $handle = fopen($filePath, 'r');
    if ($handle === false) {
        return [null, "Could not open $filePath"];
    }
    $headers = null;
    $lineNo = 0;
    while (($data = fgetcsv($handle, 4096, ',')) !== false) {
        $lineNo++;
        if ($headers === null) {
            $headers = array_map('trim', $data);
            $missing = array_diff($expectedHeaders, $headers);
            if (!empty($missing)) {
                fclose($handle);
                return [null, "Missing CSV headers: " . implode(', ', $missing)];
            }
            continue;
        }
        if (count($data) !== count($headers)) {
            continue;
        }
        $assoc = array_combine($headers, array_map('trim', $data));
        $rows[] = [
            'id' => (int)$assoc['id'],
            'key_number' => (int)$assoc['key_number'],
            'key_name' => $assoc['key_name'],
            'color' => $assoc['color'] === '' ? null : $assoc['color'],
        ];
    }
    fclose($handle);
    return [$rows, null];
}

try {
    $db = Database::getInstance();
    $pdo = $db->getConnection();

    echo "Migrating CSV-based cards into the client_cards table...\n\n";

    $clients = $db->fetchAll('SELECT client_id, version FROM client_cards_metadata');
    if (empty($clients)) {
        echo "No clients have any cards metadata. Nothing to migrate.\n";
        exit(0);
    }

    $totalClients = 0;
    $totalRowsUpserted = 0;
    $clientsWithoutFile = 0;

    foreach ($clients as $row) {
        $clientId = (int)$row['client_id'];
        $version = (int)$row['version'];
        $clientDir = $cardsDir . '/' . $clientId;

        echo "Client $clientId (metadata version $version): ";

        [$csvPath, $csvVersion] = findLatestCardsCsv($clientDir);
        if ($csvPath === null) {
            echo "no CSV file on disk, skipping.\n";
            $clientsWithoutFile++;
            continue;
        }

        [$rows, $parseError] = parseCsv($csvPath);
        if ($parseError !== null) {
            echo "PARSE ERROR ($parseError)\n";
            continue;
        }

        $pdo->beginTransaction();
        try {
            $upserts = 0;
            $skipped = 0;
            foreach ($rows as $card) {
                if ($card['id'] <= 0 || $card['key_number'] <= 0 || $card['key_name'] === '') {
                    $skipped++;
                    continue;
                }
                try {
                    $db->query(
                        'INSERT INTO client_cards (client_id, id, key_number, key_name, color)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                            key_name = VALUES(key_name),
                            color = VALUES(color)',
                        [$clientId, $card['id'], $card['key_number'], $card['key_name'], $card['color']]
                    );
                    $upserts++;
                } catch (PDOException $e) {
                    $skipped++;
                    echo "\n  ! skipped row id={$card['id']} key_number={$card['key_number']}: " . $e->getMessage();
                }
            }
            $pdo->commit();
            echo "imported $upserts row(s) from cards_v$csvVersion.csv";
            if ($skipped > 0) {
                echo " ($skipped skipped)";
            }
            echo "\n";
            $totalRowsUpserted += $upserts;
            $totalClients++;
        } catch (Exception $e) {
            $pdo->rollBack();
            echo "TRANSACTION FAILED: " . $e->getMessage() . "\n";
        }
    }

    echo "\n✓ Done. Migrated $totalClients client(s), $totalRowsUpserted total row(s) upserted.\n";
    if ($clientsWithoutFile > 0) {
        echo "  ($clientsWithoutFile client(s) had no CSV file on disk and were skipped.)\n";
    }
    echo "\nCSV files left in place. Run Unit 7 of the plan to delete them after the Playground rollout completes.\n";

} catch (Exception $e) {
    echo "\n✗ Fatal error: " . $e->getMessage() . "\n";
    exit(1);
}
