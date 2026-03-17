import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid as Layout, Search, Eye, Trash2, Calendar, Tag, Gamepad2, FileJson, X, ChevronDown, User, Shield, Building2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface LayoutRow {
  id: number;
  layout_data: string;
  game_type: string;
  scenario_uniqid: string | null;
  status: 'draft' | 'published' | 'archived';
  version: string;
  owner_type: string;
  owner_id: number | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-700',
  published: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-slate-100 text-slate-500',
};

const STATUS_OPTIONS: Array<'draft' | 'published' | 'archived'> = ['draft', 'published', 'archived'];

const OWNER_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; classes: string }> = {
  admin: {
    label: 'Admin',
    icon: <Shield className="w-3 h-3" />,
    classes: 'bg-blue-100 text-blue-700',
  },
  client: {
    label: 'Client',
    icon: <Building2 className="w-3 h-3" />,
    classes: 'bg-orange-100 text-orange-700',
  },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function parsedLayoutData(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function StatusDropdown({
  layout,
  onUpdate,
}: {
  layout: LayoutRow;
  onUpdate: (updated: LayoutRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleOpen = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
    }
    setOpen((v) => !v);
  };

  const changeStatus = async (newStatus: 'draft' | 'published' | 'archived') => {
    if (newStatus === layout.status) {
      setOpen(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/layouts.php?action=update_status`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: layout.id, status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to update status');
      } else {
        onUpdate(json.data);
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
    setOpen(false);
  };

  return (
    <div className="relative inline-block">
      {error && (
        <div className="absolute bottom-full mb-1 left-0 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-1.5 whitespace-nowrap z-20 shadow-md">
          {error}
          <button className="ml-2 opacity-60 hover:opacity-100" onClick={() => setError(null)}>
            <X className="w-3 h-3 inline" />
          </button>
        </div>
      )}
      <button
        ref={buttonRef}
        onClick={handleOpen}
        disabled={loading}
        className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize transition-all cursor-pointer hover:opacity-80 ${STATUS_COLORS[layout.status] ?? 'bg-slate-100 text-slate-500'}`}
      >
        {loading ? (
          <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
        ) : null}
        <span>{layout.status}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && menuPos && createPortal(
        <div
          ref={ref}
          style={{ position: 'absolute', top: menuPos.top, left: menuPos.left, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden min-w-[120px]"
        >
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => changeStatus(s)}
              className={`w-full text-left px-3 py-2 text-xs capitalize transition-colors flex items-center space-x-2 ${
                s === layout.status
                  ? 'font-semibold bg-slate-50 text-slate-900'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s === 'published' ? 'bg-emerald-500' : s === 'draft' ? 'bg-amber-400' : 'bg-slate-400'}`} />
              <span>{s}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

export function LayoutsView() {
  const [layouts, setLayouts] = useState<LayoutRow[]>([]);
  const [filtered, setFiltered] = useState<LayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [selectedLayout, setSelectedLayout] = useState<LayoutRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);

  useEffect(() => {
    fetchLayouts();
  }, []);

  useEffect(() => {
    let result = layouts;

    if (statusFilter !== 'all') {
      result = result.filter((l) => l.status === statusFilter);
    }

    if (ownerFilter !== 'all') {
      result = result.filter((l) => l.owner_type === ownerFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.game_type.toLowerCase().includes(q) ||
          (l.scenario_uniqid?.toLowerCase().includes(q) ?? false) ||
          (l.created_by_email?.toLowerCase().includes(q) ?? false) ||
          String(l.id).includes(q)
      );
    }

    setFiltered(result);
  }, [searchQuery, statusFilter, ownerFilter, layouts]);

  const fetchLayouts = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/layouts.php?action=list`, {
        credentials: 'include',
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to load layouts');
      } else {
        setLayouts(json.data ?? []);
        setFiltered(json.data ?? []);
      }
    } catch {
      setError('Network error — could not reach the server');
    }

    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/layouts.php?action=delete&id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Failed to delete layout');
      } else {
        setLayouts((prev) => prev.filter((l) => l.id !== id));
        if (selectedLayout?.id === id) setSelectedLayout(null);
      }
    } catch {
      setError('Network error — could not delete layout');
    }

    setDeleteConfirm(null);
  };

  const handleStatusUpdate = (updated: LayoutRow) => {
    setLayouts((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    if (selectedLayout?.id === updated.id) setSelectedLayout(updated);
  };

  const statusOptions = ['all', 'draft', 'published', 'archived'];
  const ownerOptions = ['all', 'admin', 'client'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Layout className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-slate-500">{filtered.length} layout{filtered.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex items-center space-x-3 flex-wrap gap-y-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by game type, scenario ID, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
          />
        </div>

        <div className="relative">
          <button
            onClick={() => { setShowOwnerDropdown((v) => !v); setShowStatusDropdown(false); }}
            className="flex items-center space-x-2 px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white hover:bg-slate-50 transition-all"
          >
            <span className="text-slate-700 capitalize">{ownerFilter === 'all' ? 'All Owners' : ownerFilter === 'admin' ? 'Admin' : 'Client'}</span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
          {showOwnerDropdown && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden">
              {ownerOptions.map((o) => (
                <button
                  key={o}
                  onClick={() => { setOwnerFilter(o); setShowOwnerDropdown(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors capitalize ${
                    ownerFilter === o ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {o === 'all' ? 'All Owners' : o === 'admin' ? 'Admin' : 'Client'}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <button
            onClick={() => { setShowStatusDropdown((v) => !v); setShowOwnerDropdown(false); }}
            className="flex items-center space-x-2 px-4 py-2.5 border border-slate-200 rounded-lg text-sm bg-white hover:bg-slate-50 transition-all"
          >
            <span className="text-slate-700 capitalize">{statusFilter === 'all' ? 'All Statuses' : statusFilter}</span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>
          {showStatusDropdown && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden">
              {statusOptions.map((s) => (
                <button
                  key={s}
                  onClick={() => { setStatusFilter(s); setShowStatusDropdown(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors capitalize ${
                    statusFilter === s ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {s === 'all' ? 'All Statuses' : s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Layout className="w-7 h-7 text-slate-400" />
          </div>
          <p className="text-slate-900 font-semibold mb-1">No layouts found</p>
          <p className="text-slate-500 text-sm">
            {searchQuery || statusFilter !== 'all' || ownerFilter !== 'all' ? 'Try adjusting your filters.' : 'Layouts uploaded from Creator will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Game Type</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Scenario ID</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Version</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Created</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Updated</th>
                <th className="px-5 py-3.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((layout) => {
                const ownerCfg = OWNER_TYPE_CONFIG[layout.owner_type];
                return (
                  <tr key={layout.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-2">
                        <Gamepad2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-slate-900">
                          {layout.game_type || <span className="text-slate-400 italic">—</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {layout.scenario_uniqid ? (
                        <div className="flex items-center space-x-2">
                          <Tag className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <span className="text-sm text-slate-600 font-mono">{layout.scenario_uniqid}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusDropdown layout={layout} onUpdate={handleStatusUpdate} />
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-slate-600">v{layout.version}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-1">
                        {ownerCfg ? (
                          <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium ${ownerCfg.classes}`}>
                            {ownerCfg.icon}
                            <span>{ownerCfg.label}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 capitalize">{layout.owner_type}</span>
                        )}
                        {layout.created_by_email && (
                          <div className="flex items-center space-x-1">
                            <User className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="text-xs text-slate-500">{layout.created_by_email}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-1.5 text-sm text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(layout.created_at)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-1.5 text-sm text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(layout.updated_at)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => setSelectedLayout(layout)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-all"
                          title="View layout data"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(layout.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                          title="Delete layout"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedLayout && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLayout(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileJson className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Layout Data</h3>
                  <p className="text-xs text-slate-500">{selectedLayout.game_type} &mdash; v{selectedLayout.version}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLayout(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Status</p>
                  <StatusDropdown layout={selectedLayout} onUpdate={(updated) => { handleStatusUpdate(updated); setSelectedLayout(updated); }} />
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Version</p>
                  <p className="text-sm font-semibold text-slate-900">v{selectedLayout.version}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Owner Type</p>
                  {(() => {
                    const cfg = OWNER_TYPE_CONFIG[selectedLayout.owner_type];
                    return cfg ? (
                      <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.classes}`}>
                        {cfg.icon}
                        <span>{cfg.label}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-700 capitalize">{selectedLayout.owner_type}</span>
                    );
                  })()}
                </div>
                {selectedLayout.created_by_email && (
                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">Created by</p>
                    <p className="text-sm text-slate-700">{selectedLayout.created_by_email}</p>
                  </div>
                )}
                {selectedLayout.scenario_uniqid && (
                  <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Scenario ID</p>
                    <p className="text-sm font-mono text-slate-700">{selectedLayout.scenario_uniqid}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Layout Data</p>
                <pre className="bg-slate-950 text-emerald-400 text-xs rounded-xl p-4 overflow-auto leading-relaxed">
                  {JSON.stringify(parsedLayoutData(selectedLayout.layout_data), null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 text-center mb-2">Delete Layout</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              This action cannot be undone. The layout will be permanently removed.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
