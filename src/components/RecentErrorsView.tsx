import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Activity,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Search,
  Download,
  X,
  Trash2,
} from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

/** POST to telemetry_admin.php?action=delete_errors; throws the server's error text. */
async function postDeleteErrors(body: Record<string, unknown>): Promise<{ deleted?: number; count?: number }> {
  const res = await authFetch(`${API_BASE_URL}/telemetry_admin.php?action=delete_errors`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Delete failed');
  return json;
}

interface FleetErrorRow {
  client_id: number;
  device_id: number | null;
  fingerprint_hash: string;
  error_message: string;
  stack_trace: string | null;
  /** Sum of occurrence_count across every report row in the group. */
  total_count: number;
  /** How many distinct report rows (delivered outbox events) formed the group. */
  report_count: number | null;
  first_seen_at: string;
  last_seen_at: string;
  app_version: string | null;
  client_email: string | null;
  client_name: string | null;
  device_label: string | null;
  display_name: string | null;
  device_uniq: string | null;
  device_os: string | null;
  device_os_version: string | null;
  /** The version the device runs *now* - may be newer than the crashing one. */
  device_current_version: string | null;
  /** JSON string as stored by the ingest; shape is caller-defined. */
  context_json: string | null;
  latest_event_uuid: string | null;
  latest_reported_at: string | null;
}

/** One individual report row behind a group (action=error_detail). */
interface ErrorOccurrence {
  id: number;
  event_uuid: string;
  app_version: string | null;
  error_message: string | null;
  stack_trace: string | null;
  occurrence_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  context_json: string | null;
  created_at: string;
}

type SortKey = 'recent' | 'client' | 'device' | 'count';

const WINDOWS = [7, 30, 90] as const;

// The name shown to humans: the user/admin-chosen display_name wins, falling
// back to the OS hostname (device_label).
function deviceName(r: FleetErrorRow): string {
  return r.display_name || r.device_label || '';
}

function clientName(r: FleetErrorRow): string {
  return r.client_name || r.client_email || `licensee #${r.client_id}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '-';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '-';
  // MySQL DATETIME comes back as "YYYY-MM-DD HH:MM:SS" (UTC, no zone marker);
  // normalise so browsers parse it consistently instead of guessing.
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function parseContext(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The crash's origin, as tagged by the playground's captureError call sites:
 * 'window.error' | 'unhandledrejection' | 'rust_panic' | 'sync_cycle'. Shown as
 * a badge because it is the fastest triage signal on the feed.
 */
function contextSource(raw: string | null): string | null {
  const ctx = parseContext(raw);
  const src = ctx?.source;
  return typeof src === 'string' && src !== '' ? src : null;
}

function sourceBadgeClass(source: string): string {
  switch (source) {
    case 'rust_panic':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'unhandledrejection':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'sync_cycle':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

/** Everything we know about one group, as pasteable plain text. */
function reportAsText(r: FleetErrorRow): string {
  const lines = [
    r.error_message,
    '',
    `Licensee:      ${clientName(r)}${r.client_email ? ` <${r.client_email}>` : ''} (#${r.client_id})`,
    `Device:        ${deviceName(r) || 'unknown'}${r.device_id ? ` (#${r.device_id})` : ''}`,
    `Device uniq:   ${r.device_uniq || '-'}`,
    `OS:            ${r.device_os || '-'}${r.device_os_version ? ` ${r.device_os_version}` : ''}`,
    `App version:   ${r.app_version || '-'}${
      r.device_current_version && r.device_current_version !== r.app_version
        ? ` (device now on ${r.device_current_version})`
        : ''
    }`,
    `Occurrences:   ${r.total_count}${r.report_count ? ` over ${r.report_count} report(s)` : ''}`,
    `First seen:    ${formatAbsolute(r.first_seen_at)}`,
    `Last seen:     ${formatAbsolute(r.last_seen_at)}`,
    `Fingerprint:   ${r.fingerprint_hash}`,
    `Event uuid:    ${r.latest_event_uuid || '-'}`,
    '',
    `Context: ${r.context_json || '(none)'}`,
    '',
    'Stack trace:',
    r.stack_trace || '(none captured)',
  ];
  return lines.join('\n');
}

export function RecentErrorsView() {
  const [rows, setRows] = useState<FleetErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [days, setDays] = useState<number>(30);
  const [query, setQuery] = useState('');
  const [exportOpen, setExportOpen] = useState(false);

  const fetchErrors = async (windowDays = days) => {
    try {
      setLoading(true);
      setError('');
      const res = await authFetch(
        `${API_BASE_URL}/telemetry_admin.php?action=list_errors&days=${windowDays}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to fetch errors');
      const json = await res.json();
      setRows(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load errors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchErrors(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };

  // Free-text filter across every field an admin would search by: the message,
  // who reported it, which build, the origin tag, and the raw fingerprint (so a
  // hash pasted from elsewhere finds its group).
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter((r) =>
      [
        r.error_message,
        clientName(r),
        r.client_email,
        deviceName(r),
        r.device_uniq,
        r.app_version,
        r.device_os,
        contextSource(r.context_json),
        r.fingerprint_hash,
        r.stack_trace,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, query]);

  // Sort client-side over the loaded rows. "recent" preserves the server's
  // last-seen ordering; client/device sort alphabetically then fall back to
  // most-recent within a group.
  const sortedRows = useMemo(
    () =>
      [...filteredRows].sort((a, b) => {
        if (sortKey === 'client') {
          const byClient = clientName(a).localeCompare(clientName(b));
          if (byClient !== 0) return byClient;
          const byDevice = deviceName(a).localeCompare(deviceName(b));
          if (byDevice !== 0) return byDevice;
        } else if (sortKey === 'device') {
          const byDevice = deviceName(a).localeCompare(deviceName(b));
          if (byDevice !== 0) return byDevice;
        } else if (sortKey === 'count') {
          const byCount = Number(b.total_count) - Number(a.total_count);
          if (byCount !== 0) return byCount;
        }
        // recent (default) and tie-breaker: newest last_seen first
        return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
      }),
    [filteredRows, sortKey]
  );

  const sortButton = (key: SortKey, label: string) => (
    <button
      onClick={() => setSortKey(key)}
      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
        sortKey === key
          ? 'bg-slate-900 text-white'
          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <p className="text-sm text-slate-600">
          Errors from the last {days} days, grouped by device + fingerprint. Up to 200 most-recent
          groups. Click a row for the full report.
        </p>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-400 mr-1">Window</span>
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setDays(w)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  days === w
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-slate-400 mr-1">Sort</span>
            {sortButton('recent', 'Recent')}
            {sortButton('count', 'Frequency')}
            {sortButton('client', 'Licensee')}
            {sortButton('device', 'Device')}
          </div>
          <button
            onClick={() => fetchErrors()}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">Refresh</span>
          </button>
          <button
            onClick={() => setExportOpen((v) => !v)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              exportOpen
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Download className="w-4 h-4" />
            <span className="text-sm font-medium">Export / delete</span>
          </button>
        </div>
      </div>

      {exportOpen && (
        <ExportPanel days={days} onClose={() => setExportOpen(false)} onDeleted={() => fetchErrors()} />
      )}

      <div className="relative mb-6">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by message, licensee, device, version, origin, stack or fingerprint…"
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
          <Activity className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">No errors reported in the last {days} days.</p>
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
          <Search className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">No error matches “{query}”.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400 mb-2">
            {sortedRows.length} group{sortedRows.length > 1 ? 's' : ''}
            {query.trim() !== '' && ` of ${rows.length}`}
          </p>
          <div className="space-y-3">
            {sortedRows.map((r) => {
              const key = `${r.client_id}:${r.device_id ?? 'none'}:${r.fingerprint_hash}`;
              const open = expanded.has(key);
              const source = contextSource(r.context_json);
              return (
                <div key={key} className="bg-white rounded-xl border border-slate-200">
                  <button
                    onClick={() => toggle(key)}
                    className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {open ? (
                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                          <p
                            className={`text-sm font-medium text-slate-900 ${
                              open ? 'break-words' : 'truncate'
                            }`}
                          >
                            {r.error_message}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-1 pl-6">
                          {source && (
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${sourceBadgeClass(
                                source
                              )}`}
                            >
                              {source}
                            </span>
                          )}
                          <span className="text-xs text-slate-500">
                            {clientName(r)}
                            {r.app_version && <span className="ml-2 font-mono">v{r.app_version}</span>}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 pl-6 font-medium">
                          {deviceName(r) || (
                            <span className="italic text-slate-400">unknown device</span>
                          )}
                          {r.device_os && (
                            <span className="ml-2 font-normal text-slate-400">
                              {r.device_os}
                              {r.device_os_version ? ` ${r.device_os_version}` : ''}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 mt-1 pl-6 font-mono">
                          {r.fingerprint_hash.slice(0, 16)}…
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-500 shrink-0">
                        <div className="font-semibold text-slate-700">×{r.total_count}</div>
                        <div className="mt-1" title={formatAbsolute(r.last_seen_at)}>
                          {formatRelative(r.last_seen_at)}
                        </div>
                      </div>
                    </div>
                  </button>
                  {open && (
                    <ErrorDetailPanel
                      row={r}
                      onDeleted={() => {
                        setRows((prev) =>
                          prev.filter(
                            (x) =>
                              `${x.client_id}:${x.device_id ?? 'none'}:${x.fingerprint_hash}` !== key
                          )
                        );
                        toggle(key);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── export ──

/** One report row as returned by action=export_errors (PDO gives numbers as strings). */
interface ExportReport {
  id: number | string;
  event_uuid: string;
  client_id: number | string;
  device_id: number | string | null;
  app_version: string | null;
  fingerprint_hash: string;
  error_message: string | null;
  stack_trace: string | null;
  occurrence_count: number | string;
  first_seen_at: string | null;
  last_seen_at: string | null;
  context_json: string | null;
  created_at: string;
  client_email: string | null;
  client_name: string | null;
  device_label: string | null;
  display_name: string | null;
  device_uniq: string | null;
  device_os: string | null;
  device_os_version: string | null;
  device_current_version: string | null;
}

interface ErrorClient {
  client_id: number | string;
  client_name: string | null;
  client_email: string | null;
  report_count: number | string;
}

type ExportShape = 'reports' | 'groups';
type Cell = string | number | null | undefined;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (what <input type="date"> uses). */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local midnight of a YYYY-MM-DD day (+ offset days), as a UTC MySQL datetime. */
function localDayStartUtc(day: string, offsetDays = 0): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d + offsetDays).toISOString().slice(0, 19).replace('T', ' ');
}

const osOf = (r: ExportReport) =>
  r.device_os ? `${r.device_os}${r.device_os_version ? ` ${r.device_os_version}` : ''}` : '';
const deviceOf = (r: ExportReport) => r.display_name || r.device_label || '';
const licenseeOf = (r: ExportReport) => r.client_name || r.client_email || `licensee #${r.client_id}`;

/**
 * Excel-friendly CSV (same convention as the Simulation runs export): ';'
 * separator, UTF-8 BOM, quoted cells. Cells are clipped to Excel's 32k limit
 * and text that Excel would read as a formula (device-supplied messages) is
 * neutralised with a leading apostrophe.
 */
function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (s.length > 32000) s = s.slice(0, 32000) + '…';
    if (/^[=+@\t\r]/.test(s)) s = `'${s}`;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}

function reportsCsv(rows: ExportReport[]): string {
  return toCsv(
    [
      'reported_at_utc', 'first_seen_utc', 'last_seen_utc', 'occurrences',
      'licensee_id', 'licensee', 'licensee_email',
      'device_id', 'device', 'device_uniq', 'os', 'app_version', 'device_current_version',
      'source', 'error_message', 'stack_trace', 'context', 'fingerprint', 'event_uuid', 'report_id',
    ],
    rows.map((r) => [
      r.created_at, r.first_seen_at, r.last_seen_at, r.occurrence_count,
      r.client_id, licenseeOf(r), r.client_email,
      r.device_id, deviceOf(r), r.device_uniq, osOf(r), r.app_version, r.device_current_version,
      contextSource(r.context_json), r.error_message, r.stack_trace, r.context_json,
      r.fingerprint_hash, r.event_uuid, r.id,
    ])
  );
}

/**
 * One line per (licensee, device, fingerprint) - the same grouping as the feed.
 * Rows arrive newest first, so the first row seen for a group is its latest
 * report (message, context); an older stack is kept if the latest has none.
 */
function groupsCsv(rows: ExportReport[]): string {
  interface G {
    latest: ExportReport;
    stack: string | null;
    occurrences: number;
    reports: number;
    first: string | null;
    last: string | null;
    versions: Set<string>;
  }
  const groups = new Map<string, G>();
  const minTs = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
  const maxTs = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
  for (const r of rows) {
    const key = `${r.client_id}:${r.device_id ?? 'none'}:${r.fingerprint_hash}`;
    let g = groups.get(key);
    if (!g) {
      g = { latest: r, stack: null, occurrences: 0, reports: 0, first: null, last: null, versions: new Set() };
      groups.set(key, g);
    }
    if (!g.stack && r.stack_trace) g.stack = r.stack_trace;
    g.occurrences += Number(r.occurrence_count) || 0;
    g.reports += 1;
    g.first = minTs(g.first, r.first_seen_at ?? r.created_at);
    g.last = maxTs(g.last, r.last_seen_at ?? r.created_at);
    if (r.app_version) g.versions.add(r.app_version);
  }
  const list = [...groups.values()].sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''));
  return toCsv(
    [
      'last_seen_utc', 'first_seen_utc', 'occurrences', 'reports',
      'licensee_id', 'licensee', 'licensee_email',
      'device_id', 'device', 'device_uniq', 'os', 'app_versions', 'device_current_version',
      'source', 'error_message', 'stack_trace', 'context', 'fingerprint',
    ],
    list.map(({ latest: r, ...g }) => [
      g.last, g.first, g.occurrences, g.reports,
      r.client_id, licenseeOf(r), r.client_email,
      r.device_id, deviceOf(r), r.device_uniq, osOf(r), [...g.versions].join(', '), r.device_current_version,
      contextSource(r.context_json), r.error_message, g.stack, r.context_json, r.fingerprint_hash,
    ])
  );
}

function downloadCsv(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'licensee';

/**
 * Licensee + date range export / delete. Independent of the feed's 200-group
 * cap and day window: export returns every report row in the range (up to
 * 20k); delete removes every report in the range, with no cap.
 */
function ExportPanel({
  days,
  onClose,
  onDeleted,
}: {
  days: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const today = localDay(new Date());
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - days + 1);
    return localDay(d);
  });
  const [to, setTo] = useState(today);
  const [clientId, setClientId] = useState('');
  const [shape, setShape] = useState<ExportShape>('reports');
  const [clients, setClients] = useState<ErrorClient[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const loadClients = async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/telemetry_admin.php?action=error_clients`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setClients(json.data || []);
    } catch {
      setMessage({ kind: 'error', text: 'Could not load the licensee list.' });
    }
  };

  useEffect(() => {
    void loadClients();
  }, []);

  const clientLabel = (c: ErrorClient) => c.client_name || c.client_email || `licensee #${c.client_id}`;
  const rangeValid = from !== '' && to !== '' && from <= to;

  // Count first (dry run) so the confirmation states exactly what goes.
  const removeRange = async () => {
    if (!rangeValid) return;
    const body = {
      mode: 'range',
      from: localDayStartUtc(from),
      to: localDayStartUtc(to, 1),
      ...(clientId ? { client_id: Number(clientId) } : {}),
    };
    try {
      setBusy(true);
      setMessage(null);
      const { count = 0 } = await postDeleteErrors({ ...body, dry_run: true });
      if (count === 0) {
        setMessage({ kind: 'error', text: 'No errors reported in that range.' });
        return;
      }
      const client = clients.find((c) => String(c.client_id) === clientId);
      const ok = window.confirm(
        `Delete ${count} error report${count > 1 ? 's' : ''} permanently?\n\n` +
          `Licensee: ${client ? clientLabel(client) : 'ALL licensees'}\n` +
          `From ${from} to ${to} (included)\n\n` +
          `This cannot be undone. Download the CSV first if you need a copy.`
      );
      if (!ok) return;
      const { deleted = 0 } = await postDeleteErrors(body);
      setMessage({ kind: 'ok', text: `Deleted ${deleted} report${deleted > 1 ? 's' : ''}.` });
      void loadClients();
      onDeleted();
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!rangeValid) return;
    try {
      setBusy(true);
      setMessage(null);
      const params = new URLSearchParams({
        action: 'export_errors',
        from: localDayStartUtc(from),
        to: localDayStartUtc(to, 1), // exclusive: midnight after the "to" day
      });
      if (clientId) params.set('client_id', clientId);
      const res = await authFetch(`${API_BASE_URL}/telemetry_admin.php?${params.toString()}`, {
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Export failed');
      const rows: ExportReport[] = json.data || [];
      if (rows.length === 0) {
        setMessage({ kind: 'error', text: 'No errors reported in that range.' });
        return;
      }
      const client = clients.find((c) => String(c.client_id) === clientId);
      const who = client ? slug(clientLabel(client)) : 'all';
      const csv = shape === 'groups' ? groupsCsv(rows) : reportsCsv(rows);
      downloadCsv(`errors_${who}_${from}_${to}${shape === 'groups' ? '_groups' : ''}.csv`, csv);
      setMessage({
        kind: json.truncated ? 'error' : 'ok',
        text: json.truncated
          ? `Exported the ${rows.length} most recent reports only (limit ${json.cap}). Narrow the range or pick a licensee for a complete file.`
          : `Exported ${rows.length} report${rows.length > 1 ? 's' : ''}.`,
      });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Export failed' });
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300';

  return (
    <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-900">Export or delete errors</p>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1 min-w-[220px]">
          <span className="text-xs font-medium text-slate-500">Licensee</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
            <option value="">All licensees</option>
            {clients.map((c) => (
              <option key={c.client_id} value={String(c.client_id)}>
                {clientLabel(c)} ({c.report_count})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">From</span>
          <input type="date" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">To (included)</span>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">One line per</span>
          <select value={shape} onChange={(e) => setShape(e.target.value as ExportShape)} className={inputCls}>
            <option value="reports">Report (full detail)</option>
            <option value="groups">Error group (as on this page)</option>
          </select>
        </label>
        <button
          onClick={run}
          disabled={busy || !rangeValid}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          {busy ? 'Working…' : 'Download CSV'}
        </button>
        <button
          onClick={removeRange}
          disabled={busy || !rangeValid}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete…
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        Filters on the date each report reached the studio. Times in the file are UTC. Delete
        removes every report matching the licensee and dates (asks for confirmation with the count
        first).
      </p>
      {message && (
        <p className={`text-xs mt-2 ${message.kind === 'ok' ? 'text-green-700' : 'text-amber-700'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

/** Everything stored about one error group, plus the per-occurrence drill-down. */
function ErrorDetailPanel({ row, onDeleted }: { row: FleetErrorRow; onDeleted: () => void }) {
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const context = parseContext(row.context_json);

  // Deletes every report of this group (all dates, not just the page window),
  // so the error disappears from the feed and the device's Errors tab.
  const remove = async () => {
    const ok = window.confirm(
      `Delete this error group permanently?\n\n${row.error_message}\n\n` +
        `${clientName(row)} · ${deviceName(row) || 'unknown device'}\n` +
        `Every report of this error on this device is deleted, whatever its date. This cannot be undone.`
    );
    if (!ok) return;
    try {
      setDeleting(true);
      setDeleteError('');
      await postDeleteErrors({
        mode: 'group',
        client_id: row.client_id,
        device_id: row.device_id,
        fingerprint: row.fingerprint_hash,
      });
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportAsText(row));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - nothing useful to do */
    }
  };

  return (
    <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
      <div className="flex items-center justify-end gap-2">
        {deleteError && <span className="text-xs text-red-600 mr-auto">{deleteError}</span>}
        <button
          onClick={remove}
          disabled={deleting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-red-200 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
        <button
          onClick={copy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? 'Copied' : 'Copy report'}
        </button>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
        <Fact label="Licensee" value={clientName(row)} hint={row.client_email} />
        <Fact
          label="Device"
          value={deviceName(row) || 'unknown'}
          hint={row.device_id ? `#${row.device_id}` : 'no device attached'}
        />
        <Fact
          label="OS"
          value={
            row.device_os
              ? `${row.device_os}${row.device_os_version ? ` ${row.device_os_version}` : ''}`
              : '-'
          }
        />
        <Fact
          label="App version"
          value={row.app_version ? `v${row.app_version}` : '-'}
          hint={
            row.device_current_version && row.device_current_version !== row.app_version
              ? `device now on v${row.device_current_version}`
              : undefined
          }
        />
        <Fact
          label="Occurrences"
          value={String(row.total_count)}
          hint={row.report_count ? `${row.report_count} report(s)` : undefined}
        />
        <Fact label="First seen" value={formatAbsolute(row.first_seen_at)} />
        <Fact
          label="Last seen"
          value={formatAbsolute(row.last_seen_at)}
          hint={formatRelative(row.last_seen_at)}
        />
        <Fact label="Device id" value={row.device_uniq || '-'} mono />
      </dl>

      <div>
        <SectionLabel>Fingerprint</SectionLabel>
        <p className="text-xs font-mono text-slate-600 break-all">{row.fingerprint_hash}</p>
      </div>

      <div>
        <SectionLabel>Context</SectionLabel>
        {context && Object.keys(context).length > 0 ? (
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 bg-slate-50 rounded p-3">
            {Object.entries(context).map(([k, v]) => (
              <Fact
                key={k}
                label={k}
                value={typeof v === 'string' ? v : JSON.stringify(v)}
                mono
              />
            ))}
          </dl>
        ) : (
          <p className="text-xs text-slate-400 italic">
            No context recorded by the reporting device.
          </p>
        )}
      </div>

      <div>
        <SectionLabel>Stack trace</SectionLabel>
        {row.stack_trace ? (
          <pre className="text-xs text-slate-700 bg-slate-50 p-3 rounded overflow-x-auto whitespace-pre-wrap break-all">
            {row.stack_trace}
          </pre>
        ) : (
          <p className="text-xs text-slate-400 italic">
            No stack trace — the app captured this error as a bare message (a rejected promise or a
            thrown string carries no stack).
          </p>
        )}
      </div>

      <OccurrenceHistory row={row} />
    </div>
  );
}

/**
 * Individual report rows behind the group, fetched on demand. Each row is one
 * delivered outbox event, so it dates a distinct episode on that device - the
 * cheapest way to tell "crashed once, months ago" from "crashing every day".
 */
function OccurrenceHistory({ row }: { row: FleetErrorRow }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ErrorOccurrence[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (items !== null || loading) return;
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        action: 'error_detail',
        client_id: String(row.client_id),
        fingerprint: row.fingerprint_hash,
      });
      if (row.device_id) params.set('device_id', String(row.device_id));
      const res = await authFetch(`${API_BASE_URL}/telemetry_admin.php?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch occurrences');
      const json = await res.json();
      setItems(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load occurrences');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  return (
    <div>
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Occurrence history
      </button>

      {open && (
        <div className="mt-2">
          {loading && <p className="text-xs text-slate-400">Loading…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {items && items.length === 0 && (
            <p className="text-xs text-slate-400 italic">No individual reports found.</p>
          )}
          {items && items.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Reported</th>
                    <th className="text-left px-3 py-2 font-medium">First seen</th>
                    <th className="text-left px-3 py-2 font-medium">Last seen</th>
                    <th className="text-right px-3 py-2 font-medium">Count</th>
                    <th className="text-left px-3 py-2 font-medium">Version</th>
                    <th className="text-left px-3 py-2 font-medium">Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((o) => (
                    <tr key={o.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{formatAbsolute(o.created_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                        {formatAbsolute(o.first_seen_at)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                        {formatAbsolute(o.last_seen_at)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-700">
                        ×{o.occurrence_count}
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap">
                        {o.app_version ? `v${o.app_version}` : '-'}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500 break-all">
                        {o.context_json || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs uppercase text-slate-400 font-medium mb-1">{children}</p>;
}

function Fact({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string;
  hint?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase text-slate-400 font-medium">{label}</dt>
      <dd
        className={`text-slate-900 break-words ${mono ? 'font-mono text-[11px]' : 'text-xs'}`}
        title={value}
      >
        {value || '-'}
      </dd>
      {hint && <dd className="text-[10px] text-slate-400 break-words">{hint}</dd>}
    </div>
  );
}
