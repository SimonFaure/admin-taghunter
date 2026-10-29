import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Plus, Upload, Download, Search, ChevronRight, MonitorSmartphone } from 'lucide-react';
import { customersApi } from '../../../lib/customersApi';
import { customerTypeLabel, useCustomerTypes } from '../../../lib/customerTypesApi';
import type { Customer } from '../../../types/customer';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerImportModal } from './CustomerImportModal';
import { btnPrimary, btnSecondary } from './customerUi';
import { errorMessage, fmtDay } from './customerFormat';

type Sort = 'name' | 'last_played' | 'games';

// Licensee customers list (search, sort, archived toggle, create, import,
// CSV export). Used by the licensee's /my/customers page and, with clientId,
// by the admin licensee page. `onOpen` shows one customer's detail.
export function CustomersPanel({ clientId, onOpen }: { clientId?: number; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation('customers');
  const types = useCustomerTypes();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [all, setAll] = useState<Customer[]>([]);
  const [q, setQ] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState<Sort>('name');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [list, everyone] = await Promise.all([
        customersApi.list(clientId, { q: q.trim(), includeArchived, sort }),
        customersApi.list(clientId, { includeArchived: true }),
      ]);
      setCustomers(list);
      setAll(everyone);
    } catch (err) {
      setError(`${t('errors.load')} ${errorMessage(err)}`);
    } finally {
      setLoading(false);
    }
  }, [clientId, q, includeArchived, sort, t]);

  useEffect(() => {
    const h = setTimeout(() => void load(), 200);
    return () => clearTimeout(h);
  }, [load]);

  const exportCsv = async () => {
    const XLSX = await import('xlsx');
    const header = [
      t('fields.name'), t('fields.type'), t('fields.contactName'), t('fields.email'), t('fields.phone'),
      t('fields.city'), t('fields.notes'), t('export.archived'), t('export.gamesCount'), t('export.lastPlayed'), t('export.createdAt'),
    ];
    const rows = all.map((c) => [
      c.name, customerTypeLabel(types, c.type, i18n.language) ?? '', c.contact_name ?? '', c.email ?? '', c.phone ?? '', c.city ?? '',
      c.notes ?? '', c.archived ? t('export.yes') : t('export.no'), c.games_count,
      fmtDay(c.last_played_at, i18n.language) ?? '', fmtDay(c.created_at, i18n.language) ?? '',
    ]);
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet([header, ...rows]), { FS: ';' });
    // BOM: French Excel opens UTF-8 CSVs correctly only with it.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${t('export.filename')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('list.search')}
            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          {t('list.sortLabel')}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
            <option value="name">{t('list.sortName')}</option>
            <option value="last_played">{t('list.sortLastPlayed')}</option>
            <option value="games">{t('list.sortGames')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          {t('list.showArchived')}
        </label>
        <div className="flex gap-2 ml-auto">
          <button onClick={() => setImporting(true)} className={`${btnSecondary} inline-flex items-center gap-1.5`}>
            <Upload className="w-4 h-4" />{t('list.import')}
          </button>
          <button onClick={exportCsv} disabled={all.length === 0} className={`${btnSecondary} inline-flex items-center gap-1.5`}>
            <Download className="w-4 h-4" />{t('list.export')}
          </button>
          <button onClick={() => setCreating(true)} className={`${btnPrimary} inline-flex items-center gap-1.5`}>
            <Plus className="w-4 h-4" />{t('list.new')}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" /></div>
      ) : customers.length === 0 ? (
        <p className="text-center text-slate-500 py-12 text-sm">{q.trim() ? t('list.emptySearch') : t('list.empty')}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {customers.map((c) => (
            <li key={c.id}>
              <button onClick={() => onOpen(c.id)} className="w-full flex items-center gap-4 px-2 py-3 text-left hover:bg-slate-50 rounded-lg">
                <div className="p-2 bg-slate-100 rounded-lg"><Building2 className="w-5 h-5 text-slate-600" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 truncate">{c.name}</span>
                    {c.archived && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{t('list.archived')}</span>}
                    {c.created_source === 'playground' && (
                      <span title={t('list.fromPlayground')}><MonitorSmartphone className="w-3.5 h-3.5 text-slate-400" /></span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {[customerTypeLabel(types, c.type, i18n.language), c.city, c.contact_name].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="text-right text-sm shrink-0">
                  <div className="text-slate-900">{t('list.games', { count: c.games_count })}</div>
                  <div className="text-xs text-slate-500">
                    {c.last_played_at ? t('list.lastPlayed', { date: fmtDay(c.last_played_at, i18n.language) }) : t('list.never')}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <CustomerFormModal clientId={clientId} existing={all} onClose={() => setCreating(false)}
          onSaved={(c) => { setCreating(false); onOpen(c.id); }} />
      )}
      {importing && (
        <CustomerImportModal clientId={clientId} existing={all} onClose={() => setImporting(false)} onImported={() => void load()} />
      )}
    </div>
  );
}
