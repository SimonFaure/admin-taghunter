import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { customersApi, CustomersApiError } from '../../../lib/customersApi';
import type { Customer, CustomerHistoryEntry } from '../../../types/customer';
import type { ClientScenario } from '../types';
import { CustomerModal, btnPrimary, btnSecondary, inputCls } from './customerUi';
import { errorMessage } from './customerFormat';

const OTHER = '__other__';

// Product names, not translated.
const GAME_TYPES: { code: string; label: string }[] = [
  { code: 'tagquest', label: 'Quest' },
  { code: 'mystery', label: 'Mystery' },
  { code: 'tracks', label: 'Track' },
  { code: 'clash', label: 'Clash' },
];

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function countOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// Add / edit a game in a customer's history by hand: a game played without the
// playground, or before Taghunter. One of the licensee's scenarios, or a free
// title for a game outside the catalog.
export function HistoryEntryModal({ clientId, customer, entry, scenarios, onClose, onSaved }: {
  clientId?: number;
  customer: Customer;
  entry?: CustomerHistoryEntry | null;
  scenarios: ClientScenario[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('customers');
  const today = todayLocal();
  const [playedOn, setPlayedOn] = useState(entry?.played_on ?? '');
  const [scenario, setScenario] = useState(entry ? (entry.scenario_uniqid ?? OTHER) : '');
  const [title, setTitle] = useState(entry?.title ?? '');
  const [gameType, setGameType] = useState(entry && !entry.scenario_uniqid ? (entry.game_type ?? '') : '');
  const [teams, setTeams] = useState(entry?.teams_count != null ? String(entry.teams_count) : '');
  const [players, setPlayers] = useState(entry?.players_count != null ? String(entry.players_count) : '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Published scenarios by title, plus the entry's own one if it is no longer listed.
  const options = useMemo(() => {
    const list = scenarios
      .filter((s) => s.uniqid && s.status !== 'draft')
      .map((s) => ({ uniqid: s.uniqid as string, title: s.title || (s.uniqid as string) }));
    if (entry?.scenario_uniqid && !list.some((o) => o.uniqid === entry.scenario_uniqid)) {
      list.push({ uniqid: entry.scenario_uniqid, title: entry.scenario_title || entry.scenario_uniqid });
    }
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }, [scenarios, entry]);

  const save = async () => {
    if (!playedOn) { setError(t('entry.dateRequired')); return; }
    if (playedOn > today) { setError(t('entry.dateFuture')); return; }
    const isOther = scenario === OTHER;
    if (!scenario || (isOther && !title.trim())) { setError(t('entry.gameRequired')); return; }
    setSaving(true);
    setError(null);
    try {
      await customersApi.saveEntry({
        id: entry?.id,
        customer_id: customer.id,
        played_on: playedOn,
        scenario_uniqid: isOther ? null : scenario,
        title: isOther ? title.trim() : null,
        game_type: isOther ? (gameType || null) : null,
        teams_count: countOrNull(teams),
        players_count: countOrNull(players),
        notes: notes.trim() || null,
      }, clientId);
      onSaved();
    } catch (err) {
      const code = err instanceof CustomersApiError ? err.code : undefined;
      setError(code === 'FUTURE_DATE' ? t('entry.dateFuture')
        : code === 'BAD_DATE' ? t('entry.dateRequired')
        : t('errors.save', { message: errorMessage(err) }));
      setSaving(false);
    }
  };

  const label = (text: string, required = false) => (
    <label className="block text-xs font-medium text-slate-500 mb-1">{text}{required ? ' *' : ''}</label>
  );

  return (
    <CustomerModal
      title={entry ? t('entry.editTitle') : t('entry.createTitle', { name: customer.name })}
      onClose={onClose}
      footer={<>
        <button onClick={onClose} className={btnSecondary}>{t('form.cancel')}</button>
        <button onClick={save} disabled={saving} className={btnPrimary}>{t('form.save')}</button>
      </>}
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t('entry.intro')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            {label(t('entry.date'), true)}
            <input type="date" value={playedOn} max={today} onChange={(e) => setPlayedOn(e.target.value)} className={inputCls} />
          </div>
          <div>
            {label(t('entry.teams'))}
            <input type="number" min={0} inputMode="numeric" value={teams} onChange={(e) => setTeams(e.target.value)} className={inputCls} />
          </div>
          <div>
            {label(t('entry.players'))}
            <input type="number" min={0} inputMode="numeric" value={players} onChange={(e) => setPlayers(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          {label(t('entry.scenario'), true)}
          <select value={scenario} onChange={(e) => setScenario(e.target.value)} className={inputCls}>
            <option value="" disabled>{t('entry.scenarioPlaceholder')}</option>
            {options.map((o) => <option key={o.uniqid} value={o.uniqid}>{o.title}</option>)}
            <option value={OTHER}>{t('entry.otherGame')}</option>
          </select>
        </div>
        {scenario === OTHER && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              {label(t('entry.title'), true)}
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={190} className={inputCls} />
            </div>
            <div>
              {label(t('entry.gameType'))}
              <select value={gameType} onChange={(e) => setGameType(e.target.value)} className={inputCls}>
                <option value="">{t('entry.gameTypeNone')}</option>
                {GAME_TYPES.map((g) => <option key={g.code} value={g.code}>{g.label}</option>)}
              </select>
            </div>
          </div>
        )}
        <div>
          {label(t('entry.notes'))}
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000}
            placeholder={t('entry.notesPlaceholder')} className={inputCls} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </CustomerModal>
  );
}
