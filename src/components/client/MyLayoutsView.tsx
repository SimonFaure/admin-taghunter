import { useEffect, useState } from 'react';
import { LayoutGrid, Search } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface LayoutRow {
  id: number;
  uniqid?: string | null;
  name?: string;
  game_type: string;
  owner_type: string;
  owner_id: number | null;
  scenario_uniqid?: string | null;
  status?: string;
  created_at?: string;
}

export function MyLayoutsView() {
  const { token } = useAuth();
  const [layouts, setLayouts] = useState<LayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/layouts.php?action=list`, {
          headers: token ? { 'X-Auth-Token': token } : undefined,
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.error || 'Failed to load layouts');
        } else {
          setLayouts((body?.data as LayoutRow[]) || []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const filtered = layouts.filter((l) =>
    search ? (l.name || '').toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <LayoutGrid className="h-6 w-6 text-slate-600" />
        <h1 className="text-xl font-semibold text-slate-900">My Layouts</h1>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search layouts…"
          className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500">No layouts yet. Layouts are created from inside a scenario editor.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((l) => (
            <li
              key={l.id}
              className="rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between"
            >
              <div>
                <div className="font-medium text-slate-900">{l.name || `Layout #${l.id}`}</div>
                <div className="text-xs text-slate-500">
                  {l.game_type}
                  {l.status ? ` · ${l.status}` : ''}
                  {l.scenario_uniqid ? ` · scenario ${l.scenario_uniqid}` : ''}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
