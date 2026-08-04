// Shared GO/Drop ranking helpers, used by both the operator's leaderboard
// (components/client/GoSessionsView) and the public player board
// (components/public/PublicRankingView).
//
// Sessions were retired: a board is "a scenario + a time window", never a run.
// The operator picks the window; the player board receives that same window
// through its URL, so both surfaces resolve it with the code below and agree.

export const GO_BASE_URL = import.meta.env.VITE_GO_BASE_URL || 'https://go.taghunter.fr';
export const DROP_BASE_URL = import.meta.env.VITE_DROP_BASE_URL || 'https://drop.taghunter.fr';

export type GoApp = 'go' | 'drop';

// The time windows a board can be filtered by. Named ranges are resolved
// against the VIEWER's clock; `custom` carries explicit from/to.
export type RangeKey = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';
export const NAMED_RANGES: RangeKey[] = ['today', 'week', 'month', 'year', 'all'];

const ALL_RANGES: RangeKey[] = [...NAMED_RANGES, 'custom'];

/** Narrow an untrusted string (a URL param) to a RangeKey, defaulting to 'today'. */
export function parseRange(raw: string | null | undefined): RangeKey {
  return ALL_RANGES.includes(raw as RangeKey) ? (raw as RangeKey) : 'today';
}

/** The player PWA join URL - scoped to client + scenario, durable across runs. */
export function playerUrl(base: string, clientId: string, scenarioId: number | string): string {
  return `${base}/?c=${encodeURIComponent(clientId)}&s=${encodeURIComponent(String(scenarioId))}`;
}

export function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// A Date → UTC MySQL datetime ("YYYY-MM-DD HH:MM:SS"). toISOString() is always
// UTC, so the server (whose connection is pinned to UTC) compares apples to
// apples regardless of where the viewer or the DB live.
export function toUtcSql(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/** The viewer's IANA timezone (e.g. "Europe/Paris"), or '' if unavailable. */
export function clientTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/**
 * The query params that select a board's time window.
 *
 * Named ranges (today / week / month / year) send `range` + `tz` and are
 * resolved SERVER-SIDE, off the same clock that stamps go_scores.updated_at, so
 * a just-finished game can't fall outside its own "today" through a browser vs
 * server clock/timezone mismatch. `all` sends `range=all` (no bound). `custom`
 * still sends explicit UTC `from`/`to`, computed here from the operator's
 * datetime-local inputs.
 */
export function rangeQuery(
  range: RangeKey,
  customFrom = '',
  customTo = '',
): Record<string, string> {
  if (range === 'custom') {
    const out: Record<string, string> = { range };
    if (customFrom) out.from = toUtcSql(new Date(customFrom));
    if (customTo) out.to = toUtcSql(new Date(customTo));
    return out;
  }
  const out: Record<string, string> = { range };
  const tz = clientTz();
  if (tz) out.tz = tz;
  return out;
}

/** One team's row on a board. The public board omits `team_uuid` (see go.php). */
export interface ScoreRow {
  team_uuid?: string;
  team_name: string | null;
  score: number;
  level: number;
  finished: number;
  elapsed_seconds: number;
  updated_at: string;
}
