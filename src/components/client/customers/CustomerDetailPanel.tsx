import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Archive, ArchiveRestore, GitMerge, Pencil, Trash2, Link2, Mail, Phone, MapPin, User, Image as ImageIcon, Plus, PenLine } from 'lucide-react';
import { authFetch } from '../../../lib/authFetch';
import { customersApi, CustomersApiError } from '../../../lib/customersApi';
import { customerTypeLabel, useCustomerTypes } from '../../../lib/customerTypesApi';
import { useAuth } from '../../../auth/AuthContext';
import type { Customer, CustomerGame, CustomerHistoryEntry } from '../../../types/customer';
import type { ClientScenario } from '../types';
import { getGameVisualUrl } from '../MyScenariosView';
import { GameTypeIcon } from '../../icons/GameTypeIcons';
import { CustomerFormModal } from './CustomerFormModal';
import { CustomerMergeModal } from './CustomerMergeModal';
import { AttachGamesModal } from './AttachGamesModal';
import { HistoryEntryModal } from './HistoryEntryModal';
import { CustomerInlinePicker } from './CustomerInlinePicker';
import { btnSecondary } from './customerUi';
import { errorMessage, fmtDay } from './customerFormat';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// One history line: a game synced from a playground, or one added by hand.
type HistoryRow =
  | { kind: 'game'; at: string | null; game: CustomerGame }
  | { kind: 'entry'; at: string; entry: CustomerHistoryEntry };

// One licensee customer: details, game history (synced games re-assignable,
// hand-added ones editable), and the licensee's scenarios this customer has
// not played yet. Shared by the licensee page and the admin licensee page
// (clientId set).
export function CustomerDetailPanel({ clientId, customerId, onBack, onNavigate }: {
  clientId?: number;
  customerId: string;
  onBack: () => void;
  onNavigate: (id: string) => void;
}) {
  const { t, i18n } = useTranslation('customers');
  const types = useCustomerTypes();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [mergedFrom, setMergedFrom] = useState<{ id: string; name: string }[]>([]);
  const [games, setGames] = useState<CustomerGame[]>([]);
  // null = studio DB without the history table: "Add a game" stays hidden.
  const [entries, setEntries] = useState<CustomerHistoryEntry[] | null>(null);
  const [others, setOthers] = useState<Customer[]>([]);
  const [scenarios, setScenarios] = useState<ClientScenario[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'edit' | 'merge' | 'attach' | 'entry' | null>(null);
  const [editingEntry, setEditingEntry] = useState<CustomerHistoryEntry | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await customersApi.get(customerId, clientId);
      if (res.redirect_to !== undefined) {
        if (res.redirect_to) onNavigate(res.redirect_to);
        else setNotFound(true);
        return;
      }
      const [history, everyone] = await Promise.all([
        customersApi.history(customerId, clientId),
        customersApi.list(clientId, { includeArchived: true }),
      ]);
      setCustomer(res.customer ?? null);
      setMergedFrom(res.merged_from ?? []);
      setGames(history.games);
      setEntries(history.entries);
      setOthers(everyone);
    } catch (err) {
      if (err instanceof CustomersApiError && err.status === 404) setNotFound(true);
      else setError(t('errors.generic', { message: errorMessage(err) }));
    }
  }, [customerId, clientId, onNavigate, t]);

  useEffect(() => { void load(); }, [load]);

  // The licensee's scenarios (for "Not played yet").
  useEffect(() => {
    const qs = clientId ? `&client_id=${clientId}` : '';
    authFetch(`${API_BASE_URL}/client_scenarios.php?action=list${qs}`)
      .then((r) => r.json())
      .then((body) => setScenarios(Array.isArray(body?.data) ? body.data : []))
      .catch(() => setScenarios([]));
  }, [clientId]);

  const rows = useMemo<HistoryRow[]>(() => {
    const all: HistoryRow[] = [
      ...games.map((g) => ({ kind: 'game' as const, at: g.played_at, game: g })),
      ...(entries ?? []).map((e) => ({ kind: 'entry' as const, at: e.played_at, entry: e })),
    ];
    // Newest first, undated games last ("Y-m-d H:i:s" compares as text).
    return all.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  }, [games, entries]);

  const playedUniqids = useMemo(() => new Set([
    ...games.map((g) => g.scenario_uniqid),
    ...(entries ?? []).map((e) => e.scenario_uniqid),
  ].filter(Boolean)), [games, entries]);
  const notPlayed = useMemo(
    () => scenarios.filter((s) => s.status !== 'draft' && s.uniqid && !playedUniqids.has(s.uniqid)),
    [scenarios, playedUniqids],
  );

  const reassign = async (g: CustomerGame, id: string | null) => {
    try {
      await customersApi.assign([g.summary_uuid], id, clientId);
      await load();
    } catch (err) {
      setError(t('errors.generic', { message: errorMessage(err) }));
    }
  };

  const openEntry = (e: CustomerHistoryEntry | null) => {
    setEditingEntry(e);
    setModal('entry');
  };

  const deleteEntry = async (e: CustomerHistoryEntry) => {
    if (!window.confirm(t('detail.deleteEntryConfirm'))) return;
    try {
      await customersApi.deleteEntry(e.id, clientId);
      await load();
    } catch (err) {
      setError(t('errors.generic', { message: errorMessage(err) }));
    }
  };

  const archive = async () => {
    if (!customer) return;
    try {
      await customersApi.archive(customer.id, !customer.archived, clientId);
      await load();
    } catch (err) {
      setError(t('errors.generic', { message: errorMessage(err) }));
    }
  };

  const remove = async () => {
    if (!customer) return;
    if (customer.games_count > 0) {
      setError(t('detail.deleteHasGames'));
      return;
    }
    if (!window.confirm(t('detail.deleteConfirm', { name: customer.name }))) return;
    try {
      await customersApi.remove(customer.id, clientId);
      onBack();
    } catch (err) {
      setError(err instanceof CustomersApiError && err.code === 'HAS_GAMES'
        ? t('detail.deleteHasGames')
        : t('errors.generic', { message: errorMessage(err) }));
    }
  };

  const backButton = (
    <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
      <ArrowLeft className="w-4 h-4" />{t('detail.back')}
    </button>
  );

  if (notFound) {
    return <div className="space-y-4">{backButton}<p className="text-slate-600">{t('detail.notFound')}</p></div>;
  }
  if (!customer) {
    return (
      <div className="space-y-4">
        {backButton}
        {error ? <p className="text-sm text-red-600">{error}</p>
          : <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" /></div>}
      </div>
    );
  }

  const contact = [
    customer.contact_name && { icon: User, text: customer.contact_name },
    customer.email && { icon: Mail, text: customer.email },
    customer.phone && { icon: Phone, text: customer.phone },
    customer.city && { icon: MapPin, text: customer.city },
  ].filter(Boolean) as { icon: typeof User; text: string }[];

  return (
    <div className="space-y-6">
      {backButton}

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        {customer.archived && (
          <div className="mb-4 p-3 bg-slate-100 rounded-lg text-sm text-slate-700">{t('detail.archivedBanner')}</div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900">{customer.name}</h2>
            {customer.type && <p className="text-sm text-slate-500">{customerTypeLabel(types, customer.type, i18n.language)}</p>}
            {contact.length > 0 && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-slate-700">
                {contact.map(({ icon: Icon, text }) => (
                  <span key={text} className="inline-flex items-center gap-1.5"><Icon className="w-4 h-4 text-slate-400" />{text}</span>
                ))}
              </div>
            )}
            {customer.notes && <p className="mt-3 text-sm text-slate-600 whitespace-pre-line">{customer.notes}</p>}
            {mergedFrom.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">{t('detail.mergedFrom', { names: mergedFrom.map((m) => m.name).join(', ') })}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setModal('edit')} className={`${btnSecondary} inline-flex items-center gap-1.5`}><Pencil className="w-4 h-4" />{t('detail.edit')}</button>
            <button onClick={archive} className={`${btnSecondary} inline-flex items-center gap-1.5`}>
              {customer.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
              {customer.archived ? t('detail.unarchive') : t('detail.archive')}
            </button>
            <button onClick={() => setModal('merge')} className={`${btnSecondary} inline-flex items-center gap-1.5`}><GitMerge className="w-4 h-4" />{t('detail.merge')}</button>
            <button onClick={remove} className={`${btnSecondary} inline-flex items-center gap-1.5 text-red-600`}><Trash2 className="w-4 h-4" />{t('detail.delete')}</button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6">
          <Stat label={t('detail.statGames')} value={String(customer.games_count)} />
          <Stat label={t('detail.statLastPlayed')} value={fmtDay(customer.last_played_at, i18n.language) ?? t('empty')} />
          <Stat label={t('detail.statScenarios')} value={String(playedUniqids.size)} />
        </div>
        {error && <p className="text-sm text-red-600 mt-4">{error}</p>}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-lg font-bold text-slate-900">{t('detail.historyTitle')}</h3>
          <div className="flex flex-wrap gap-2">
            {entries !== null && (
              <button onClick={() => openEntry(null)} className={`${btnSecondary} inline-flex items-center gap-1.5`}><Plus className="w-4 h-4" />{t('detail.addEntry')}</button>
            )}
            <button onClick={() => setModal('attach')} className={`${btnSecondary} inline-flex items-center gap-1.5`}><Link2 className="w-4 h-4" />{t('detail.attach')}</button>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">{t(entries !== null ? 'detail.historyEmptyManual' : 'detail.historyEmpty')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => {
              if (row.kind === 'game') {
                const g = row.game;
                return (
                  <HistoryLine key={g.summary_uuid} date={fmtDay(g.played_at, i18n.language) ?? t('empty')}
                    visual={getGameVisualUrl(g.scenario_medias, g.scenario_uniqid ?? undefined, user?.language)}
                    gameType={g.game_type} title={g.scenario_title || g.scenario_uniqid || t('empty')}
                    details={[g.name, t('detail.teams', { count: g.teams_played }), t('detail.players', { count: g.players_played })]}
                    action={<CustomerInlinePicker customers={others} value={g.customer_id} onChange={(id) => void reassign(g, id)} />} />
                );
              }
              const e = row.entry;
              return (
                <HistoryLine key={e.id} date={fmtDay(e.played_at, i18n.language) ?? t('empty')}
                  visual={e.scenario_uniqid ? getGameVisualUrl(e.scenario_medias, e.scenario_uniqid, user?.language) : null}
                  gameType={e.game_type} title={e.scenario_title || e.title || e.scenario_uniqid || t('empty')}
                  badge={<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-medium text-slate-600 shrink-0"
                    title={t('detail.manualHint')}><PenLine className="w-3 h-3" />{t('detail.manualBadge')}</span>}
                  details={[
                    e.teams_count != null ? t('detail.teams', { count: e.teams_count }) : null,
                    e.players_count != null ? t('detail.players', { count: e.players_count }) : null,
                    e.notes,
                  ]}
                  action={
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEntry(e)} title={t('detail.edit')} aria-label={t('detail.edit')}
                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => void deleteEntry(e)} title={t('detail.delete')} aria-label={t('detail.delete')}
                        className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  } />
              );
            })}
          </ul>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900">{t('detail.notPlayedTitle')}</h3>
        <p className="text-sm text-slate-500 mb-4">{t('detail.notPlayedHint')}</p>
        {notPlayed.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">{t('detail.notPlayedEmpty')}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {notPlayed.map((s) => {
              const visual = getGameVisualUrl(s.medias, s.uniqid, user?.language);
              return (
                <div key={s.uniqid} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="aspect-video bg-slate-100 flex items-center justify-center">
                    {visual ? <img src={visual} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-slate-300" />}
                  </div>
                  <div className="p-2 text-sm font-medium text-slate-900 flex items-center gap-1.5">
                    <GameTypeIcon type={s.game_type} className="w-4 h-4 text-slate-500 shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal === 'edit' && (
        <CustomerFormModal clientId={clientId} customer={customer} existing={others} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void load(); }} />
      )}
      {modal === 'merge' && (
        <CustomerMergeModal clientId={clientId} source={customer} candidates={others.filter((c) => !c.archived)}
          onClose={() => setModal(null)} onMerged={(target) => { setModal(null); onNavigate(target); }} />
      )}
      {modal === 'attach' && (
        <AttachGamesModal clientId={clientId} customer={customer} onClose={() => setModal(null)}
          onAttached={() => { setModal(null); void load(); }} />
      )}
      {modal === 'entry' && (
        <HistoryEntryModal clientId={clientId} customer={customer} entry={editingEntry} scenarios={scenarios}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} />
      )}
    </div>
  );
}

function HistoryLine({ date, visual, gameType, title, badge, details, action }: {
  date: string;
  visual: string | null | undefined;
  gameType: string | null;
  title: string;
  badge?: ReactNode;
  details: (string | null | undefined)[];
  action: ReactNode;
}) {
  const line = details.filter(Boolean).join(' · ');
  return (
    <li className="flex items-center gap-4 py-3">
      <span className="text-sm text-slate-500 w-24 shrink-0">{date}</span>
      <div className="w-16 h-10 rounded bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
        {visual ? <img src={visual} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-slate-300" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5 min-w-0">
          <GameTypeIcon type={gameType ?? undefined} className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="truncate">{title}</span>
          {badge}
        </div>
        {line && <div className="text-xs text-slate-500 truncate" title={line}>{line}</div>}
      </div>
      {action}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}
