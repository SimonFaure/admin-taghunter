import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ExternalLink, Image as ImageIcon, Loader2, RefreshCw, Search } from 'lucide-react';
import { eventsAdminApi, formatCents } from '../../../lib/paymentsApi';
import { setEventsClientId } from '../../../lib/eventsApi';
import type { AdminEventRow } from '../../../types/payments';
import { EventEditorView } from '../../client/events/EventEditorView';

// Admin -> Events -> Events: every licensee's event pages in one list, with
// sales figures. "Open" mounts the licensee's own editor in admin mode
// (events.php accepts an admin token + client_id).

const card = 'bg-white rounded-xl border border-slate-200';
const inputCls = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400';
const btnSmall = 'inline-flex items-center gap-1 px-2.5 py-1 border border-slate-300 text-slate-700 rounded-md text-xs font-medium hover:bg-slate-50 disabled:opacity-50';

type StatusFilter = 'active' | 'draft' | 'published' | 'archived' | 'all';
type WhenFilter = 'all' | 'upcoming' | 'past' | 'undated';

const FILTERS_KEY = 'studioAdminEventsFilters';

const eur = (c: number) => formatCents(c, 'fr-FR');
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function dateRange(e: AdminEventRow): string {
  if (!e.first_slot_at) return '—';
  const a = dateFmt.format(new Date(e.first_slot_at));
  const b = e.last_slot_end_at ? dateFmt.format(new Date(e.last_slot_end_at)) : a;
  return a === b ? a : `${a} – ${b}`;
}

function when(e: AdminEventRow, now: number): Exclude<WhenFilter, 'all'> {
  if (!e.first_slot_at) return 'undated';
  const end = new Date(e.last_slot_end_at ?? e.first_slot_at).getTime();
  return end >= now ? 'upcoming' : 'past';
}

function loadFilters(): { status: StatusFilter; period: WhenFilter; clientId: number } {
  try {
    const f = JSON.parse(localStorage.getItem(FILTERS_KEY) ?? '{}');
    return { status: f.status ?? 'active', period: f.period ?? 'all', clientId: Number(f.clientId) || 0 };
  } catch {
    return { status: 'active', period: 'all', clientId: 0 };
  }
}

function StatusCell({ e }: { e: AdminEventRow }) {
  const tone = e.status === 'published' ? 'bg-emerald-100 text-emerald-800' : e.status === 'archived' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800';
  const label = e.status === 'published' ? 'Published' : e.status === 'archived' ? 'Archived' : 'Draft';
  return (
    <div className="flex flex-wrap gap-1">
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tone}`}>{label}</span>
      {e.cancelled_at && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-800">Cancelled</span>}
      {e.sales_paused && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-800">Sales paused</span>}
      {e.status === 'published' && !e.listed && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600">Unlisted</span>}
    </div>
  );
}

function Fill({ sold, capacity }: { sold: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((sold / capacity) * 100)) : 0;
  return (
    <div className="min-w-[90px]">
      <div className="text-sm text-slate-900">{sold}<span className="text-slate-400"> / {capacity}</span></div>
      <div className="h-1.5 mt-1 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full ${pct >= 90 ? 'bg-emerald-600' : 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Points eventsApi at the licensee before the editor's first request, and back after. */
function AdminEventEditor({ row, onBack }: { row: AdminEventRow; onBack: () => void }) {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('page');
  useLayoutEffect(() => {
    setEventsClientId(row.client_id);
    setReady(true);
    return () => setEventsClientId(undefined);
  }, [row.client_id]);
  if (!ready) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 bg-slate-100 rounded-lg px-3 py-2">
        Editing as admin on behalf of <span className="font-semibold text-slate-900">{row.licensee}</span>. Changes apply to the licensee&apos;s live event.
      </p>
      <EventEditorView admin={{ eventId: row.id, tab, onTab: setTab, onBack, backLabel: 'All events' }} />
    </div>
  );
}

export function EventsListView() {
  const [rows, setRows] = useState<AdminEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const initial = useMemo(loadFilters, []);
  const [status, setStatus] = useState<StatusFilter>(initial.status);
  const [period, setPeriod] = useState<WhenFilter>(initial.period);
  const [clientId, setClientId] = useState<number>(initial.clientId);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<AdminEventRow | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    eventsAdminApi.events()
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ status, period, clientId })); } catch { /* ignore */ }
  }, [status, period, clientId]);

  const licensees = useMemo(() => {
    const m = new Map<number, { name: string; n: number }>();
    for (const r of rows ?? []) {
      const cur = m.get(r.client_id);
      m.set(r.client_id, { name: r.licensee, n: (cur?.n ?? 0) + 1 });
    }
    return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // A remembered licensee that no longer has events falls back to "All".
  const activeClientId = licensees.some((l) => l.id === clientId) ? clientId : 0;

  const filtered = useMemo(() => {
    const now = Date.now();
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (status === 'active' ? r.status === 'archived' : status !== 'all' && r.status !== status) return false;
      if (period !== 'all' && when(r, now) !== period) return false;
      if (activeClientId && r.client_id !== activeClientId) return false;
      if (needle && ![r.title, r.slug, r.licensee, r.venue_city, r.venue_name].some((v) => v?.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [rows, status, period, activeClientId, q]);

  const totals = useMemo(() => filtered.reduce((a, r) => ({
    events: a.events + 1,
    published: a.published + (r.status === 'published' ? 1 : 0),
    bookings: a.bookings + r.bookings_count,
    tickets: a.tickets + r.tickets_sold,
    revenue: a.revenue + r.revenue_cents,
    fees: a.fees + r.fees_cents,
  }), { events: 0, published: 0, bookings: 0, tickets: 0, revenue: 0, fees: 0 }), [filtered]);

  if (error === 'events_unavailable') return <p className="text-red-600">Events migrations not applied on this database.</p>;

  return (
    <>
      {open && <AdminEventEditor key={open.id} row={open} onBack={() => { setOpen(null); load(); }} />}

      <div className={`space-y-6 ${open ? 'hidden' : ''}`}>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            ['Events', `${totals.events}`, `${totals.published} published`],
            ['Bookings', `${totals.bookings}`, 'confirmed'],
            ['Tickets sold', `${totals.tickets}`, 'confirmed'],
            ['Licensee revenue', eur(totals.revenue), 'net of fees & refunds'],
            ['Taghunter fees', eur(totals.fees), 'net of fee refunds'],
          ].map(([label, value, hint]) => (
            <div key={label} className={`${card} p-4`}>
              <div className="text-xs font-medium text-slate-500">{label}</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{value}</div>
              <div className="text-xs text-slate-400">{hint}</div>
            </div>
          ))}
        </div>

        <div className={`${card} p-4 flex flex-wrap items-end gap-3`}>
          <label className="flex-1 min-w-[200px]">
            <span className="block text-xs text-slate-600 mb-0.5">Search</span>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input className={`${inputCls} w-full pl-8`} value={q} placeholder="Title, slug, licensee, city…" onChange={(e) => setQ(e.target.value)} />
            </div>
          </label>
          <label>
            <span className="block text-xs text-slate-600 mb-0.5">Licensee</span>
            <select className={`${inputCls} max-w-[240px]`} value={activeClientId} onChange={(e) => setClientId(Number(e.target.value))}>
              <option value={0}>All licensees</option>
              {licensees.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.n})</option>)}
            </select>
          </label>
          <label>
            <span className="block text-xs text-slate-600 mb-0.5">Status</span>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="active">Draft + published</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
          </label>
          <label>
            <span className="block text-xs text-slate-600 mb-0.5">When</span>
            <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value as WhenFilter)}>
              <option value="all">Any date</option>
              <option value="upcoming">Upcoming / ongoing</option>
              <option value="past">Past</option>
              <option value="undated">No session yet</option>
            </select>
          </label>
          <button className={`${btnSmall} py-2`} onClick={load} disabled={loading} title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className={card}>
          {error && <p className="text-sm text-red-600 p-4">{error}</p>}
          {!rows && !error ? (
            <div className="flex items-center gap-2 text-slate-500 p-6"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
          ) : rows && filtered.length === 0 ? (
            <p className="text-sm text-slate-500 p-6">{rows.length === 0 ? 'No licensee has created an event yet.' : 'No event matches these filters.'}</p>
          ) : rows && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="py-2.5 px-4">Event</th>
                    <th className="py-2.5 pr-3">Licensee</th>
                    <th className="py-2.5 pr-3">Status</th>
                    <th className="py-2.5 pr-3">Dates</th>
                    <th className="py-2.5 pr-3 text-right">Sessions</th>
                    <th className="py-2.5 pr-3">Tickets</th>
                    <th className="py-2.5 pr-3 text-right">Revenue</th>
                    <th className="py-2.5 pr-3 text-right">Fees</th>
                    <th className="py-2.5 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                      <td className="py-2.5 px-4">
                        <button className="flex items-start gap-3 text-left group" onClick={() => setOpen(e)}>
                          <div className="w-16 h-10 rounded bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                            {e.hero ? <img src={e.hero} alt="" className="w-full h-full object-cover" loading="lazy" /> : <ImageIcon className="w-4 h-4 text-slate-300" />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 group-hover:underline">{e.title || e.slug}</div>
                            <div className="text-xs text-slate-500 font-mono truncate max-w-[220px]">/{e.slug}</div>
                            {(e.venue_city || e.venue_name) && <div className="text-xs text-slate-500">{[e.venue_name, e.venue_city].filter(Boolean).join(', ')}</div>}
                          </div>
                        </button>
                      </td>
                      <td className="py-2.5 pr-3">
                        <button className="text-left hover:underline" onClick={() => setClientId(e.client_id)} title="Show only this licensee">{e.licensee}</button>
                        {!e.licensee_events_enabled && <div className="text-xs text-amber-700">Ticketing switched off</div>}
                      </td>
                      <td className="py-2.5 pr-3"><StatusCell e={e} /></td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-slate-700">{dateRange(e)}</td>
                      <td className="py-2.5 pr-3 text-right">{e.slots_count}</td>
                      <td className="py-2.5 pr-3"><Fill sold={e.tickets_sold} capacity={e.capacity} /></td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap">{eur(e.revenue_cents)}</td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap text-slate-600">{eur(e.fees_cents)}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-right">
                        <button className={btnSmall} onClick={() => setOpen(e)}>Open</button>{' '}
                        {e.status === 'published' && (
                          <a className={btnSmall} href={e.public_url} target="_blank" rel="noreferrer" title="Public page"><ExternalLink className="w-3 h-3" /></a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
