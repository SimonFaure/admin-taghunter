import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Loader2, LogOut, QrCode, RefreshCw, Search, Undo2, Users, X } from 'lucide-react';
import { checkinApi, CheckinApiError, type CheckinBooking, type CheckinDay, type CheckinMode, type CheckinTicket } from '../../lib/checkinApi';
import { PinPad } from './PinPad';
import { ScanDialog } from './ScanDialog';

// Event-day check-in (Events phase 4). One mobile-first screen, two entries:
//   /checkin/:token     volunteers (staff link + PIN, no Studio account)
//   /m/checkin/:eventId the licensee (normal Studio login)
// Light, high-contrast and big tap targets: it is used outdoors, standing up.

const REFRESH_MS = 30_000;

function arrivedCount(tickets: CheckinTicket[]): number {
  return tickets.filter((t) => t.checked_in_at).length;
}

function sessionKey(token: string): string {
  return `th_checkin_${token}`;
}

/** /checkin/:token - public staff entry: PIN first, then the check-in screen. */
export function StaffCheckinRoute() {
  const { token = '' } = useParams();
  const { t } = useTranslation('checkin');
  const [session, setSession] = useState<string | null>(() => {
    try { return sessionStorage.getItem(sessionKey(token)); } catch { return null; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (pin: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await checkinApi.staffLogin(token, pin);
      try { sessionStorage.setItem(sessionKey(token), r.session); } catch { /* private mode */ }
      setSession(r.session);
    } catch (e) {
      setError(e instanceof CheckinApiError ? e.message : 'generic');
    } finally {
      setBusy(false);
    }
  };

  const expire = useCallback(() => {
    try { sessionStorage.removeItem(sessionKey(token)); } catch { /* ignore */ }
    setSession(null);
    setError('session_expired');
  }, [token]);

  if (!session) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
        <div className="w-full">
          <p className="text-center text-sm font-semibold text-slate-500 mb-6">{t('appName')}</p>
          <PinPad onSubmit={login} busy={busy} error={error} />
        </div>
      </div>
    );
  }
  return <CheckinScreen mode={{ kind: 'staff', session }} onExpired={expire} onLogout={expire} />;
}

/** /m/checkin/:eventId - the licensee's own check-in screen. */
export function LicenseeCheckinRoute() {
  const { eventId = '' } = useParams();
  return <CheckinScreen mode={{ kind: 'licensee', eventId: Number(eventId) }} backTo={`/my/events/${eventId}/checkin`} />;
}

function CheckinScreen({ mode, onExpired, onLogout, backTo }: {
  mode: CheckinMode; onExpired?: () => void; onLogout?: () => void; backTo?: string;
}) {
  const { t, i18n } = useTranslation('checkin');
  const [day, setDay] = useState<CheckinDay | null>(null);
  const [date, setDate] = useState<string | undefined>(undefined);
  const [slotId, setSlotId] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<CheckinBooking | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef(0);

  const handleError = useCallback((e: unknown): string => {
    const code = e instanceof CheckinApiError ? e.message : 'generic';
    if (code === 'session_expired' && onExpired) onExpired();
    return code;
  }, [onExpired]);

  const load = useCallback(async (d?: string) => {
    setRefreshing(true);
    try {
      const r = await checkinApi.day(mode, d);
      // Never overwrite the list while a check-in is on its way (it would flicker back).
      if (pending.current === 0) setDay(r);
      setLoadError(null);
    } catch (e) {
      setLoadError(handleError(e));
    } finally {
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, mode.kind === 'staff' ? mode.session : mode.eventId, handleError]);

  useEffect(() => {
    void load(date);
    const id = window.setInterval(() => { void load(date); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load, date]);

  // Keep the open sheet in sync with refreshed data.
  useEffect(() => {
    if (!open || !day) return;
    for (const s of day.slots) {
      const b = s.bookings.find((x) => x.id === open.id);
      if (b && JSON.stringify(b.tickets) !== JSON.stringify(open.tickets)) setOpen({ ...open, ...b });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const tz = day?.event.timezone ?? 'Europe/Paris';
  const fmtTime = (iso: string) => new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(new Date(iso));
  const fmtDay = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  };

  /** Apply new tickets of a booking everywhere (list + sheet). */
  const patchTickets = (bookingId: number, tickets: CheckinTicket[]) => {
    setDay((d) => d && ({ ...d, slots: d.slots.map((s) => ({ ...s, bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, tickets } : b)) })) }));
    setOpen((o) => (o && o.id === bookingId ? { ...o, tickets } : o));
  };

  /** Optimistic check-in / undo with rollback. ticketIds null = whole booking. */
  const act = async (b: CheckinBooking, ticketIds: number[] | null, action: 'in' | 'undo') => {
    const before = b.tickets;
    const now = new Date().toISOString();
    const optimistic = b.tickets.map((tk) => (ticketIds === null || ticketIds.includes(tk.id)) ? { ...tk, checked_in_at: action === 'in' ? (tk.checked_in_at ?? now) : null } : tk);
    patchTickets(b.id, optimistic);
    pending.current++;
    try {
      const tickets = await checkinApi.checkin(mode, b.id, ticketIds, action);
      patchTickets(b.id, tickets);
    } catch (e) {
      patchTickets(b.id, before);
      setToast(t(`errors.${handleError(e)}`, { defaultValue: t('errors.generic') }));
    } finally {
      pending.current--;
    }
  };

  const onScan = async (code: string) => {
    setScanBusy(true);
    setScanError(null);
    try {
      const b = await checkinApi.scan(mode, code);
      setScanOpen(false);
      setOpen(b);
    } catch (e) {
      setScanError(handleError(e));
    } finally {
      setScanBusy(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const slots = day?.slots ?? [];
  const visibleSlots = slotId === 'all' ? slots : slots.filter((s) => s.id === slotId);
  const q = query.trim().toLowerCase();
  const matches = (b: CheckinBooking) => {
    if (missingOnly && arrivedCount(b.tickets) === b.tickets.length) return false;
    if (!q) return true;
    const hay = [b.team_name, b.buyer_name, b.reference, ...b.tickets.map((x) => x.first_name)].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  };
  const totals = useMemo(() => {
    let expected = 0;
    let arrived = 0;
    for (const s of visibleSlots) for (const b of s.bookings) { expected += b.tickets.length; arrived += arrivedCount(b.tickets); }
    return { expected, arrived };
  }, [visibleSlots]);

  if (!day) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 px-4 text-center">
        {loadError ? (
          <>
            <AlertTriangle className="w-8 h-8 text-amber-600" />
            <p className="text-lg text-slate-800">{t(`errors.${loadError}`, { defaultValue: t('errors.generic') })}</p>
            <button className="px-5 py-3 rounded-xl bg-slate-900 text-white font-bold" onClick={() => void load(date)}>{t('common.retry')}</button>
          </>
        ) : <Loader2 className="w-8 h-8 animate-spin text-slate-500" />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-28">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b-2 border-slate-200">
        <div className="max-w-3xl mx-auto px-3 py-2 flex items-center gap-2">
          {backTo && <Link to={backTo} className="p-2 -ml-1 rounded-lg hover:bg-slate-100" aria-label={t('common.back')}><ArrowLeft className="w-6 h-6" /></Link>}
          <div className="min-w-0 flex-1">
            <div className="font-bold text-lg leading-tight truncate">{day.event.title}</div>
            <div className="text-sm text-slate-600 flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span className="font-semibold text-emerald-700">{t('arrivedCount', { arrived: totals.arrived, expected: totals.expected })}</span>
            </div>
          </div>
          <button className="p-2 rounded-lg hover:bg-slate-100" onClick={() => void load(date)} aria-label={t('common.refresh')}>
            <RefreshCw className={`w-6 h-6 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          {onLogout && <button className="p-2 rounded-lg hover:bg-slate-100" onClick={onLogout} aria-label={t('common.logout')}><LogOut className="w-6 h-6" /></button>}
        </div>
        {/* Day selector */}
        {day.days.length > 1 && (
          <div className="max-w-3xl mx-auto px-3 pb-2">
            <select className="w-full border-2 border-slate-300 rounded-xl px-3 py-2 text-base bg-white" value={day.date}
              onChange={(e) => { setDate(e.target.value); setSlotId('all'); }}>
              {day.days.map((d) => <option key={d} value={d}>{fmtDay(d)}</option>)}
            </select>
          </div>
        )}
        {/* Session pills */}
        <div className="max-w-3xl mx-auto px-3 pb-2 flex gap-2 overflow-x-auto">
          <Pill active={slotId === 'all'} onClick={() => setSlotId('all')}>{t('allSessions')}</Pill>
          {slots.map((s) => {
            let e = 0;
            let a = 0;
            for (const b of s.bookings) { e += b.tickets.length; a += arrivedCount(b.tickets); }
            return (
              <Pill key={s.id} active={slotId === s.id} onClick={() => setSlotId(s.id)}>
                <span className="font-bold">{fmtTime(s.starts_at)}</span>
                <span className={`ml-1.5 ${a === e && e > 0 ? 'text-emerald-700' : ''}`}>{a}/{e}</span>
              </Pill>
            );
          })}
        </div>
        {/* Search + missing filter */}
        <div className="max-w-3xl mx-auto px-3 pb-3 flex gap-2">
          <label className="flex-1 min-w-0 flex items-center gap-2 border-2 border-slate-300 rounded-xl px-3 bg-white focus-within:border-slate-900">
            <Search className="w-5 h-5 text-slate-500 shrink-0" />
            <input className="flex-1 min-w-0 py-2.5 text-base bg-transparent focus:outline-none" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')} type="search" />
          </label>
          <button type="button" onClick={() => setMissingOnly(!missingOnly)}
            className={`px-3 rounded-xl border-2 font-semibold text-sm whitespace-nowrap ${missingOnly ? 'bg-amber-100 border-amber-500 text-amber-900' : 'bg-white border-slate-300 text-slate-700'}`}>
            {t('missingOnly')}
          </button>
        </div>
      </header>

      {loadError && <p className="max-w-3xl mx-auto px-3 pt-3 text-sm text-amber-800">{t(`errors.${loadError}`, { defaultValue: t('errors.generic') })}</p>}

      <main className="max-w-3xl mx-auto px-3 py-3 space-y-5">
        {slots.length === 0 && <p className="text-center text-slate-600 py-10">{t('noSessions')}</p>}
        {visibleSlots.map((s) => {
          const list = s.bookings.filter(matches);
          if ((q || missingOnly) && list.length === 0) return null;
          return (
            <section key={s.id}>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-2">
                {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}{s.label ? ` · ${s.label}` : ''}
              </h2>
              {list.length === 0 ? <p className="text-slate-500 text-sm">{t('noBookings')}</p> : (
                <ul className="space-y-2">
                  {list.map((b) => {
                    const a = arrivedCount(b.tickets);
                    const all = a === b.tickets.length;
                    return (
                      <li key={b.id}>
                        <button type="button" onClick={() => setOpen(b)}
                          className={`w-full text-left rounded-2xl border-2 px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition ${all ? 'bg-emerald-50 border-emerald-500' : a > 0 ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-300'}`}>
                          <span className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-lg font-bold ${all ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-800'}`}>
                            {all ? <Check className="w-6 h-6" /> : `${a}/${b.tickets.length}`}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold text-lg truncate">{b.team_name || b.buyer_name || b.reference}</span>
                            <span className="block text-sm text-slate-600 truncate">
                              {[b.team_name ? b.buyer_name : null, t('people', { count: b.tickets.length }), b.reference].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          {b.payment_due && <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-amber-200 text-amber-950">{t('paymentDue')}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </main>

      {/* Scan button */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent pt-6 pb-4 px-3">
        <button type="button" onClick={() => { setScanError(null); setScanOpen(true); }}
          className="max-w-3xl mx-auto w-full flex items-center justify-center gap-3 rounded-2xl bg-slate-900 text-white text-xl font-bold py-4 shadow-lg active:bg-slate-700">
          <QrCode className="w-7 h-7" />{t('scan.button')}
        </button>
      </div>

      {toast && (
        <div className="fixed bottom-24 inset-x-3 z-40 max-w-3xl mx-auto rounded-xl bg-red-700 text-white px-4 py-3 font-semibold shadow-lg" role="alert">{toast}</div>
      )}

      {scanOpen && <ScanDialog onCode={onScan} onClose={() => setScanOpen(false)} busy={scanBusy} error={scanError} />}
      {open && <BookingSheet booking={open} staff={mode.kind === 'staff'} fmtTime={fmtTime} onClose={() => setOpen(null)} onAct={act} />}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`shrink-0 px-4 py-2 rounded-full border-2 text-sm whitespace-nowrap ${active ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-800'}`}>
      {children}
    </button>
  );
}

function BookingSheet({ booking, staff, fmtTime, onClose, onAct }: {
  booking: CheckinBooking; staff: boolean; fmtTime: (iso: string) => string; onClose: () => void;
  onAct: (b: CheckinBooking, ticketIds: number[] | null, action: 'in' | 'undo') => Promise<void>;
}) {
  const { t } = useTranslation('checkin');
  const a = arrivedCount(booking.tickets);
  const all = a === booking.tickets.length;
  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-200">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold truncate">{booking.team_name || booking.buyer_name || booking.reference}</h2>
            <p className="text-slate-600">
              {[booking.team_name ? booking.buyer_name : null, booking.reference, booking.slot_starts_at ? fmtTime(booking.slot_starts_at) : null].filter(Boolean).join(' · ')}
            </p>
            {booking.status && booking.status !== 'confirmed' && <p className="mt-1 font-bold text-red-700">{t('notConfirmed')}</p>}
            {booking.payment_due && <p className="mt-2 inline-block text-sm font-bold px-2 py-1 rounded-lg bg-amber-200 text-amber-950">{t('paymentDue')}</p>}
            {!staff && (booking.buyer_phone || booking.buyer_email) && (
              <p className="mt-2 text-sm text-slate-600">
                {booking.buyer_phone && <a className="underline mr-3" href={`tel:${booking.buyer_phone}`}>{booking.buyer_phone}</a>}
                {booking.buyer_email}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-slate-100" aria-label={t('common.close')}><X className="w-6 h-6" /></button>
        </div>
        <ul className="overflow-y-auto px-5 py-3 space-y-2">
          {booking.tickets.map((tk, i) => {
            const inn = !!tk.checked_in_at;
            return (
              <li key={tk.id}>
                <button type="button" onClick={() => void onAct(booking, [tk.id], inn ? 'undo' : 'in')}
                  className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left ${inn ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-300'}`}>
                  <span className={`w-9 h-9 shrink-0 rounded-lg border-2 flex items-center justify-center ${inn ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-400'}`}>
                    {inn && <Check className="w-6 h-6" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-lg truncate">{tk.first_name || t('person', { n: i + 1 })}{tk.age !== null ? ` (${tk.age})` : ''}</span>
                    <span className="block text-sm text-slate-600 truncate">{tk.label}</span>
                  </span>
                  {inn && tk.checked_in_at && <span className="text-xs text-emerald-800 shrink-0">{fmtTime(tk.checked_in_at)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-5 pt-2 pb-5 space-y-2 border-t border-slate-200">
          {!all && (
            <button type="button" onClick={() => void onAct(booking, null, 'in')}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-white text-lg font-bold py-4 active:bg-emerald-700">
              <Check className="w-6 h-6" />{t('allArrived')}
            </button>
          )}
          {a > 0 && (
            <button type="button" onClick={() => void onAct(booking, null, 'undo')}
              className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 text-slate-800 font-semibold py-3">
              <Undo2 className="w-5 h-5" />{t('undoAll')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
