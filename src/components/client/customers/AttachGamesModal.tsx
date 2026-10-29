import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { customersApi } from '../../../lib/customersApi';
import type { Customer, CustomerGame } from '../../../types/customer';
import { CustomerModal, btnPrimary, btnSecondary } from './customerUi';
import { errorMessage, fmtDay } from './customerFormat';

type Filter = 'untagged' | 'other' | 'all';

// Tag past games with a customer from studio (games forgotten at launch, or
// played on a device that is gone).
export function AttachGamesModal({ clientId, customer, onClose, onAttached }: {
  clientId?: number;
  customer: Customer;
  onClose: () => void;
  onAttached: () => void;
}) {
  const { t, i18n } = useTranslation('customers');
  const [filter, setFilter] = useState<Filter>('untagged');
  const [q, setQ] = useState('');
  const [games, setGames] = useState<CustomerGame[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (offset: number) => {
    try {
      const res = await customersApi.candidates(customer.id, clientId, { filter, q: q.trim(), offset });
      setGames((prev) => (offset === 0 ? res.games : [...prev, ...res.games]));
      setTotal(res.total);
    } catch (err) {
      setError(t('errors.generic', { message: errorMessage(err) }));
    }
  }, [customer.id, clientId, filter, q, t]);

  useEffect(() => {
    const h = setTimeout(() => void load(0), 200);
    return () => clearTimeout(h);
  }, [load]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const attach = async () => {
    setBusy(true);
    try {
      await customersApi.assign([...selected], customer.id, clientId);
      onAttached();
    } catch (err) {
      setError(t('errors.generic', { message: errorMessage(err) }));
      setBusy(false);
    }
  };

  const tab = (f: Filter, label: string) => (
    <button onClick={() => setFilter(f)}
      className={`px-3 py-1.5 text-sm rounded-lg ${filter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
      {label}
    </button>
  );

  return (
    <CustomerModal title={t('attach.title', { name: customer.name })} onClose={onClose} wide
      footer={<>
        <button onClick={onClose} className={btnSecondary}>{t('form.cancel')}</button>
        <button onClick={attach} disabled={selected.size === 0 || busy} className={btnPrimary}>
          {t('attach.attachSelected', { count: selected.size })}
        </button>
      </>}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {tab('untagged', t('attach.filterUntagged'))}
          {tab('other', t('attach.filterOther'))}
          {tab('all', t('attach.filterAll'))}
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('attach.search')}
              className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-sm" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {games.length === 0 ? (
          <p className="text-center text-slate-500 py-8 text-sm">{t('attach.empty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {games.map((g) => (
              <li key={g.summary_uuid}>
                <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50">
                  <input type="checkbox" checked={selected.has(g.summary_uuid)} onChange={() => toggle(g.summary_uuid)} />
                  <span className="text-sm text-slate-500 w-24 shrink-0">{fmtDay(g.played_at, i18n.language) ?? t('empty')}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-900 truncate">{g.scenario_title || g.scenario_uniqid || t('empty')}</span>
                    <span className="block text-xs text-slate-500 truncate">
                      {[g.name, g.customer_name ? t('attach.currentlyWith', { name: g.customer_name }) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-xs text-slate-500 capitalize shrink-0">{g.game_type}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {games.length < total && (
          <button onClick={() => void load(games.length)} className={btnSecondary}>{t('attach.loadMore')}</button>
        )}
      </div>
    </CustomerModal>
  );
}
