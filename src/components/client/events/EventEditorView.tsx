import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Copy, Eye, Loader2, Rocket, Undo2 } from 'lucide-react';
import { EventsApiError, eventsApi } from '../../../lib/eventsApi';
import type { ChecklistCode, EventEditorPayload } from '../../../types/events';
import { btnPrimary, btnSecondary, errorText, StatusBadge } from './ui';
import { PageTab } from './tabs/PageTab';
import { TicketsTab } from './tabs/TicketsTab';
import { SessionsTab } from './tabs/SessionsTab';
import { CheckoutTab } from './tabs/CheckoutTab';
import { BookingsTab } from './tabs/BookingsTab';
import { SettingsTab } from './tabs/SettingsTab';
import { AddonsTab } from './tabs/AddonsTab';
import { PromoTab } from './tabs/PromoTab';
import { CheckinTab } from './tabs/CheckinTab';

const TABS = ['page', 'tickets', 'addons', 'promo', 'sessions', 'checkout', 'bookings', 'checkin', 'settings'] as const;
type Tab = typeof TABS[number];

// /my/events/:id/:tab? - the event editor (Events phases 2-3).
export function EventEditorView() {
  const { t } = useTranslation('events');
  const navigate = useNavigate();
  const { id = '', tab = 'page' } = useParams();
  const eventId = Number(id);
  const active: Tab = (TABS as readonly string[]).includes(tab) ? (tab as Tab) : 'page';
  const [data, setData] = useState<EventEditorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [missing, setMissing] = useState<ChecklistCode[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    eventsApi.get(eventId).then((p) => { if (alive) setData(p); }).catch((e) => { if (alive) setError(errorText(t, e)); });
    return () => { alive = false; };
  }, [eventId, t]);

  const onSaved = useCallback((p: EventEditorPayload) => {
    setData(p);
    setMissing(null);
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <div className="flex items-center gap-2 text-slate-500 py-10"><Loader2 className="w-5 h-5 animate-spin" />{t('common.loading')}</div>;

  const ev = data.event;
  const title = data.contents[ev.main_language]?.title || ev.slug;
  const published = ev.status === 'published';

  const togglePublish = async () => {
    setPublishing(true);
    setNotice(null);
    setMissing(null);
    try {
      const p = published ? await eventsApi.unpublish(ev.id) : await eventsApi.publish(ev.id);
      setData(p);
      setNotice({ ok: true, text: t(published ? 'editor.unpublished' : 'editor.published') });
    } catch (e) {
      if (e instanceof EventsApiError && e.missing) setMissing(e.missing);
      else setNotice({ ok: false, text: errorText(t, e) });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <Link to="/my/events" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="w-4 h-4" />{t('editor.back')}</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-slate-900 truncate">{title}</h2>
            <StatusBadge status={ev.status} />
            {data.bookings_count > 0 && <span className="text-xs text-slate-500">{t('editor.bookings', { count: data.bookings_count })}</span>}
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <a href={published ? data.public_url : data.preview_url} target="_blank" rel="noreferrer" className="hover:underline truncate">{data.public_url.replace(/^https?:\/\//, '')}</a>
            <button className="p-1 rounded hover:bg-slate-100" title={t('editor.copyLink')} onClick={() => {
              void navigator.clipboard?.writeText(data.public_url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}>{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={btnSecondary} href={data.preview_url} target="_blank" rel="noreferrer"><Eye className="w-4 h-4" />{t('editor.preview')}</a>
          <button className={published ? btnSecondary : btnPrimary} onClick={togglePublish} disabled={publishing}>
            {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : published ? <Undo2 className="w-4 h-4" /> : <Rocket className="w-4 h-4" />}
            {publishing ? t('editor.publishing') : t(published ? 'editor.unpublish' : 'editor.publish')}
          </button>
        </div>
      </div>

      {data.cancelled_at && (
        <p className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />{t('cancel.banner', { date: new Date(data.cancelled_at).toLocaleDateString() })}
        </p>
      )}
      {notice && <p className={`text-sm ${notice.ok ? 'text-emerald-700' : 'text-red-600'}`}>{notice.text}</p>}
      {missing && missing.length > 0 && <ChecklistBox codes={missing} title={t('editor.notReady')} onGo={(tb) => navigate(`/my/events/${ev.id}/${tb}`)} />}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => navigate(`/my/events/${ev.id}/${tb}`)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${active === tb ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t(`tabs.${tb}`)}
          </button>
        ))}
      </nav>

      {active === 'page' && <PageTab data={data} onSaved={onSaved} />}
      {active === 'tickets' && <TicketsTab data={data} onSaved={onSaved} />}
      {active === 'addons' && <AddonsTab data={data} onSaved={onSaved} />}
      {active === 'promo' && <PromoTab data={data} onSaved={onSaved} />}
      {active === 'sessions' && <SessionsTab data={data} onSaved={onSaved} />}
      {active === 'checkout' && <CheckoutTab data={data} onSaved={onSaved} onGoPage={() => navigate(`/my/events/${ev.id}/page`)} />}
      {active === 'bookings' && <BookingsTab data={data} onSaved={onSaved} />}
      {active === 'checkin' && <CheckinTab data={data} onSaved={onSaved} />}
      {active === 'settings' && (
        <SettingsTab data={data} onSaved={onSaved}
          checklist={<ChecklistBox codes={data.checklist} title={t('editor.notReady')} onGo={(tb) => navigate(`/my/events/${ev.id}/${tb}`)} />} />
      )}
    </div>
  );
}

const FIX_TAB: Record<ChecklistCode, string | null> = {
  title: 'page', terms: 'page', venue: 'settings', ticket_types: 'tickets', slots: 'sessions',
  legal_info: null, platform_terms: null, stripe: null,
};

export function ChecklistBox({ codes, title, onGo }: { codes: ChecklistCode[]; title: string; onGo: (tab: string) => void }) {
  const { t } = useTranslation('events');
  if (codes.length === 0) {
    return <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3 flex items-center gap-2"><Check className="w-4 h-4" />{t('checklist.ready')}</p>;
  }
  return (
    <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="font-medium text-amber-900 mb-2">{title}</div>
      <ul className="space-y-1.5">
        {codes.map((c) => (
          <li key={c} className="flex flex-wrap items-center gap-2 text-amber-900">
            <span>• {t(`checklist.${c}`)}</span>
            {FIX_TAB[c]
              ? <button className="text-blue-700 hover:underline" onClick={() => onGo(FIX_TAB[c] as string)}>{t(`tabs.${FIX_TAB[c]}`)} →</button>
              : <Link to="/my/payments" className="text-blue-700 hover:underline">{t('checklist.goPayments')} →</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
