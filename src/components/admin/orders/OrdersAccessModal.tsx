import { useEffect, useMemo, useState } from 'react';
import { Save, Search, X } from 'lucide-react';
import { ordersApi, type OrdersAccessSettings } from '../../../lib/ordersApi';

// Admin > Commandes > Produits > "Licensee access": open Commandes to every
// licensee, or switch it off and pick the licensees who may still order.
// Backend: OrdersAccess.php (order_settings 'access'). Licensees who lose access
// keep "Mes demandes" when they have past requests.

type Client = { id: number; name: string; email: string };

export function OrdersAccessModal({ onClose, onSaved }: { onClose: () => void; onSaved: (s: OrdersAccessSettings) => void }) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [all, setAll] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    ordersApi.access()
      .then((r) => {
        setClients(r.clients);
        setAll(r.all);
        setSelected(new Set(r.client_ids));
      })
      .catch(() => setErr('Could not load the licensees.'));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (clients ?? []).filter((c) =>
      (!onlySelected || selected.has(c.id)) && (!q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)));
  }, [clients, query, onlySelected, selected]);

  const toggle = (id: number) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      onSaved(await ordersApi.accessSave({ all, client_ids: [...selected] }));
    } catch {
      setErr('Could not save.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Licensee access to Commandes</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {clients === null && !err && (
            <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" /></div>
          )}
          {clients !== null && (
            <>
              <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-4">
                <div>
                  <p className="font-medium text-slate-900">Open to all licensees</p>
                  <p className="text-sm text-slate-500">
                    {all
                      ? 'Every licensee sees the sale and rental pages and can send requests.'
                      : 'Only the licensees ticked below can order. The others no longer see the sale and rental pages; those with past requests keep "Mes demandes".'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAll((v) => !v)}
                  aria-pressed={all}
                  className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${all ? 'bg-emerald-600' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${all ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className={all ? 'opacity-50 pointer-events-none' : ''} aria-disabled={all}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-medium text-slate-700">
                    Licensees allowed to order <span className="text-slate-400 font-normal">({selected.size} selected)</span>
                  </p>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />
                    Selected only
                  </label>
                </div>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or email"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm"
                  />
                </div>
                <ul className="max-h-[45vh] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                  {shown.length === 0 && <li className="p-4 text-center text-sm text-slate-500">No licensee.</li>}
                  {shown.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                        <span className="min-w-0">
                          <span className="block text-sm text-slate-900 truncate">{c.name}</span>
                          {c.email !== c.name && <span className="block text-xs text-slate-400 truncate">{c.email}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {all && selected.size > 0 && (
                  <p className="mt-2 text-xs text-slate-500">This list is kept and applies again if you switch "Open to all" off.</p>
                )}
              </div>
            </>
          )}
          {err && <p className="text-sm text-rose-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-slate-200">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cancel</button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || clients === null}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />Save
          </button>
        </div>
      </div>
    </div>
  );
}
