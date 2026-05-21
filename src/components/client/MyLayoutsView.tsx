import { useEffect, useState } from 'react';
import { LayoutGrid, Search, Pencil, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authFetch } from '../../lib/authFetch';

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
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState<LayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Defense-in-depth: layouts.php?action=list already filters by owner_type for
  // non-admin tokens, so every row a client sees is owner_type='client'. The
  // checks below stay anyway, in case the list query ever broadens to expose
  // system/admin layouts to clients.
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadLayouts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/layouts.php?action=list`);
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || 'Failed to load layouts');
      } else {
        setLayouts((body?.data as LayoutRow[]) || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadLayouts();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = layouts.filter((l) =>
    search ? (l.name || '').toLowerCase().includes(search.toLowerCase()) : true
  );

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await authFetch(
        `${API_BASE_URL}/layouts.php?action=delete&id=${encodeURIComponent(String(id))}`,
        { method: 'POST' }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success !== true) {
        setDeleteError(body?.error || 'Delete failed');
        setDeletingId(null);
        return;
      }
      setLayouts((rows) => rows.filter((r) => r.id !== id));
      setPendingDeleteId(null);
      setDeletingId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Network error');
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
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

      {deleteError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{deleteError}</span>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500">No layouts yet. Layouts are created from inside a scenario editor.</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((l) => {
            const editable = !!l.scenario_uniqid && l.owner_type === 'client';
            const removable = l.owner_type === 'client';
            const isPending = pendingDeleteId === l.id;
            const isDeleting = deletingId === l.id;
            return (
              <li
                key={l.id}
                className="rounded-lg border border-slate-200 bg-white p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{l.name || `Layout #${l.id}`}</div>
                  <div className="text-xs text-slate-500">
                    {l.game_type}
                    {l.status ? ` · ${l.status}` : ''}
                    {l.scenario_uniqid ? ` · scenario ${l.scenario_uniqid}` : ''}
                  </div>
                </div>

                {isPending ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Delete this layout?</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(l.id)}
                      disabled={isDeleting}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium ${
                        isDeleting
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-red-600 text-white hover:bg-red-500'
                      }`}
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Deleting…
                        </>
                      ) : (
                        'Confirm'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(null)}
                      disabled={isDeleting}
                      className="px-3 py-1 rounded text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {editable && (
                      <button
                        type="button"
                        onClick={() => navigate(`/studio/layouts/${l.scenario_uniqid}`)}
                        title="Edit in Studio"
                        className="p-2 rounded hover:bg-slate-100 text-slate-500 hover:text-blue-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {removable && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteError(null);
                          setPendingDeleteId(l.id);
                        }}
                        title="Delete"
                        className="p-2 rounded hover:bg-red-50 text-slate-500 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
