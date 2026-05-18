import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Activity } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface FleetErrorRow {
  client_id: number;
  fingerprint_hash: string;
  error_message: string;
  stack_trace: string | null;
  total_count: number;
  device_count: number;
  first_seen_at: string;
  last_seen_at: string;
  app_version: string | null;
  client_email: string | null;
  client_name: string | null;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function RecentErrorsView() {
  const [rows, setRows] = useState<FleetErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchErrors = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await authFetch(`${API_BASE_URL}/telemetry_admin.php?action=list_errors`, {
        credentials: 'include',
      });
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
    void fetchErrors();
  }, []);

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-slate-600">
          Errors from the last 30 days, grouped by fingerprint. Up to 200 most-recent groups.
        </p>
        <button
          onClick={fetchErrors}
          className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span className="text-sm font-medium">Refresh</span>
        </button>
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
          <p className="text-slate-500">No errors reported in the last 30 days.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const key = `${r.client_id}:${r.fingerprint_hash}`;
            const open = expanded.has(key);
            return (
              <div key={key} className="bg-white rounded-xl border border-slate-200">
                <button
                  onClick={() => toggle(key)}
                  className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <p className="text-sm font-medium text-slate-900 truncate">{r.error_message}</p>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {r.client_name || r.client_email || `client #${r.client_id}`}
                        {r.app_version && <span className="ml-2 font-mono">v{r.app_version}</span>}
                      </p>
                      <p className="text-xs text-slate-400 mt-1 font-mono">{r.fingerprint_hash.slice(0, 16)}…</p>
                    </div>
                    <div className="text-right text-xs text-slate-500 shrink-0">
                      <div className="font-semibold text-slate-700">×{r.total_count}</div>
                      <div>on {r.device_count} device{r.device_count === 1 ? '' : 's'}</div>
                      <div className="mt-1">{formatRelative(r.last_seen_at)}</div>
                    </div>
                  </div>
                </button>
                {open && r.stack_trace && (
                  <div className="px-5 pb-4 border-t border-slate-100">
                    <pre className="text-xs text-slate-700 bg-slate-50 p-3 rounded overflow-x-auto whitespace-pre-wrap break-all mt-3">
                      {r.stack_trace}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
