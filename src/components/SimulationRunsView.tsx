// Admin: Playground game-simulator test runs (coverage tracking + triage).
// Writers are Playground tester installs (backend/api/simulation_runs.php).
// Admins triage runs here (new -> analysed -> resolved, with a note), link
// retries (a run's child runs), delete, export with filters and import an
// edited export back (preview first). The gap list (configs never tested)
// lives in the Playground Coverage tab, which owns the per-game axes.

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FlaskConical,
  GitBranch,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Unlink,
  Upload,
  X,
} from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

type Verdict = 'pass' | 'fail' | 'partial';
type Triage = 'new' | 'analysed' | 'resolved';

interface SimulationRun {
  id: number;
  client_id: number;
  client_name: string | null;
  client_email: string | null;
  device_label: string | null;
  game_type: string;
  config_key: string;
  config: Record<string, string>;
  scenario_title: string | null;
  app_version: string;
  seed: number;
  speed: number;
  devices_count: number;
  teams_count: number;
  reads_total: number;
  reads_done: number;
  read_errors: number;
  verdict: Verdict;
  note: string | null;
  tester_name: string | null;
  created_at: string;
  triage_status: Triage | null;
  analysed_at: string | null;
  analysed_by_name: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  triage_note: string | null;
  /** This run is a retry of that run (its parent). */
  parent_run_id: number | null;
}

const VERDICTS: Verdict[] = ['pass', 'partial', 'fail'];
const TRIAGES: Triage[] = ['new', 'analysed', 'resolved'];
const HIDE_RESOLVED_KEY = 'simulationRuns.hideResolved';

const VERDICT_STYLE: Record<Verdict, string> = {
  pass: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  fail: 'bg-red-100 text-red-800',
};
const TRIAGE_STYLE: Record<Triage, string> = {
  new: 'bg-slate-100 text-slate-700',
  analysed: 'bg-sky-100 text-sky-800',
  resolved: 'bg-emerald-100 text-emerald-800',
};
const TRIAGE_LABEL: Record<Triage, string> = { new: 'New', analysed: 'Analysed', resolved: 'Resolved' };

const triageOf = (r: SimulationRun): Triage => r.triage_status ?? 'new';
const testerOf = (r: SimulationRun) => r.tester_name || r.client_name || r.client_email || '—';
/** "YYYY-MM-DD" of a server timestamp ("YYYY-MM-DD HH:MM:SS"), for range filters. */
const day = (ts: string | null) => (ts ? ts.slice(0, 10) : null);

/** Numeric-aware version compare ("1.1.124" > "1.1.99"). */
function cmpVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function configLabel(config: Record<string, string>): string {
  return Object.entries(config)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(' · ');
}

const fmt = (ts: string | null) => (ts ? new Date(ts.replace(' ', 'T')).toLocaleString() : '');

// ── export ──

const CSV_COLUMNS: Array<[string, (r: SimulationRun) => string | number | null]> = [
  ['id', (r) => r.id],
  ['created_at', (r) => r.created_at],
  ['game_type', (r) => r.game_type],
  ['config', (r) => configLabel(r.config)],
  ['config_key', (r) => r.config_key],
  ['verdict', (r) => r.verdict],
  ['note', (r) => r.note],
  ['status', (r) => triageOf(r)],
  ['analysed_at', (r) => r.analysed_at],
  ['analysed_by', (r) => r.analysed_by_name],
  ['resolved_at', (r) => r.resolved_at],
  ['resolved_by', (r) => r.resolved_by_name],
  ['triage_note', (r) => r.triage_note],
  ['parent_run_id', (r) => r.parent_run_id],
  ['app_version', (r) => r.app_version],
  ['scenario', (r) => r.scenario_title],
  ['seed', (r) => r.seed],
  ['speed', (r) => r.speed],
  ['devices', (r) => r.devices_count],
  ['teams', (r) => r.teams_count],
  ['reads_done', (r) => r.reads_done],
  ['reads_total', (r) => r.reads_total],
  ['read_errors', (r) => r.read_errors],
  ['tester', (r) => testerOf(r)],
  ['licensee', (r) => r.client_name || r.client_email],
  ['device', (r) => r.device_label],
];

/** Excel-friendly CSV: ';' separator (FR locale), UTF-8 BOM, quoted cells. */
function runsToCsv(rows: SimulationRun[]): string {
  const cell = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    CSV_COLUMNS.map(([h]) => h).join(';'),
    ...rows.map((r) => CSV_COLUMNS.map(([, get]) => cell(get(r))).join(';')),
  ];
  return '\ufeff' + lines.join('\r\n');
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── import ──

/** Columns the import may update (matched by run id). Others are ignored. */
const IMPORT_KEYS = ['status', 'triage_note', 'verdict', 'note', 'analysed_at', 'resolved_at', 'parent_run_id'] as const;
/** Header aliases (JSON exports use the API names, people rename columns). */
const IMPORT_ALIASES: Record<string, string> = {
  triage_status: 'status',
  retry_of: 'parent_run_id',
  parent: 'parent_run_id',
  parent_id: 'parent_run_id',
};

/** RFC-4180-ish CSV parser: quotes, "" escapes, CRLF, ';' or ',' (auto). */
function parseCsv(text: string): string[][] {
  const t = text.replace(/^\ufeff/, '');
  const firstLine = t.split(/\r?\n/, 1)[0] ?? '';
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/** File -> [{id, <updatable keys present in the file>}]. */
function parseImportFile(name: string, text: string): Array<Record<string, string | number | null>> {
  const norm = (k: string) => {
    const key = k.trim().toLowerCase();
    return IMPORT_ALIASES[key] ?? key;
  };
  const pick = (o: Record<string, unknown>) => {
    const out: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(o)) {
      const key = norm(k);
      if (key === 'id') out.id = Number(v);
      else if ((IMPORT_KEYS as readonly string[]).includes(key)) out[key] = v === null || v === undefined ? '' : String(v);
    }
    return out;
  };
  if (name.toLowerCase().endsWith('.json') || text.trim().startsWith('[') || text.trim().startsWith('{')) {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : Array.isArray(data?.runs) ? data.runs : [];
    return list.map((o: Record<string, unknown>) => pick(o)).filter((r: Record<string, unknown>) => Number(r.id) > 0);
  }
  const [header, ...lines] = parseCsv(text);
  if (!header) return [];
  return lines
    .map((cells) => pick(Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']))))
    .filter((r) => Number(r.id) > 0);
}

interface ImportResultRow {
  id: number;
  changes: Record<string, [string | null, string | null]>;
  error: string | null;
}

function ImportDialog({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Array<Record<string, string | number | null>>>([]);
  const [preview, setPreview] = useState<ImportResultRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setError(null);
    setPreview(null);
    setFileName(file.name);
    try {
      const parsed = parseImportFile(file.name, await file.text());
      if (parsed.length === 0) throw new Error('No row with a run id was found in this file.');
      setRows(parsed);
      setBusy(true);
      setPreview((await callWith(parsed, true)).rows);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };
  // Sends the given rows (onFile passes the freshly parsed ones: state isn't updated yet).
  const callWith = async (r: typeof rows, dryRun: boolean) => {
    const res = await authFetch(`${API_BASE_URL}/simulation_runs.php?action=admin_import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: r, dry_run: dryRun }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data as { rows: ImportResultRow[]; updated: number };
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      await callWith(rows, false);
      onApplied();
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const changed = preview?.filter((r) => !r.error && Object.keys(r.changes).length > 0) ?? [];
  const failed = preview?.filter((r) => r.error) ?? [];
  const unchanged = (preview?.length ?? 0) - changed.length - failed.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import run updates</h2>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-800" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-600">
          Import a CSV or JSON exported from this page (edited in Excel, for instance). Runs are matched by{' '}
          <code>id</code>; only these columns are applied: <code>status</code>, <code>triage_note</code>,{' '}
          <code>verdict</code>, <code>note</code>, <code>analysed_at</code>, <code>resolved_at</code>,{' '}
          <code>parent_run_id</code> (retry of). A column missing from the file is left untouched; an empty cell
          clears the value. You see every change before anything is saved.
        </p>
        <label className="flex items-center gap-3 text-sm">
          <span className="px-3 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer">
            Choose a file…
          </span>
          <span className="text-slate-500">{fileName || 'CSV (; or ,) or JSON'}</span>
          <input
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = '';
            }}
          />
        </label>

        {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
        {busy && !preview && <div className="text-sm text-slate-500">Checking the file…</div>}

        {preview && (
          <>
            <div className="text-sm text-slate-700">
              {changed.length} run{changed.length === 1 ? '' : 's'} will change · {unchanged} unchanged
              {failed.length > 0 && <span className="text-red-600"> · {failed.length} with errors (skipped)</span>}
            </div>
            <div className="border border-slate-200 rounded-lg max-h-[45vh] overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500 sticky top-0">
                  <tr>
                    <th className="p-2">Run</th>
                    <th className="p-2">Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...failed, ...changed].map((r, i) => (
                    <tr key={`${r.id}-${i}`} className="border-t border-slate-100 align-top">
                      <td className="p-2 font-mono">#{r.id}</td>
                      <td className="p-2">
                        {r.error ? (
                          <span className="text-red-600">{r.error}</span>
                        ) : (
                          Object.entries(r.changes).map(([k, [a, b]]) => (
                            <div key={k}>
                              <span className="text-slate-500">{k}:</span>{' '}
                              <span className="line-through text-slate-400">{a ?? '∅'}</span> →{' '}
                              <span className="text-slate-800">{b ?? '∅'}</span>
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                  {changed.length + failed.length === 0 && (
                    <tr>
                      <td colSpan={2} className="p-3 text-slate-500">
                        Nothing to change: the file matches the current runs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => void apply()}
                disabled={busy || changed.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40"
              >
                <Upload className="w-4 h-4" />
                {busy ? 'Applying…' : `Apply ${changed.length} change${changed.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type DateField = 'created' | 'analysed' | 'resolved';

interface ExportFilters {
  dateField: DateField;
  from: string;
  to: string;
  statuses: Set<Triage>;
  verdicts: Set<Verdict>;
  testers: Set<string>;
  gameTypes: Set<string>;
  versions: Set<string>;
  onlySelected: boolean;
  format: 'csv' | 'json';
}

function applyExportFilters(runs: SimulationRun[], f: ExportFilters, selected: Set<number>): SimulationRun[] {
  return runs.filter((r) => {
    if (f.onlySelected && !selected.has(r.id)) return false;
    if (!f.statuses.has(triageOf(r))) return false;
    if (!f.verdicts.has(r.verdict)) return false;
    if (!f.testers.has(testerOf(r))) return false;
    if (!f.gameTypes.has(r.game_type)) return false;
    if (!f.versions.has(r.app_version)) return false;
    if (f.from || f.to) {
      const d = day(f.dateField === 'created' ? r.created_at : f.dateField === 'analysed' ? r.analysed_at : r.resolved_at);
      // A date range on "analysed" / "resolved" only keeps runs that reached that step.
      if (!d) return false;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
    }
    return true;
  });
}

function ChipSet<T extends string>({
  label,
  all,
  value,
  onChange,
  render,
}: {
  label: string;
  all: T[];
  value: Set<T>;
  onChange: (next: Set<T>) => void;
  render?: (v: T) => string;
}) {
  const toggle = (v: T) => {
    const next = new Set(value);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(next);
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <button className="text-xs text-slate-500 underline" onClick={() => onChange(new Set(all))}>
          all
        </button>
        <button className="text-xs text-slate-500 underline" onClick={() => onChange(new Set())}>
          none
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {all.length === 0 && <span className="text-xs text-slate-400">—</span>}
        {all.map((v) => (
          <button
            key={v}
            onClick={() => toggle(v)}
            className={`px-2.5 py-1 text-xs rounded-full border ${
              value.has(v) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            {render ? render(v) : v}
          </button>
        ))}
      </div>
    </div>
  );
}

function ExportDialog({
  runs,
  selected,
  onClose,
}: {
  runs: SimulationRun[];
  selected: Set<number>;
  onClose: () => void;
}) {
  const testers = useMemo(() => Array.from(new Set(runs.map(testerOf))).sort(), [runs]);
  const gameTypes = useMemo(() => Array.from(new Set(runs.map((r) => r.game_type))).sort(), [runs]);
  const versions = useMemo(
    () => Array.from(new Set(runs.map((r) => r.app_version))).sort((a, b) => cmpVersion(b, a)),
    [runs],
  );
  const [f, setF] = useState<ExportFilters>(() => ({
    dateField: 'created',
    from: '',
    to: '',
    statuses: new Set(TRIAGES),
    verdicts: new Set(VERDICTS),
    testers: new Set(testers),
    gameTypes: new Set(gameTypes),
    versions: new Set(versions),
    onlySelected: selected.size > 0,
    format: 'csv',
  }));
  const rows = useMemo(() => applyExportFilters(runs, f, selected), [runs, f, selected]);

  const doExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const range = f.from || f.to ? `-${f.dateField}-${f.from || 'start'}_${f.to || 'now'}` : '';
    const name = `simulation-runs${range}-${stamp}.${f.format}`;
    if (f.format === 'csv') download(name, runsToCsv(rows), 'text/csv;charset=utf-8');
    else download(name, JSON.stringify(rows, null, 2), 'application/json');
    onClose();
  };

  const set = <K extends keyof ExportFilters>(k: K, v: ExportFilters[K]) => setF((p) => ({ ...p, [k]: v }));
  const input = 'px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Export simulation runs</h2>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-800" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div>
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">Date range</div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select className={input} value={f.dateField} onChange={(e) => set('dateField', e.target.value as DateField)}>
              <option value="created">Run date</option>
              <option value="analysed">Analysed date</option>
              <option value="resolved">Resolved date</option>
            </select>
            <span className="text-slate-500">from</span>
            <input type="date" className={input} value={f.from} onChange={(e) => set('from', e.target.value)} />
            <span className="text-slate-500">to</span>
            <input type="date" className={input} value={f.to} onChange={(e) => set('to', e.target.value)} />
            {(f.from || f.to) && (
              <button
                className="text-xs text-slate-500 underline"
                onClick={() => setF((p) => ({ ...p, from: '', to: '' }))}
              >
                clear
              </button>
            )}
          </div>
          {(f.from || f.to) && f.dateField !== 'created' && (
            <p className="text-xs text-slate-400 mt-1">Only runs that were {f.dateField} in this range are kept.</p>
          )}
        </div>

        <ChipSet label="Status" all={TRIAGES} value={f.statuses} onChange={(v) => set('statuses', v)} render={(v) => TRIAGE_LABEL[v]} />
        <ChipSet label="Verdict" all={VERDICTS} value={f.verdicts} onChange={(v) => set('verdicts', v)} />
        <ChipSet label="Game type" all={gameTypes} value={f.gameTypes} onChange={(v) => set('gameTypes', v)} />
        <ChipSet label="Tester" all={testers} value={f.testers} onChange={(v) => set('testers', v)} />
        <ChipSet label="App version" all={versions} value={f.versions} onChange={(v) => set('versions', v)} />

        <div className="flex flex-wrap items-center gap-4 text-sm">
          {selected.size > 0 && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.onlySelected} onChange={(e) => set('onlySelected', e.target.checked)} />
              Only the {selected.size} selected run{selected.size > 1 ? 's' : ''}
            </label>
          )}
          <label className="flex items-center gap-2">
            <input type="radio" checked={f.format === 'csv'} onChange={() => set('format', 'csv')} />
            CSV (Excel)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={f.format === 'json'} onChange={() => set('format', 'json')} />
            JSON
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-sm text-slate-600">
            {rows.length} run{rows.length === 1 ? '' : 's'} match{rows.length === 1 ? 'es' : ''}
          </span>
          <button
            onClick={doExport}
            disabled={rows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            Export {rows.length}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── page ──

export function SimulationRunsView() {
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameType, setGameType] = useState<string>('all');
  const [triageFilter, setTriageFilter] = useState<Triage | 'all'>('all');
  const [verdictFilter, setVerdictFilter] = useState<Verdict | 'all'>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'configs' | 'runs'>('runs');
  /** Selected run ids (a config row selects all its runs). */
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [triageNote, setTriageNote] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [retryFilter, setRetryFilter] = useState<'all' | 'retried' | 'retries' | 'not_retried'>('all');
  /** Per-viewer convenience, remembered in this browser. */
  const [hideResolved, setHideResolved] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HIDE_RESOLVED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleHideResolved = (on: boolean) => {
    setHideResolved(on);
    try {
      localStorage.setItem(HIDE_RESOLVED_KEY, on ? '1' : '0');
    } catch {
      /* storage blocked: the choice just isn't remembered */
    }
  };
  // Picking "Resolved" in the status filter wins over the checkbox.
  const hidingResolved = hideResolved && triageFilter !== 'resolved';
  /** Retry families (by original run id) whose earlier tries are unfolded. */
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleFamily = (rootId: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  const [linkParent, setLinkParent] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/simulation_runs.php?action=admin_list`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const list: SimulationRun[] = data.runs ?? [];
      setRuns(list);
      // Drop selections of runs that no longer exist.
      setSelected((prev) => new Set(list.filter((r) => prev.has(r.id)).map((r) => r.id)));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const latestVersion = useMemo(
    () => runs.reduce((v, r) => (cmpVersion(r.app_version, v) > 0 ? r.app_version : v), '0'),
    [runs],
  );
  const gameTypes = useMemo(() => Array.from(new Set(runs.map((r) => r.game_type))).sort(), [runs]);
  const triageCounts = useMemo(() => {
    const c: Record<Triage, number> = { new: 0, analysed: 0, resolved: 0 };
    runs.forEach((r) => c[triageOf(r)]++);
    return c;
  }, [runs]);

  const childrenOf = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const r of runs) {
      if (r.parent_run_id === null) continue;
      const list = m.get(r.parent_run_id) ?? [];
      list.push(r.id);
      m.set(r.parent_run_id, list);
    }
    m.forEach((list) => list.sort((a, b) => a - b));
    return m;
  }, [runs]);
  const byId = useMemo(() => new Map(runs.map((r) => [r.id, r])), [runs]);
  /** The original run of each run's retry chain (itself when never a retry). */
  const rootOf = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of runs) {
      let root = r.id;
      const guard = new Set<number>();
      while (byId.get(root)?.parent_run_id != null && !guard.has(root)) {
        guard.add(root);
        const parent = byId.get(root)!.parent_run_id!;
        if (!byId.has(parent)) break; // parent deleted: this run starts the chain
        root = parent;
      }
      m.set(r.id, root);
    }
    return m;
  }, [runs, byId]);
  /** Every run of each retry family, latest attempt first. */
  const familyRuns = useMemo(() => {
    const m = new Map<number, SimulationRun[]>();
    for (const r of runs) {
      const root = rootOf.get(r.id) ?? r.id;
      m.set(root, [...(m.get(root) ?? []), r]);
    }
    m.forEach((list) =>
      list.sort((x, y) => (y.created_at === x.created_at ? y.id - x.id : y.created_at.localeCompare(x.created_at))),
    );
    return m;
  }, [runs, rootOf]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, '');
    return runs.filter(
      (r) =>
        (gameType === 'all' || r.game_type === gameType) &&
        (triageFilter === 'all' || triageOf(r) === triageFilter) &&
        (!hidingResolved || triageOf(r) !== 'resolved') &&
        (verdictFilter === 'all' || r.verdict === verdictFilter) &&
        (retryFilter === 'all' ||
          (retryFilter === 'retried' && childrenOf.has(r.id)) ||
          (retryFilter === 'retries' && r.parent_run_id !== null) ||
          (retryFilter === 'not_retried' && !childrenOf.has(r.id))) &&
        (!q ||
          String(r.id) === q ||
          r.config_key.toLowerCase().includes(q) ||
          (r.note ?? '').toLowerCase().includes(q) ||
          (r.triage_note ?? '').toLowerCase().includes(q) ||
          testerOf(r).toLowerCase().includes(q) ||
          (r.scenario_title ?? '').toLowerCase().includes(q)),
    );
  }, [runs, gameType, triageFilter, verdictFilter, hidingResolved, retryFilter, query, childrenOf]);

  // "All runs": one block per retry family - the latest attempt on top, the
  // earlier tries (down to the original) folded under it. A family shows when
  // any of its runs matches the filters ("Hide resolved" also drops the
  // family's resolved tries).
  const groups = useMemo(() => {
    const seen = new Set<number>();
    const out: Array<{ root: number; head: SimulationRun; earlier: SimulationRun[] }> = [];
    for (const r of filtered) {
      const root = rootOf.get(r.id) ?? r.id;
      if (seen.has(root)) continue;
      seen.add(root);
      const family = familyRuns.get(root) ?? [r];
      const [head, ...earlier] = hidingResolved ? family.filter((x) => triageOf(x) !== 'resolved') : family;
      out.push({ root, head, earlier });
    }
    out.sort((x, y) =>
      y.head.created_at === x.head.created_at ? y.head.id - x.head.id : y.head.created_at.localeCompare(x.head.created_at),
    );
    return out;
  }, [filtered, rootOf, familyRuns, hidingResolved]);

  // One row per config: latest run, best pass version, triage counts.
  const configs = useMemo(() => {
    const map = new Map<
      string,
      {
        latest: SimulationRun;
        lastPass: SimulationRun | null;
        count: number;
        ids: number[];
        triage: Record<Triage, number>;
      }
    >();
    for (const r of filtered) {
      let e = map.get(r.config_key);
      if (!e) {
        e = { latest: r, lastPass: null, count: 0, ids: [], triage: { new: 0, analysed: 0, resolved: 0 } };
        map.set(r.config_key, e);
      }
      e.count++;
      e.ids.push(r.id);
      e.triage[triageOf(r)]++;
      if (r.verdict === 'pass' && (!e.lastPass || cmpVersion(r.app_version, e.lastPass.app_version) > 0)) e.lastPass = r;
    }
    return Array.from(map.values());
  }, [filtered]);

  // Selection only acts on what's visible under the current filters.
  const visibleSelected = useMemo(() => filtered.filter((r) => selected.has(r.id)), [filtered, selected]);
  const toggleIds = (ids: number[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const allVisibleSelected = filtered.length > 0 && visibleSelected.length === filtered.length;

  const post = async (action: string, body: unknown) => {
    const res = await authFetch(`${API_BASE_URL}/simulation_runs.php?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  const setTriage = async (ids: number[], status: Triage, note?: string) => {
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await post('admin_set_triage', { ids, status, ...(note !== undefined ? { note } : {}) });
      await load();
    } catch (e) {
      setError(`Update failed: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setBusy(false);
    }
  };

  const bulkTriage = async (status: Triage) => {
    const note = triageNote.trim();
    await setTriage(
      visibleSelected.map((r) => r.id),
      status,
      note ? note : undefined,
    );
    setTriageNote('');
  };

  const editNote = async (r: SimulationRun) => {
    const next = window.prompt(`Triage note for run #${r.id}`, r.triage_note ?? '');
    if (next === null) return;
    await setTriage([r.id], triageOf(r), next);
  };

  const setParent = async (parentId: number | null) => {
    const ids = visibleSelected.map((r) => r.id);
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const data = await post('admin_set_parent', { ids, parent_id: parentId });
      if (data.errors?.length) setError(data.errors.map((e: { error: string }) => e.error).join(' · '));
      setLinkParent('');
      await load();
    } catch (e) {
      setError(`Link failed: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = async () => {
    const ids = visibleSelected.map((r) => r.id);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} simulation run${ids.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await post('admin_delete', { ids });
      setSelected(new Set());
      await load();
    } catch (e) {
      setError(`Delete failed: ${String(e instanceof Error ? e.message : e)}`);
    } finally {
      setBusy(false);
    }
  };

  const tab = (id: typeof view, label: string) => (
    <button
      onClick={() => setView(id)}
      className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
        view === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );
  const select = 'px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg';
  const triagePill = (t: Triage) => <span className={`px-2 py-0.5 rounded ${TRIAGE_STYLE[t]}`}>{TRIAGE_LABEL[t]}</span>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <p className="text-sm text-slate-600">
          Runs recorded by the Playground game simulator. "Tested" = a Pass on the latest app version (
          {latestVersion === '0' ? 'none yet' : latestVersion}). Triage: {triageCounts.new} new ·{' '}
          {triageCounts.analysed} analysed · {triageCounts.resolved} resolved.
        </p>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-1.5">
            {tab('runs', 'All runs')}
            {tab('configs', 'By config')}
          </div>
          <button
            onClick={() => setExportOpen(true)}
            disabled={runs.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span className="text-sm font-medium">Export…</span>
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">Import…</span>
          </button>
          <button
            onClick={() => void load()}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">Refresh</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by option, note, tester or scenario…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
          />
        </div>
        <select value={gameType} onChange={(e) => setGameType(e.target.value)} className={select}>
          <option value="all">All game types</option>
          {gameTypes.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select value={triageFilter} onChange={(e) => setTriageFilter(e.target.value as Triage | 'all')} className={select}>
          <option value="all">Any status</option>
          {TRIAGES.map((t) => (
            <option key={t} value={t}>
              {TRIAGE_LABEL[t]} ({triageCounts[t]})
            </option>
          ))}
        </select>
        <select value={verdictFilter} onChange={(e) => setVerdictFilter(e.target.value as Verdict | 'all')} className={select}>
          <option value="all">Any verdict</option>
          {VERDICTS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={retryFilter}
          onChange={(e) => setRetryFilter(e.target.value as typeof retryFilter)}
          className={select}
        >
          <option value="all">Retried or not</option>
          <option value="retried">Retried (has retries)</option>
          <option value="retries">Retries (of another run)</option>
          <option value="not_retried">Not retried yet</option>
        </select>
        <label
          className={`flex items-center gap-2 text-sm ${triageFilter === 'resolved' ? 'text-slate-400' : 'text-slate-700'}`}
          title={triageFilter === 'resolved' ? 'The status filter shows resolved runs' : undefined}
        >
          <input
            type="checkbox"
            checked={hideResolved}
            disabled={triageFilter === 'resolved'}
            onChange={(e) => toggleHideResolved(e.target.checked)}
          />
          Hide resolved ({triageCounts.resolved})
        </label>
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center gap-3 mb-4 flex-wrap text-sm">
          <span className="text-slate-500">
            {visibleSelected.length > 0
              ? `${visibleSelected.length} selected`
              : `${filtered.length} runs${groups.length !== filtered.length ? ` · ${groups.length} families` : ''}`}
          </span>
          {visibleSelected.length > 0 && (
            <>
              <button onClick={() => setSelected(new Set())} className="text-slate-500 hover:text-slate-800 underline">
                Clear
              </button>
              <input
                value={triageNote}
                onChange={(e) => setTriageNote(e.target.value)}
                placeholder="Triage note (optional)"
                className="px-3 py-1.5 border border-slate-200 rounded-lg min-w-[220px]"
              />
              <button
                onClick={() => void bulkTriage('analysed')}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-50"
              >
                <Eye className="w-4 h-4" />
                Mark analysed
              </button>
              <button
                onClick={() => void bulkTriage('resolved')}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                Mark resolved
              </button>
              <button
                onClick={() => void bulkTriage('new')}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Back to new
              </button>
              <span className="flex items-center gap-1.5">
                <span className="text-slate-500">Retries of #</span>
                <input
                  value={linkParent}
                  onChange={(e) => setLinkParent(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="run id"
                  className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg"
                />
                <button
                  onClick={() => void setParent(Number(linkParent))}
                  disabled={busy || !linkParent}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  title="Link the selected runs as retries of this run"
                >
                  <GitBranch className="w-4 h-4" />
                  Link
                </button>
                <button
                  onClick={() => void setParent(null)}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  title="The selected runs are no longer retries"
                >
                  <Unlink className="w-4 h-4" />
                  Unlink
                </button>
              </span>
              <button
                onClick={() => void deleteSelected()}
                disabled={busy}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">{runs.length === 0 ? 'No simulation run recorded yet.' : 'No run matches these filters.'}</p>
        </div>
      ) : view === 'configs' ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleIds(filtered.map((r) => r.id), e.target.checked)}
                  />
                </th>
                <th className="p-3">Run numbers</th>
                <th className="p-3">Game</th>
                <th className="p-3">Config</th>
                <th className="p-3">Coverage</th>
                <th className="p-3">Latest run</th>
                <th className="p-3">Triage</th>
                <th className="p-3">Count</th>
              </tr>
            </thead>
            <tbody>
              {configs.map(({ latest, lastPass, count, ids, triage }) => {
                const current = lastPass && cmpVersion(lastPass.app_version, latestVersion) >= 0;
                const allOn = ids.every((id) => selected.has(id));
                return (
                  <tr key={latest.config_key} className="border-t border-slate-100 align-top">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select the ${count} runs of this config`}
                        checked={allOn}
                        onChange={(e) => toggleIds(ids, e.target.checked)}
                      />
                    </td>
                    <td className="p-3 font-mono text-slate-900 max-w-[140px]">
                      {[...ids].sort((a, b) => b - a).map((id) => `#${id}`).join(' ')}
                    </td>
                    <td className="p-3 capitalize">{latest.game_type}</td>
                    <td className="p-3 text-slate-700">{configLabel(latest.config)}</td>
                    <td className="p-3 whitespace-nowrap">
                      {current ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Tested {lastPass.app_version}</span>
                      ) : lastPass ? (
                        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800">Tested on {lastPass.app_version}</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-800">No pass</span>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded ${VERDICT_STYLE[latest.verdict]}`}>{latest.verdict}</span>{' '}
                      <span className="text-slate-500">
                        {latest.app_version} · {new Date(latest.created_at.replace(' ', 'T')).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-600">
                      {TRIAGES.filter((t) => triage[t] > 0)
                        .map((t) => `${triage[t]} ${TRIAGE_LABEL[t].toLowerCase()}`)
                        .join(' · ')}
                    </td>
                    <td className="p-3">{count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleIds(filtered.map((r) => r.id), e.target.checked)}
                  />
                </th>
                <th className="p-3">Run</th>
                <th className="p-3">When</th>
                <th className="p-3">Verdict</th>
                <th className="p-3">Game / config</th>
                <th className="p-3">Details</th>
                <th className="p-3">Tester</th>
                <th className="p-3">Note</th>
                <th className="p-3">Triage</th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap(({ root, head, earlier }) => {
                const open = expanded.has(root);
                const famSize = earlier.length + 1;
                return [head, ...(open ? earlier : [])].map((r) => {
                const t = triageOf(r);
                const nested = r !== head;
                const isRetry = r.parent_run_id !== null;
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-slate-100 align-top ${
                      selected.has(r.id) ? 'bg-slate-100' : nested ? 'bg-slate-50/70' : ''
                    }`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select run ${r.id}`}
                        checked={selected.has(r.id)}
                        onChange={(e) => toggleIds([r.id], e.target.checked)}
                      />
                    </td>
                    <td className={`p-3 whitespace-nowrap ${nested ? 'pl-8' : ''}`}>
                      <span className={`font-mono font-semibold ${nested ? 'text-slate-600' : 'text-slate-900'}`}>
                        {nested ? '↳ ' : ''}#{r.id}
                      </span>
                      {isRetry ? (
                        <div className="mt-1">
                          <span className="px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-800">Retry</span>{' '}
                          <span className="text-xs text-slate-500">of #{r.parent_run_id}</span>
                        </div>
                      ) : famSize > 1 ? (
                        <div className="mt-1">
                          <span className="px-1.5 py-0.5 rounded text-xs bg-slate-200 text-slate-700">Original</span>
                        </div>
                      ) : null}
                      {!nested && earlier.length > 0 && (
                        <button
                          onClick={() => toggleFamily(root)}
                          className="block text-xs text-sky-700 hover:text-sky-900 mt-1.5"
                          aria-expanded={open}
                        >
                          {open ? '▾' : '▸'} {earlier.length} earlier tr{earlier.length > 1 ? 'ies' : 'y'}
                        </button>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-500">{fmt(r.created_at)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded ${VERDICT_STYLE[r.verdict]}`}>{r.verdict}</span>
                    </td>
                    <td className="p-3">
                      <div className="capitalize font-medium">{r.game_type}</div>
                      <div className="text-slate-600">{configLabel(r.config)}</div>
                      {r.scenario_title && <div className="text-slate-400">{r.scenario_title}</div>}
                    </td>
                    <td className="p-3 whitespace-nowrap text-slate-600">
                      v{r.app_version} · seed {r.seed} · ×{r.speed}
                      <br />
                      {r.teams_count} teams · {r.devices_count} device{r.devices_count > 1 ? 's' : ''}
                      <br />
                      reads {r.reads_done}/{r.reads_total}
                      {r.read_errors > 0 && <span className="text-red-600"> · {r.read_errors} errors</span>}
                    </td>
                    <td className="p-3 text-slate-600">
                      {testerOf(r)}
                      {r.device_label && <div className="text-slate-400">{r.device_label}</div>}
                    </td>
                    <td className="p-3 text-slate-700 whitespace-pre-wrap">{r.note}</td>
                    <td className="p-3 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        {triagePill(t)}
                        <select
                          value={t}
                          disabled={busy}
                          onChange={(e) => void setTriage([r.id], e.target.value as Triage)}
                          className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white"
                          aria-label={`Status of run ${r.id}`}
                        >
                          {TRIAGES.map((x) => (
                            <option key={x} value={x}>
                              {TRIAGE_LABEL[x]}
                            </option>
                          ))}
                        </select>
                      </div>
                      {r.analysed_at && (
                        <div className="text-xs text-slate-500 mt-1">
                          Analysed {fmt(r.analysed_at)}
                          {r.analysed_by_name && ` · ${r.analysed_by_name}`}
                        </div>
                      )}
                      {r.resolved_at && (
                        <div className="text-xs text-slate-500">
                          Resolved {fmt(r.resolved_at)}
                          {r.resolved_by_name && ` · ${r.resolved_by_name}`}
                        </div>
                      )}
                      {r.triage_note && <div className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{r.triage_note}</div>}
                      <button onClick={() => void editNote(r)} className="text-xs text-slate-500 underline mt-1">
                        {r.triage_note ? 'Edit note' : 'Add note'}
                      </button>
                    </td>
                  </tr>
                );
              });
              })}
            </tbody>
          </table>
        </div>
      )}

      {exportOpen && <ExportDialog runs={runs} selected={selected} onClose={() => setExportOpen(false)} />}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onApplied={() => void load()} />}
    </div>
  );
}
