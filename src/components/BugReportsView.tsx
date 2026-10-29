import { useEffect, useMemo, useState } from 'react';
import {
  Bug,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Search,
  AlertTriangle,
} from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// Licensee bug reports sent from the playground's launched-games page ("Report
// a problem" next to Raw Data). Wire + storage: telemetry.php ingestBugReport,
// bug_reports_admin.php. Design: project_bug_report_button.

type Status = 'new' | 'in_progress' | 'resolved';
type StatusFilter = 'open' | Status | 'all';

interface ConcernedTeam {
  id: number;
  team_number: number;
  team_name: string | null;
}

interface BugReportRow {
  id: number;
  event_uuid: string;
  client_id: number;
  device_id: number | null;
  app_version: string | null;
  launched_game_id: number | null;
  game_name: string | null;
  game_type: string | null;
  scenario_uniqid: string | null;
  game_started_at: string | null;
  comment: string;
  teams_concerned_json: string | null;
  contact: string | null;
  device_role: string | null;
  snapshot_error: string | null;
  snapshot_truncated: number | string;
  snapshot_purged_at: string | null;
  status: Status;
  admin_note: string | null;
  reported_at: string | null;
  resolved_at: string | null;
  created_at: string;
  has_snapshot: number | string;
  snapshot_bytes: number | string | null;
  client_name: string | null;
  client_email: string | null;
  device_display_name: string | null;
  device_label: string | null;
  device_os: string | null;
  device_os_version: string | null;
}

/** Shape built by the playground (services/bugReport.ts buildSnapshot). */
interface Snapshot {
  schema?: number;
  captured_at?: string;
  game?: Record<string, unknown>;
  scenario?: Record<string, unknown> | null;
  meta?: Record<string, string> | null;
  meta_error?: string;
  teams?: Array<{
    id: number;
    team_number: number;
    team_name: string | null;
    pattern: number;
    score: number;
    key_id: number | null;
    start_time: number | null;
    end_time: number | null;
    language: string | null;
  }>;
  raw_punches?: Array<{ id: number; device_id: number; raw_data: unknown; created_at: string }>;
  raw_punch_total?: number;
  devices?: Array<Record<string, unknown>> | null;
  device?: Record<string, unknown>;
  console_log?: Array<{ t: string; level: string; msg: string }>;
}

interface RelatedError {
  id: number;
  device_id: number | null;
  app_version: string | null;
  error_message: string | null;
  stack_trace: string | null;
  occurrence_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  context_json: string | null;
  device_display_name: string | null;
  device_label: string | null;
}

interface Detail {
  data: BugReportRow & { snapshot_json: string | null };
  errors: RelatedError[];
  errors_window: { from: string; to: string };
}

const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

const STATUS_CLASS: Record<Status, string> = {
  new: 'bg-red-50 text-red-700 border-red-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved: 'bg-green-50 text-green-700 border-green-200',
};

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

function clientName(r: BugReportRow): string {
  return r.client_name || r.client_email || `licensee #${r.client_id}`;
}

function deviceName(r: BugReportRow): string {
  return r.device_display_name || r.device_label || 'unknown device';
}

function formatAbsolute(iso: string | null | undefined): string {
  if (!iso) return '-';
  // Same convention as RecentErrorsView: MySQL DATETIME read as UTC.
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatBytes(n: number | string | null): string {
  const v = Number(n ?? 0);
  if (!v) return '-';
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  return `${(v / 1024 / 1024).toFixed(2)} MB`;
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function concernedTeams(r: BugReportRow): ConcernedTeam[] {
  return parseJson<ConcernedTeam[]>(r.teams_concerned_json) ?? [];
}

function teamLabel(t: { team_number: number; team_name: string | null }): string {
  return t.team_name ? `${t.team_name} (#${t.team_number})` : `#${t.team_number}`;
}

export function BugReportsView() {
  const [rows, setRows] = useState<BugReportRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('open');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);

  const fetchReports = async (status = filter) => {
    try {
      setLoading(true);
      setError('');
      const res = await authFetch(`${API_BASE_URL}/bug_reports_admin.php?action=list&status=${status}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch bug reports');
      const json = await res.json();
      setRows(json.data || []);
      const c: Record<string, number> = {};
      for (const row of (json.counts || []) as Array<{ status: string; n: number | string }>) {
        c[row.status] = Number(row.n);
      }
      setCounts(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load bug reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchReports(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter((r) =>
      [
        r.comment,
        clientName(r),
        r.client_email,
        deviceName(r),
        r.game_name,
        r.game_type,
        r.contact,
        r.admin_note,
        r.app_version,
        ...concernedTeams(r).map(teamLabel),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, query]);

  const countFor = (key: StatusFilter): number | null => {
    if (key === 'all') return Object.values(counts).reduce((a, b) => a + b, 0);
    if (key === 'open') return (counts.new ?? 0) + (counts.in_progress ?? 0);
    return counts[key] ?? 0;
  };

  // Status / note edits come back from the detail panel; patch the row in place
  // rather than refetching (it may now fall outside the current filter, which
  // is fine until the next refresh - the admin sees what they just did).
  const patchRow = (id: number, patch: Partial<BugReportRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <p className="text-sm text-slate-600">
          Problems reported by licensees from the playground's launched-games page. Each new report is
          also emailed to support.
        </p>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  filter === f.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {f.label}
                <span className="ml-1.5 text-xs opacity-60">{countFor(f.key)}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchReports()}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">Refresh</span>
          </button>
        </div>
      </div>

      <div className="relative mb-6">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by comment, licensee, device, game, team, contact or note…"
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
          <Bug className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">
            {query.trim() !== '' ? `No report matches “${query}”.` : 'No bug report here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((r) => {
            const open = openId === r.id;
            const teams = concernedTeams(r);
            return (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200">
                <button
                  onClick={() => setOpenId(open ? null : r.id)}
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
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium rounded border shrink-0 ${STATUS_CLASS[r.status]}`}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                        <p className={`text-sm font-medium text-slate-900 ${open ? 'break-words' : 'truncate'}`}>
                          {r.comment}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 pl-6">
                        {clientName(r)} · {deviceName(r)}
                        {r.device_role && <span className="text-slate-400"> ({r.device_role})</span>}
                        {r.app_version && <span className="ml-2 font-mono">v{r.app_version}</span>}
                      </p>
                      <p className="text-xs text-slate-600 mt-1 pl-6">
                        {r.game_name || 'unknown game'}
                        {r.game_type && <span className="text-slate-400"> · {r.game_type}</span>}
                        {teams.length > 0 && (
                          <span className="text-slate-500"> · teams: {teams.map(teamLabel).join(', ')}</span>
                        )}
                      </p>
                      {r.snapshot_error && (
                        <p className="text-xs text-amber-700 mt-1 pl-6 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Snapshot unavailable
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-slate-500 shrink-0">
                      <div>{formatAbsolute(r.reported_at || r.created_at)}</div>
                      <div className="mt-1 text-slate-400">#{r.id}</div>
                    </div>
                  </div>
                </button>
                {open && <BugReportDetail row={r} onPatched={(p) => patchRow(r.id, p)} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BugReportDetail({
  row,
  onPatched,
}: {
  row: BugReportRow;
  onPatched: (patch: Partial<BugReportRow>) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState(row.admin_note ?? '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const res = await authFetch(`${API_BASE_URL}/bug_reports_admin.php?action=detail&id=${row.id}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load report');
        const json = (await res.json()) as Detail;
        if (!cancelled) setDetail(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.id]);

  const update = async (body: { status?: Status; admin_note?: string }) => {
    try {
      setSaving(true);
      setError('');
      const res = await authFetch(`${API_BASE_URL}/bug_reports_admin.php?action=update`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Update failed');
      onPatched(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const snapshot = parseJson<Snapshot>(detail?.data.snapshot_json);

  const copyJson = async () => {
    if (!detail) return;
    const full = {
      ...detail.data,
      snapshot_json: undefined,
      snapshot,
      related_errors: detail.errors,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(full, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const teams = concernedTeams(row);

  return (
    <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-slate-400 mr-1">Status</span>
          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
            <button
              key={s}
              disabled={saving || row.status === s}
              onClick={() => void update({ status: s })}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:cursor-default ${
                row.status === s ? STATUS_CLASS[s] : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <button
          onClick={copyJson}
          disabled={!detail}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div>
        <SectionLabel>Comment</SectionLabel>
        <p className="text-sm text-slate-900 whitespace-pre-wrap break-words bg-slate-50 rounded p-3">{row.comment}</p>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
        <Fact label="Licensee" value={clientName(row)} hint={row.client_email} />
        <Fact label="Contact" value={row.contact || '-'} />
        <Fact label="Device" value={deviceName(row)} hint={row.device_role ? `role: ${row.device_role}` : undefined} />
        <Fact
          label="OS / app"
          value={`${row.device_os || '-'}${row.device_os_version ? ` ${row.device_os_version}` : ''}`}
          hint={row.app_version ? `v${row.app_version}` : undefined}
        />
        <Fact label="Game" value={row.game_name || '-'} hint={row.launched_game_id ? `#${row.launched_game_id}` : undefined} />
        <Fact label="Type" value={row.game_type || '-'} hint={row.scenario_uniqid} />
        <Fact label="Game started" value={formatAbsolute(row.game_started_at)} />
        <Fact label="Reported" value={formatAbsolute(row.reported_at || row.created_at)} hint={row.resolved_at ? `resolved ${formatAbsolute(row.resolved_at)}` : undefined} />
        <Fact label="Teams concerned" value={teams.length > 0 ? teams.map(teamLabel).join(', ') : '-'} />
        <Fact label="Snapshot" value={formatBytes(row.snapshot_bytes)} hint={Number(row.snapshot_truncated) ? 'truncated: oldest punches dropped' : undefined} />
      </dl>

      <div>
        <SectionLabel>Internal note</SectionLabel>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Only visible to admins"
          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        />
        <div className="flex justify-end mt-1">
          <button
            disabled={saving || note === (row.admin_note ?? '')}
            onClick={() => void update({ admin_note: note })}
            className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg disabled:opacity-40"
          >
            Save note
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading snapshot…</p>
      ) : detail ? (
        <>
          {row.snapshot_error && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs">
              The device could not load the game data when the report was sent: {row.snapshot_error}
            </div>
          )}
          {row.snapshot_purged_at && (
            <p className="text-xs text-slate-400 italic">
              Snapshot purged on {formatAbsolute(row.snapshot_purged_at)} (6 months after resolution).
            </p>
          )}
          {snapshot && <SnapshotView snapshot={snapshot} concerned={new Set(teams.map((t) => t.id))} />}
          <RelatedErrors errors={detail.errors} window={detail.errors_window} />
        </>
      ) : null}
    </div>
  );
}

function SnapshotView({ snapshot, concerned }: { snapshot: Snapshot; concerned: Set<number> }) {
  const teams = snapshot.teams ?? [];
  const punches = snapshot.raw_punches ?? [];
  const log = snapshot.console_log ?? [];
  return (
    <div className="space-y-4">
      {snapshot.device && (
        <Collapsible title="Device & network" defaultOpen>
          <KeyValues obj={snapshot.device} />
        </Collapsible>
      )}

      <Collapsible title={`Teams (${teams.length})`} defaultOpen>
        {teams.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No team.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">#</th>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-right px-3 py-2 font-medium">Score</th>
                  <th className="text-left px-3 py-2 font-medium">Pattern</th>
                  <th className="text-left px-3 py-2 font-medium">Chip</th>
                  <th className="text-left px-3 py-2 font-medium">Start</th>
                  <th className="text-left px-3 py-2 font-medium">End</th>
                  <th className="text-left px-3 py-2 font-medium">Lang</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teams.map((t) => (
                  <tr key={t.id} className={concerned.has(t.id) ? 'bg-amber-50' : ''}>
                    <td className="px-3 py-1.5">{t.team_number}</td>
                    <td className="px-3 py-1.5 font-medium">{t.team_name || '-'}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{t.score}</td>
                    <td className="px-3 py-1.5">{t.pattern}</td>
                    <td className="px-3 py-1.5 font-mono">{t.key_id ?? '-'}</td>
                    <td className="px-3 py-1.5 font-mono">{epochLabel(t.start_time)}</td>
                    <td className="px-3 py-1.5 font-mono">{epochLabel(t.end_time)}</td>
                    <td className="px-3 py-1.5">{t.language || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Collapsible>

      <Collapsible
        title={`Raw punches (${punches.length}${
          snapshot.raw_punch_total && snapshot.raw_punch_total > punches.length ? ` of ${snapshot.raw_punch_total}` : ''
        })`}
      >
        <PunchTable punches={punches} />
      </Collapsible>

      {snapshot.game && (
        <Collapsible title="Launched game">
          <KeyValues obj={snapshot.game} />
          {snapshot.scenario && (
            <div className="mt-3">
              <SectionLabel>Scenario on the device</SectionLabel>
              <KeyValues obj={snapshot.scenario} />
            </div>
          )}
        </Collapsible>
      )}

      <Collapsible title={`Game configuration (${Object.keys(snapshot.meta ?? {}).length} keys)`}>
        {snapshot.meta_error && <p className="text-xs text-amber-700 mb-2">Could not load: {snapshot.meta_error}</p>}
        <KeyValues obj={snapshot.meta ?? {}} />
      </Collapsible>

      {snapshot.devices && snapshot.devices.length > 0 && (
        <Collapsible title={`Devices in the game (${snapshot.devices.length})`}>
          <pre className="text-[11px] text-slate-700 bg-slate-50 p-3 rounded overflow-x-auto">
            {JSON.stringify(snapshot.devices, null, 2)}
          </pre>
        </Collapsible>
      )}

      <Collapsible title={`Console log of the reporting device (${log.length})`}>
        {log.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No warning or error logged since the app started.</p>
        ) : (
          <pre className="text-[11px] text-slate-700 bg-slate-50 p-3 rounded overflow-x-auto max-h-96 whitespace-pre-wrap break-all">
            {log.map((l) => `${l.t} ${l.level.toUpperCase().padEnd(5)} ${l.msg}`).join('\n')}
          </pre>
        )}
      </Collapsible>
    </div>
  );
}

function epochLabel(v: number | null): string {
  if (v == null || !v) return '-';
  // Team start/end are epoch seconds (or ms on older builds).
  const ms = v > 1e12 ? v : v * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleTimeString();
}

function PunchTable({ punches }: { punches: NonNullable<Snapshot['raw_punches']> }) {
  const [openRow, setOpenRow] = useState<number | null>(null);
  if (punches.length === 0) return <p className="text-xs text-slate-400 italic">No punch recorded.</p>;
  return (
    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[32rem] overflow-y-auto">
      {punches.map((p) => {
        const card = (p.raw_data && typeof p.raw_data === 'object' ? p.raw_data : {}) as {
          id?: number;
          punches?: Array<{ code?: number }>;
        };
        const codes = Array.isArray(card.punches) ? card.punches.map((x) => x?.code).filter((c) => c != null) : [];
        const open = openRow === p.id;
        return (
          <div key={p.id}>
            <button
              onClick={() => setOpenRow(open ? null : p.id)}
              className="w-full flex items-center gap-3 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
            >
              {open ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
              <span className="font-mono text-slate-400">#{p.id}</span>
              <span className="font-medium">Chip {card.id ?? '-'}</span>
              <span className="text-slate-500 font-mono truncate">[{codes.join(', ')}]</span>
              <span className="ml-auto text-slate-400 whitespace-nowrap">{formatAbsolute(p.created_at)}</span>
              <span className="text-slate-400 font-mono">dev {p.device_id}</span>
            </button>
            {open && (
              <pre className="text-[11px] text-slate-700 bg-slate-50 px-3 py-2 overflow-x-auto">
                {JSON.stringify(p.raw_data, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RelatedErrors({ errors, window }: { errors: RelatedError[]; window: { from: string; to: string } }) {
  return (
    <Collapsible title={`Automatic error reports from the licensee's devices (${errors.length})`} defaultOpen={errors.length > 0}>
      <p className="text-[11px] text-slate-400 mb-2">
        Between {formatAbsolute(window.from)} and {formatAbsolute(window.to)}, all devices of this licensee.
      </p>
      {errors.length === 0 ? (
        <p className="text-xs text-slate-400 italic">None.</p>
      ) : (
        <div className="space-y-2">
          {errors.map((e) => (
            <div key={e.id} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-medium text-slate-900 break-words">{e.error_message}</p>
                <span className="text-xs font-semibold text-slate-600 shrink-0">×{e.occurrence_count}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {e.device_display_name || e.device_label || 'unknown device'}
                {e.app_version && <span className="ml-2 font-mono">v{e.app_version}</span>}
                <span className="ml-2">{formatAbsolute(e.last_seen_at)}</span>
              </p>
              {e.context_json && <p className="text-[11px] font-mono text-slate-400 mt-1 break-all">{e.context_json}</p>}
              {e.stack_trace && (
                <pre className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded mt-2 overflow-x-auto whitespace-pre-wrap break-all">
                  {e.stack_trace}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </Collapsible>
  );
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors mb-2"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        {title}
      </button>
      {open && children}
    </div>
  );
}

function KeyValues({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return <p className="text-xs text-slate-400 italic">Empty.</p>;
  return (
    <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 bg-slate-50 rounded p-3">
      {entries.map(([k, v]) => (
        <Fact key={k} label={k} value={v == null ? '-' : typeof v === 'string' ? v : JSON.stringify(v)} mono />
      ))}
    </dl>
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
      <dd className={`text-slate-900 break-words ${mono ? 'font-mono text-[11px]' : 'text-xs'}`} title={value}>
        {value || '-'}
      </dd>
      {hint && <dd className="text-[10px] text-slate-400 break-words">{hint}</dd>}
    </div>
  );
}
