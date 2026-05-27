<?php
// Telemetry ingest endpoint. Receives batched, non-blocking events from the
// Playground outbox: device heartbeats, error reports, and (future) game-launch
// stats. Every event carries a client-generated event_uuid for idempotency, so
// the outbox can safely retry after a mid-response network drop.
//
// Wire shape:
//   POST /telemetry.php?action=ingest
//   Bearer auth via PlaygroundAuth::requirePlaygroundClient.
//   Body: {
//     events: [
//       {
//         event_uuid: "<uuid v4>",
//         event_type: "heartbeat" | "error" | "launch" | "game_summary" | "recovery_code_used",
//         occurred_at: "<ISO 8601>",
//         payload: {...event-type-specific...}
//       },
//       ...up to 50
//     ]
//   }
//   Response: { results: [ { event_uuid, status: "ok"|"rejected" }, ... ] }
//
// "rejected" = malformed / unknown event_type; client should drop the row
// (retrying won't help). "ok" = persisted or idempotent no-op.

require_once __DIR__ . '/../utils/cors.php';
require_once __DIR__ . '/../utils/SecurityHeaders.php';
require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/PlaygroundAuth.php';
require_once __DIR__ . '/../utils/DeviceManager.php';

SecurityHeaders::setHeaders();
setCorsHeaders();

header('Content-Type: application/json');

const MAX_EVENTS_PER_BATCH = 50;
const MAX_PAYLOAD_BYTES = 1048576; // 1 MiB upper bound per request

function getRequestData(): array {
    return json_decode(file_get_contents('php://input'), true) ?? [];
}

function eventStatus(string $uuid, string $status): array {
    return ['event_uuid' => $uuid, 'status' => $status];
}

function ingestHeartbeat(object $db, int $clientId, ?int $authDeviceId, array $payload): bool {
    $deviceUniq = trim((string)($payload['device_uniq'] ?? ''));
    if ($deviceUniq === '') {
        return false;
    }

    DeviceManager::findOrCreate($db, $clientId, $deviceUniq, [
        'device_label' => $payload['device_label'] ?? null,
        'os' => $payload['os'] ?? null,
        'os_version' => $payload['os_version'] ?? null,
        'app_version' => $payload['app_version'] ?? null,
    ]);

    return true;
}

function ingestError(
    object $db,
    int $clientId,
    ?int $authDeviceId,
    string $eventUuid,
    string $occurredAt,
    array $payload
): bool {
    $fingerprint = trim((string)($payload['fingerprint_hash'] ?? ''));
    $message = (string)($payload['error_message'] ?? '');
    if ($fingerprint === '' || $message === '') {
        return false;
    }

    // Hash must be sha256 hex (64 chars). Reject anything else so the index column
    // stays clean.
    if (strlen($fingerprint) !== 64 || !ctype_xdigit($fingerprint)) {
        return false;
    }

    $stack = $payload['stack_trace'] ?? null;
    $count = max(1, (int)($payload['occurrence_count'] ?? 1));
    $firstSeen = $payload['first_seen_at'] ?? $occurredAt;
    $lastSeen = $payload['last_seen_at'] ?? $occurredAt;
    $appVersion = $payload['app_version'] ?? null;
    $context = $payload['context'] ?? null;

    // ON DUPLICATE KEY UPDATE keyed by event_uuid: retries from the outbox
    // collapse onto the same row, accumulating count + bumping last_seen.
    $db->execute(
        'INSERT INTO error_reports
           (event_uuid, client_id, device_id, app_version, fingerprint_hash,
            error_message, stack_trace, occurrence_count, first_seen_at,
            last_seen_at, context_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           occurrence_count = occurrence_count + VALUES(occurrence_count),
           last_seen_at = GREATEST(last_seen_at, VALUES(last_seen_at)),
           first_seen_at = LEAST(first_seen_at, VALUES(first_seen_at))',
        [
            $eventUuid,
            $clientId,
            $authDeviceId,
            $appVersion,
            $fingerprint,
            $message,
            $stack,
            $count,
            normalizeDatetime($firstSeen),
            normalizeDatetime($lastSeen),
            $context !== null ? json_encode($context) : null,
        ]
    );

    return true;
}

function ingestLaunch(
    object $db,
    int $clientId,
    ?int $authDeviceId,
    string $eventUuid,
    array $payload
): bool {
    // INSERT IGNORE on the unique event_uuid: a duplicate from a retry collapses
    // silently. Schema is sized for the future stats feature; this endpoint
    // accepts launches now so the wire shape is locked.
    $db->execute(
        'INSERT IGNORE INTO game_launches
           (event_uuid, client_id, device_id, scenario_uniqid, duration_seconds,
            teams_count, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $eventUuid,
            $clientId,
            $authDeviceId,
            $payload['scenario_uniqid'] ?? null,
            isset($payload['duration_seconds']) ? (int)$payload['duration_seconds'] : null,
            isset($payload['teams_count']) ? (int)$payload['teams_count'] : null,
            normalizeDatetime($payload['started_at'] ?? null),
            normalizeDatetime($payload['ended_at'] ?? null),
        ]
    );

    return true;
}

function ingestGameSummary(
    object $db,
    int $clientId,
    ?int $authDeviceId,
    array $payload
): bool {
    $summaryUuid = trim((string)($payload['summary_uuid'] ?? ''));
    $gameType = trim((string)($payload['game_type'] ?? ''));
    if ($summaryUuid === '' || strlen($summaryUuid) > 36 || $gameType === '') {
        return false;
    }

    // Upsert keyed on summary_uuid (the playground's stable per-game id):
    // last-write-wins, so a post-game score edit that re-emits refreshes the
    // same row rather than duplicating it.
    $db->execute(
        'INSERT INTO game_summaries
           (summary_uuid, client_id, device_id, name, game_type, scenario_uniqid,
            played_at, teams_launched, teams_played, players_played)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           device_id = VALUES(device_id),
           name = VALUES(name),
           game_type = VALUES(game_type),
           scenario_uniqid = VALUES(scenario_uniqid),
           played_at = VALUES(played_at),
           teams_launched = VALUES(teams_launched),
           teams_played = VALUES(teams_played),
           players_played = VALUES(players_played)',
        [
            $summaryUuid,
            $clientId,
            $authDeviceId,
            isset($payload['name']) ? (string)$payload['name'] : null,
            $gameType,
            $payload['scenario_uniqid'] ?? null,
            normalizeDatetime($payload['played_at'] ?? null),
            isset($payload['teams_launched']) && $payload['teams_launched'] !== null
                ? (int)$payload['teams_launched'] : null,
            (int)($payload['teams_played'] ?? 0),
            (int)($payload['players_played'] ?? 0),
        ]
    );

    return true;
}

function ingestRecoveryCodeUsed(
    object $db,
    int $clientId,
    string $occurredAt,
    array $payload
): bool {
    $codeIndex = (int)($payload['code_index'] ?? 0);
    if ($codeIndex <= 0) {
        return false;
    }
    $poolVersion = isset($payload['pool_version']) ? (int)$payload['pool_version'] : null;
    $deviceLabel = isset($payload['device_label']) && $payload['device_label'] !== null
        ? substr((string)$payload['device_label'], 0, 255)
        : null;

    // Defensive: the tables may not be migrated yet on older installs. Treat a
    // missing table as "nothing to record" (ack so the outbox drops the row).
    try {
        // Only stamp if the device's pool matches the current studio pool — a
        // report against a since-regenerated pool would otherwise mark a fresh,
        // unused code as used. A null reported version skips the gate (legacy).
        if ($poolVersion !== null) {
            $meta = $db->fetch('SELECT current_version FROM recovery_codes_meta WHERE client_id = ?', [$clientId]);
            $currentVersion = (int)($meta['current_version'] ?? 0);
            if ($poolVersion !== $currentVersion) {
                return true; // stale report — ack and drop, no change.
            }
        }

        // Idempotent: the used_at IS NULL guard means a retry (same code) or a
        // second device reporting the same index is a no-op after the first.
        $usedAt = normalizeDatetime($occurredAt) ?? date('Y-m-d H:i:s');
        $db->execute(
            'UPDATE recovery_codes
                SET used_at = ?, used_device_label = ?
              WHERE client_id = ? AND code_index = ? AND used_at IS NULL',
            [$usedAt, $deviceLabel, $clientId, $codeIndex]
        );
    } catch (Exception $e) {
        error_log('[telemetry.recovery_code_used] ' . $e->getMessage());
    }

    return true;
}

function normalizeDatetime($value): ?string {
    if ($value === null || $value === '') return null;
    $ts = strtotime((string)$value);
    if ($ts === false) return null;
    return date('Y-m-d H:i:s', $ts);
}

try {
    $db = Database::getInstance();
    $action = $_GET['action'] ?? '';

    if ($action !== 'ingest') {
        jsonResponse(['error' => 'Invalid action'], 400);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResponse(['error' => 'Method not allowed'], 405);
    }

    $contentLength = isset($_SERVER['CONTENT_LENGTH']) ? (int)$_SERVER['CONTENT_LENGTH'] : 0;
    if ($contentLength > MAX_PAYLOAD_BYTES) {
        jsonResponse(['error' => 'Payload too large'], 413);
    }

    $client = requirePlaygroundClient($db);
    $clientId = (int)$client['id'];
    $authDeviceId = isset($client['device_id']) ? (int)$client['device_id'] : null;

    $data = getRequestData();
    $events = $data['events'] ?? null;

    if (!is_array($events)) {
        jsonResponse(['error' => 'events array is required'], 400);
    }

    if (count($events) === 0) {
        jsonResponse(['results' => []]);
    }

    if (count($events) > MAX_EVENTS_PER_BATCH) {
        jsonResponse(['error' => 'Too many events; max ' . MAX_EVENTS_PER_BATCH], 400);
    }

    $results = [];

    foreach ($events as $event) {
        $uuid = (string)($event['event_uuid'] ?? '');
        $type = (string)($event['event_type'] ?? '');
        $occurredAt = (string)($event['occurred_at'] ?? '');
        $payload = is_array($event['payload'] ?? null) ? $event['payload'] : [];

        if ($uuid === '' || strlen($uuid) > 36) {
            // Can't address a result without a uuid; skip silently.
            continue;
        }

        try {
            $ok = false;
            switch ($type) {
                case 'heartbeat':
                    $ok = ingestHeartbeat($db, $clientId, $authDeviceId, $payload);
                    break;
                case 'error':
                    $ok = ingestError($db, $clientId, $authDeviceId, $uuid, $occurredAt, $payload);
                    break;
                case 'launch':
                    $ok = ingestLaunch($db, $clientId, $authDeviceId, $uuid, $payload);
                    break;
                case 'game_summary':
                    $ok = ingestGameSummary($db, $clientId, $authDeviceId, $payload);
                    break;
                case 'recovery_code_used':
                    $ok = ingestRecoveryCodeUsed($db, $clientId, $occurredAt, $payload);
                    break;
                default:
                    $ok = false;
            }
            $results[] = eventStatus($uuid, $ok ? 'ok' : 'rejected');
        } catch (Exception $e) {
            // Per-event failure: tell the client to drop the row. The error is
            // either malformed input or a schema problem we won't fix by
            // retrying. A transient DB outage will have already thrown out of
            // the outer try and returned 5xx, which the client treats as
            // retryable.
            error_log('[telemetry.ingest] event ' . $uuid . ' failed: ' . $e->getMessage());
            $results[] = eventStatus($uuid, 'rejected');
        }
    }

    jsonResponseWithAuthState($db, $clientId, ['results' => $results]);

} catch (Exception $e) {
    error_log('[telemetry] ' . $e->getMessage());
    jsonResponse(['error' => $e->getMessage()], 500);
}
