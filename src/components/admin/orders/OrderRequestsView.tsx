import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { ordersApi, OrdersApiError } from '../../../lib/ordersApi';
import { centsToInput, formatDate, formatMoney, parseEuros, rentalDays, STATUS_STYLES } from '../../../lib/ordersFormat';
import type { OrderKind, OrderRequestDetail, OrderRequestSummary, OrderStatus } from '../../../types/orders';
import { StockNotice } from './StockNotice';

// Admin > Commandes > "Matériel supplémentaire & back up" (kind=sale) and
// "Location de matériel" (kind=rent): the licensees' requests of that kind.
// Memory: project_studio_commandes_equipment_orders.

const STATUSES: OrderStatus[] = ['new', 'confirmed', 'shipped', 'done', 'cancelled'];
const STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'New', confirmed: 'Confirmed', shipped: 'Shipped', done: 'Completed', cancelled: 'Cancelled',
};
const MODE_LABEL: Record<string, string> = { post: 'By carrier', in_person: 'In person' };
const inputCls = 'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm';

function Badge({ status }: { status: OrderStatus }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function OrderRequestsView({ kind }: { kind: OrderKind }) {
  const [filter, setFilter] = useState<OrderStatus | ''>('');
  const [rows, setRows] = useState<OrderRequestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Deep link from the notification email: /admin?tab=orders-sale&request=12
  const [openId, setOpenId] = useState<number | null>(() => Number(new URLSearchParams(window.location.search).get('request')) || null);

  const load = useCallback(async () => {
    try {
      setRows(await ordersApi.adminRequests(kind, filter));
      setError(null);
    } catch (e) {
      setError(e instanceof OrdersApiError && e.message === 'orders_unavailable'
        ? 'Orders tables are missing: run backend/database/add_orders_equipment.sql.'
        : 'Could not load requests.');
    }
  }, [kind, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Consume the deep link once so it doesn't reopen on the other kind's tab.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('request')) {
      url.searchParams.delete('request');
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, []);

  if (openId) {
    return <RequestDetail id={openId} onBack={() => { setOpenId(null); void load(); }} />;
  }

  return (
    <div className="space-y-4">
      <StockNotice />
      <div className="flex flex-wrap gap-2">
        {(['', ...STATUSES] as const).map((s) => (
          <button key={s || 'all'} type="button" onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-sm border ${filter === s ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
            {s ? STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">{error}</div>
      ) : rows === null ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500 text-sm">No requests.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Licensee</th>
                {kind === 'rent' && <th className="px-4 py-2 font-medium">Period</th>}
                <th className="px-4 py-2 font-medium">Sent</th>
                <th className="px-4 py-2 font-medium text-right">Lines</th>
                <th className="px-4 py-2 font-medium text-right">Total excl. VAT</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">{r.number}</td>
                  <td className="px-4 py-2 text-slate-700">{r.client_name ?? `#${r.client_id}`}</td>
                  {kind === 'rent' && (
                    <td className="px-4 py-2 text-slate-700">{formatDate(r.rent_start, 'fr')} → {formatDate(r.rent_end, 'fr')} <span className="text-slate-400">({r.days} d)</span></td>
                  )}
                  <td className="px-4 py-2 text-slate-600">{formatDate(r.created_at, 'fr')}</td>
                  <td className="px-4 py-2 text-right">{r.line_count}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(r.total_cents, 'fr')}</td>
                  <td className="px-4 py-2"><Badge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type EditLine = { key: string; id?: number; product_id: number | null; sku: string; name: string; price: string; qty: string };

function toEditLines(r: OrderRequestDetail): EditLine[] {
  return r.lines.map((l) => ({
    key: `l${l.id}`, id: l.id, product_id: l.product_id, sku: l.sku ?? '', name: l.name, price: centsToInput(l.unit_price_cents), qty: String(l.quantity),
  }));
}

function RequestDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const [req, setReq] = useState<OrderRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<OrderStatus>('new');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [applying, setApplying] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const apply = (r: OrderRequestDetail) => {
    setReq(r);
    setLines(toEditLines(r));
    setStart(r.rent_start ?? '');
    setEnd(r.rent_end ?? '');
    setStatus(r.status);
    setDirty(false);
  };

  useEffect(() => {
    ordersApi.adminRequest(id).then(apply).catch(() => setError('Request not found.'));
  }, [id]);

  if (!req) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="w-4 h-4" />Back to the list</button>
        {error ? <p className="text-slate-600">{error}</p> : <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" /></div>}
      </div>
    );
  }

  const rent = req.kind === 'rent';
  const days = rent ? rentalDays(start, end) : 1;
  const lineTotal = (l: EditLine) => (parseEuros(l.price) ?? 0) * (Number(l.qty) || 0) * (rent && l.product_id != null ? Math.max(days, 1) : 1);
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);

  const edit = (key: string, patch: Partial<EditLine>) => {
    setLines((list) => list.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setDirty(true);
  };

  const saveLines = async () => {
    setSaving(true);
    setFlash(null);
    try {
      const payload = lines.map((l) => ({
        id: l.id, sku: l.sku.trim() || null, name: l.name.trim(), unit_price_cents: parseEuros(l.price) ?? -1, quantity: Number(l.qty) || 0,
      }));
      if (payload.some((l) => !l.name || l.unit_price_cents < 0 || l.quantity <= 0)) {
        setFlash('Each line needs a name, a price and a quantity of at least 1.');
        return;
      }
      apply(await ordersApi.adminRequestUpdate(req.id, payload, rent ? start : null, rent ? end : null));
      setFlash('Lines saved. The licensee is not emailed until you change the status.');
    } catch {
      setFlash('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async () => {
    if (dirty && !window.confirm('Unsaved line changes will be lost. Continue?')) return;
    setApplying(true);
    setFlash(null);
    try {
      const r = await ordersApi.adminRequestStatus(req.id, status, note, notify);
      apply(r.request);
      setNote('');
      setFlash(r.mailed ? 'Status updated, licensee emailed.' : 'Status updated.');
    } catch {
      setFlash('Status update failed.');
    } finally {
      setApplying(false);
    }
  };

  const address = [req.company, req.contact_name, req.address_line1, req.address_line2, [req.postal_code, req.city].filter(Boolean).join(' '), req.country].filter(Boolean);

  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="w-4 h-4" />Back to the list</button>
      <StockNotice />
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-bold text-slate-900">{req.number}</h3>
        <Badge status={req.status} />
        <span className="text-slate-600">{req.client_name ?? `#${req.client_id}`} · sent {formatDate(req.created_at, 'fr')} · licensee language {req.language.toUpperCase()}</span>
      </div>
      {flash && <p className="text-sm text-slate-700 bg-slate-100 rounded-lg px-3 py-2">{flash}</p>}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="font-semibold text-slate-900">Lines</h4>
                <p className="text-xs text-slate-500">
                  {rent ? 'Product lines are qty × price/day × days. Added lines (e.g. shipping) are qty × price.' : 'Add lines for shipping or adjustments.'}
                </p>
              </div>
              {rent && (
                <div className="flex items-end gap-2 text-sm">
                  <label className="text-xs text-slate-600">From<input type="date" value={start} onChange={(e) => { setStart(e.target.value); setDirty(true); }} className={`mt-1 ${inputCls}`} /></label>
                  <label className="text-xs text-slate-600">To<input type="date" value={end} min={start} onChange={(e) => { setEnd(e.target.value); setDirty(true); }} className={`mt-1 ${inputCls}`} /></label>
                  <span className="pb-2 text-slate-500">{days} d</span>
                </div>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium w-28">SKU</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium w-20 text-right">Qty</th>
                    <th className="px-3 py-2 font-medium w-32 text-right">Unit € excl. VAT</th>
                    <th className="px-3 py-2 font-medium w-28 text-right">Total</th>
                    <th className="px-3 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => (
                    <tr key={l.key}>
                      <td className="px-3 py-1.5"><input value={l.sku} onChange={(e) => edit(l.key, { sku: e.target.value })} className={inputCls} /></td>
                      <td className="px-3 py-1.5">
                        <input value={l.name} onChange={(e) => edit(l.key, { name: e.target.value })} className={inputCls} />
                        {l.product_id == null && <span className="text-[11px] text-slate-400">added line{rent ? ' (not × days)' : ''}</span>}
                      </td>
                      <td className="px-3 py-1.5"><input type="number" min={1} value={l.qty} onChange={(e) => edit(l.key, { qty: e.target.value })} className={`${inputCls} text-right`} /></td>
                      <td className="px-3 py-1.5">
                        <input value={l.price} inputMode="decimal" onChange={(e) => edit(l.key, { price: e.target.value })} className={`${inputCls} text-right`} />
                        {rent && l.product_id != null && <span className="block text-right text-[11px] text-slate-400">per day</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right">{formatMoney(lineTotal(l), 'fr')}</td>
                      <td className="px-3 py-1.5">
                        <button type="button" onClick={() => { setLines((list) => list.filter((x) => x.key !== l.key)); setDirty(true); }} className="text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200">
                    <td colSpan={4} className="px-3 py-2 text-right font-semibold">Total excl. VAT</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatMoney(total, 'fr')}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex items-center justify-between p-4 border-t border-slate-200">
              <button type="button" onClick={() => { setLines((list) => [...list, { key: `n${Date.now()}`, product_id: null, sku: '', name: 'Frais de port', price: '', qty: '1' }]); setDirty(true); }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 text-sm">
                <Plus className="w-4 h-4" />Add line
              </button>
              <div className="flex gap-2">
                {dirty && <button type="button" onClick={() => apply(req)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Discard</button>}
                <button type="button" disabled={!dirty || saving} onClick={() => void saveLines()} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-40">
                  <Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save lines'}
                </button>
              </div>
            </div>
          </div>

          {req.message && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-900 mb-1">Licensee message</h4>
              <p className="text-sm text-slate-700 whitespace-pre-line">{req.message}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h4 className="font-semibold text-slate-900">Status</h4>
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className={inputCls}>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000}
              placeholder="Note to the licensee (optional, shown in their history and email)" className={inputCls} />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />Email the licensee
            </label>
            <button type="button" disabled={applying || (status === req.status && !note.trim())} onClick={() => void applyStatus()}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-40">
              {applying ? 'Applying…' : 'Apply'}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm">
            <h4 className="font-semibold text-slate-900 mb-2">Delivery / contact</h4>
            {address.map((a, i) => <p key={i} className="text-slate-700">{a}</p>)}
            <p className="text-slate-700 mt-1">
              {req.contact_email && <a href={`mailto:${req.contact_email}`} className="text-blue-600 hover:underline">{req.contact_email}</a>}
              {req.contact_phone ? ` · ${req.contact_phone}` : ''}
            </p>
            {rent && (
              <p className="text-slate-600 mt-2">
                Pickup / delivery: {MODE_LABEL[req.pickup_mode ?? ''] ?? '-'}<br />
                Return: {MODE_LABEL[req.return_mode ?? ''] ?? '-'}
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm">
            <h4 className="font-semibold text-slate-900 mb-2">Billing</h4>
            {req.billing ? (
              [req.billing.company, req.billing.address_line1, req.billing.address_line2, [req.billing.postal_code, req.billing.city].filter(Boolean).join(' '), req.billing.country]
                .filter(Boolean).map((a, i) => <p key={i} className="text-slate-700">{a}</p>)
            ) : (
              <p className="text-slate-500">No main address on the licensee account when this request was sent.</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h4 className="font-semibold text-slate-900 mb-3">History</h4>
            <ol className="space-y-3 text-sm">
              {req.events.map((e) => (
                <li key={e.id}>
                  <p className="text-slate-900">
                    {e.type === 'created' ? 'Request sent' : e.type === 'edited' ? 'Lines edited' : `Status → ${STATUS_LABEL[e.status as OrderStatus] ?? e.status}`}
                    <span className="text-slate-500"> · {e.actor === 'client' ? 'licensee' : 'admin'}</span>
                  </p>
                  <p className="text-xs text-slate-500">{e.created_at}</p>
                  {e.note && <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-slate-700 whitespace-pre-line">{e.note}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
