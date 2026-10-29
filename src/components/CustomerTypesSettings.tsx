import { useCallback, useEffect, useState } from 'react';
import { Building2, ArrowUp, ArrowDown, Trash2, Plus, Loader2 } from 'lucide-react';
import { customerTypesApi, invalidateCustomerTypes, CustomerTypesApiError, type CustomerTypeDef } from '../lib/customerTypesApi';

type LabelKey = 'label_fr' | 'label_en' | 'label_es';
const LANGS: { key: LabelKey; lang: string }[] = [
  { key: 'label_fr', lang: 'FR' },
  { key: 'label_en', lang: 'EN' },
  { key: 'label_es', lang: 'ES' },
];

// Admin Settings: the customer types licensees pick from when describing one
// of their customers (project_licensee_customers). Labels per UI language;
// EN / ES fall back to FR. A type in use can only be deactivated.
export function CustomerTypesSettings() {
  const [types, setTypes] = useState<CustomerTypeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<LabelKey, string>>({ label_fr: '', label_en: '', label_es: '' });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setTypes(await customerTypesApi.list());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      setError(null);
      await fn();
      invalidateCustomerTypes();
    } catch (err) {
      setError(err instanceof CustomerTypesApiError && err.code === 'IN_USE'
        ? 'This type is used by customers: deactivate it instead.'
        : err instanceof Error ? err.message : String(err));
    }
    await load();
  };

  const saveLabel = (t: CustomerTypeDef, key: LabelKey, value: string) => {
    const v = value.trim();
    if ((t[key] ?? '') === v) return;
    if (key === 'label_fr' && !v) {
      setError('The French label is required.');
      return;
    }
    void run(() => customerTypesApi.update(t.code, { [key]: v || null }));
  };

  const move = (index: number, delta: -1 | 1) => {
    const next = [...types];
    const [it] = next.splice(index, 1);
    next.splice(index + delta, 0, it);
    setTypes(next);
    void run(() => customerTypesApi.reorder(next.map((x) => x.code)));
  };

  const add = async () => {
    if (!draft.label_fr.trim()) return;
    setAdding(true);
    await run(() => customerTypesApi.create({
      label_fr: draft.label_fr,
      label_en: draft.label_en || null,
      label_es: draft.label_es || null,
    }));
    setDraft({ label_fr: '', label_en: '', label_es: '' });
    setAdding(false);
  };

  const input = 'w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-3 bg-emerald-100 rounded-lg">
          <Building2 className="w-6 h-6 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900">Customer types</h3>
          <p className="text-sm text-slate-600">
            The types licensees choose from for their own customers. EN / ES labels fall back to FR.
            A type used by customers can only be deactivated (hidden from the list, kept on those customers).
          </p>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 uppercase">
              <th className="py-2 w-16">Order</th>
              {LANGS.map((l) => <th key={l.key} className="py-2 px-1">{l.lang}{l.key === 'label_fr' ? ' *' : ''}</th>)}
              <th className="py-2 px-1 text-right">Customers</th>
              <th className="py-2 px-1 text-center">Active</th>
              <th className="py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {types.map((t, i) => (
              <tr key={t.code} className={t.active ? '' : 'opacity-60'}>
                <td className="py-2">
                  <div className="flex gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" title="Move up">
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === types.length - 1} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30" title="Move down">
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </td>
                {LANGS.map((l) => (
                  <td key={l.key} className="py-2 px-1">
                    <input
                      defaultValue={t[l.key] ?? ''}
                      placeholder={l.key === 'label_fr' ? '' : t.label_fr}
                      onBlur={(e) => saveLabel(t, l.key, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className={input}
                    />
                  </td>
                ))}
                <td className="py-2 px-1 text-right text-slate-600">{t.in_use ?? 0}</td>
                <td className="py-2 px-1 text-center">
                  <input type="checkbox" checked={t.active}
                    onChange={(e) => void run(() => customerTypesApi.update(t.code, { active: e.target.checked }))} />
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => { if (window.confirm(`Delete the type "${t.label_fr}"?`)) void run(() => customerTypesApi.remove(t.code)); }}
                    disabled={(t.in_use ?? 0) > 0}
                    title={(t.in_use ?? 0) > 0 ? 'Used by customers - deactivate it instead' : 'Delete'}
                    className="p-1.5 rounded text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-3 text-xs font-semibold text-slate-500 uppercase">New</td>
              {LANGS.map((l) => (
                <td key={l.key} className="py-3 px-1">
                  <input
                    value={draft[l.key]}
                    placeholder={l.key === 'label_fr' ? 'Libellé FR' : l.key === 'label_en' ? 'EN label' : 'Etiqueta ES'}
                    onChange={(e) => setDraft({ ...draft, [l.key]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
                    className={input}
                  />
                </td>
              ))}
              <td colSpan={3} className="py-3 px-1 text-right">
                <button onClick={() => void add()} disabled={adding || !draft.label_fr.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50">
                  <Plus className="w-4 h-4" />Add
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}
