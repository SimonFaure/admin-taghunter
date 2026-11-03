import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Copy, ExternalLink, Image as ImageIcon, Loader2, MapPin, Plus, Ticket, Trash2, X } from 'lucide-react';
import { eventsApi, formatMoney } from '../../../lib/eventsApi';
import { EVENT_LANGS, type EventLang, type EventListItem } from '../../../types/events';
import { btnPrimary, btnSecondary, errorText, inputCls, StatusBadge } from './ui';

// /my/events - the licensee's event pages (Events phase 2).
export function MyEventsView() {
  const { t, i18n } = useTranslation('events');
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    eventsApi.list().then(setEvents).catch((e) => setError(errorText(t, e)));
  }, [t]);
  useEffect(load, [load]);

  const locale = i18n.language;
  const dateRange = (e: EventListItem) => {
    if (!e.first_slot_at) return t('list.noDate');
    const f = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    const a = f.format(new Date(e.first_slot_at));
    const b = e.last_slot_end_at ? f.format(new Date(e.last_slot_end_at)) : a;
    return a === b ? a : `${a} – ${b}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Ticket className="w-6 h-6" />{t('list.title')}</h2>
          <p className="text-slate-600 mt-1">{t('list.subtitle')}</p>
        </div>
        <button className={btnPrimary} onClick={() => setCreating(true)}><Plus className="w-4 h-4" />{t('list.new')}</button>
      </div>

      {notice && <p className="text-sm text-slate-700 bg-slate-100 rounded-lg p-3">{notice}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!events && !error && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />{t('common.loading')}</div>}
      {events && events.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-600">{t('list.empty')}</div>
      )}

      {events && events.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => (
            <div key={e.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
              <button className="aspect-[16/7] bg-slate-100 flex items-center justify-center overflow-hidden" onClick={() => navigate(`/my/events/${e.id}`)}>
                {e.hero ? <img src={e.hero} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-10 h-10 text-slate-300" />}
              </button>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <button className="text-left font-semibold text-slate-900 hover:underline" onClick={() => navigate(`/my/events/${e.id}`)}>{e.title || e.slug}</button>
                  <StatusBadge status={e.status} />
                </div>
                <div className="text-sm text-slate-600">{dateRange(e)}</div>
                {e.venue_city && <div className="text-sm text-slate-600 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{e.venue_city}</div>}
                <div className="text-xs text-slate-500 flex flex-wrap gap-x-3">
                  <span>{t('list.slots', { count: e.slots_count })}</span>
                  <span>{t('list.sold', { count: e.tickets_sold })}</span>
                  {e.revenue_cents > 0 && <span>{t('list.revenue', { amount: formatMoney(e.revenue_cents, locale) })}</span>}
                </div>
                <div className="mt-auto pt-2 flex flex-wrap gap-2">
                  <button className={btnSecondary} onClick={() => navigate(`/my/events/${e.id}`)}>{t('list.open')}</button>
                  {e.status === 'published' && (
                    <a className={btnSecondary} href={e.public_url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" />{t('list.viewPage')}</a>
                  )}
                  <button className={btnSecondary} title={t('list.duplicate')} onClick={async () => {
                    try {
                      const p = await eventsApi.duplicate(e.id);
                      navigate(`/my/events/${p.event.id}`);
                    } catch (ex) { setNotice(errorText(t, ex)); }
                  }}><Copy className="w-4 h-4" /></button>
                  <button className={btnSecondary} title={t('list.delete')} onClick={async () => {
                    if (!window.confirm(t('list.confirmDelete', { title: e.title || e.slug }))) return;
                    try {
                      const r = await eventsApi.remove(e.id);
                      if (r.archived) setNotice(t('list.archived'));
                      load();
                    } catch (ex) { setNotice(errorText(t, ex)); }
                  }}><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && <NewEventModal onClose={() => setCreating(false)} onCreated={(id) => navigate(`/my/events/${id}`)} />}
    </div>
  );
}

function NewEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { t, i18n } = useTranslation('events');
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState<EventLang>((EVENT_LANGS as string[]).includes(i18n.language) ? (i18n.language as EventLang) : 'fr');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="bg-white rounded-xl shadow-xl max-w-md w-full" onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        setErr(null);
        try {
          const p = await eventsApi.create(title.trim(), lang);
          onCreated(p.event.id);
        } catch (ex) {
          setErr(errorText(t, ex));
          setBusy(false);
        }
      }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">{t('list.newTitle')}</h3>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5 text-slate-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">{t('list.eventTitle')}</span>
            <input autoFocus className={inputCls} value={title} placeholder={t('list.eventTitlePlaceholder')} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">{t('list.mainLanguage')}</span>
            <select className={inputCls} value={lang} onChange={(e) => setLang(e.target.value as EventLang)}>
              {EVENT_LANGS.map((l) => <option key={l} value={l}>{t(`langs.${l}`)}</option>)}
            </select>
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className={btnPrimary} disabled={busy || !title.trim()}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}{busy ? t('list.creating') : t('list.create')}
          </button>
        </div>
      </form>
    </div>
  );
}
