import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Download, Loader2, Plus, Search } from 'lucide-react';
import { eventsApi, formatLocal, formatMoney } from '../../../../lib/eventsApi';
import type { EventBooking } from '../../../../types/events';
import { btnPrimary, btnSecondary, Card, errorText, smallInputCls, type TabProps } from '../ui';
import { BookingDrawer } from '../bookings/BookingDrawer';
import { ManualBookingModal } from '../bookings/ManualBookingModal';
import { PaymentPill, SourcePill, StatusPill } from '../bookings/badges';

// Events phase 3: bookings back-office (filters, totals, detail drawer, manual bookings).

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLLECTED = new Set(['paid', 'partially_refunded', 'refunded', 'offline_paid']);

export function BookingsTab({ data, onSaved }: TabProps) {
  const { t, i18n } = useTranslation('events');
  const ev = data.event;
  const locale = i18n.language;
  const [params, setParams] = useSearchParams();
  const openId = Number(params.get('booking')) || null;
  const [rows, setRows] = useState<EventBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<string>('');
  const [status, setStatus] = useState<string>('active');
  const [q, setQ] = useState('');
  const [manual, setManual] = useState(false);

  const load = useCallback(() => {
    eventsApi.bookings(ev.id).then(setRows).catch((e) => setError(errorText(t, e)));
  }, [ev.id, t]);
  useEffect(() => { load(); }, [load]);

  const open = (id: number | null) => {
    if (id) params.set('booking', String(id)); else params.delete('booking');
    setParams(params, { replace: true });
  };
  const changed = () => {
    load();
    // Capacity / taken counts in the editor payload changed too.
    eventsApi.get(ev.id).then(onSaved).catch(() => {});
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((b) => {
      if (slot && String(b.slot_id) !== slot) return false;
      if (status === 'active' && !(b.status === 'confirmed' || b.status === 'pending')) return false;
      if (status !== 'active' && status !== 'all' && b.status !== status) return false;
      if (needle) {
        const hay = [b.reference, b.team_name, b.buyer_name, b.buyer_email, b.buyer_phone, ...b.tickets.map((tk) => tk.first_name)].join(' ').toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, slot, status, q]);

  const totals = useMemo(() => {
    let bookings = 0, people = 0, collected = 0, refunded = 0, due = 0;
    for (const b of filtered) {
      if (b.status === 'confirmed') { bookings++; people += b.tickets.length; }
      if (COLLECTED.has(b.payment_status)) collected += b.total_cents - b.booking_fee_cents;
      refunded += b.refunded_cents - b.fee_refunded_cents;
      if (b.payment_status === 'offline_due' && b.status === 'confirmed') due += b.total_cents;
    }
    return { bookings, people, collected: collected - refunded, refunded, due };
  }, [filtered]);

  const exportCsv = () => {
    const head = [t('bookings.slot'), t('bookings.reference'), t('bookings.status'), t('bookings.payment'), t('bookings.source'), t('bookings.team'),
      t('bookings.buyer'), 'E-mail', 'Tel', t('bookings.participants'), t('manual.addons'), t('bookings.total'), t('bookings.feeShort'), t('drawer.refundedTotal'), t('drawer.notes')];
    const lines = filtered.map((b) => [
      b.slot_starts_at?.replace('T', ' '), b.reference, t(`bookings.st.${b.status}`), t(`bookings.pay.${b.payment_status}`, { defaultValue: b.payment_status }),
      t(`bookings.src.${b.source}`, { defaultValue: b.source }), b.team_name, b.buyer_name, b.buyer_email, b.buyer_phone,
      b.tickets.map((tk) => [tk.first_name, tk.age !== null ? `(${tk.age})` : '', tk.label].filter(Boolean).join(' ')).join(' | '),
      b.addons.map((a) => `${a.qty} × ${a.label}`).join(' | '),
      (b.total_cents / 100).toFixed(2).replace('.', ','), (b.booking_fee_cents / 100).toFixed(2).replace('.', ','),
      (b.refunded_cents / 100).toFixed(2).replace('.', ','), b.internal_notes,
    ].map(csvCell).join(';'));
    const blob = new Blob(['﻿' + [head.map(csvCell).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${ev.slug}-reservations.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const slotsForFilter = data.slots.filter((s) => s.id !== undefined);

  return (
    <>
      <Card title={t('bookings.title')} help={t('bookings.help')}
        actions={
          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={() => setManual(true)} disabled={slotsForFilter.every((s) => s.status === 'cancelled')}><Plus className="w-4 h-4" />{t('bookings.add')}</button>
            {rows && rows.length > 0 && <button className={btnSecondary} onClick={exportCsv}><Download className="w-4 h-4" />{t('bookings.export')}</button>}
          </div>
        }>
        <div className="flex flex-wrap gap-2 mb-4">
          <select className={smallInputCls} value={slot} onChange={(e) => setSlot(e.target.value)}>
            <option value="">{t('bookings.allSlots')}</option>
            {slotsForFilter.map((s) => <option key={s.id} value={s.id}>{formatLocal(s.starts_at, locale)}{s.status === 'cancelled' ? ` (${t('sessions.cancelled')})` : ''}</option>)}
          </select>
          <select className={smallInputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">{t('bookings.filterActive')}</option>
            <option value="confirmed">{t('bookings.st.confirmed')}</option>
            <option value="pending">{t('bookings.st.pending')}</option>
            <option value="cancelled">{t('bookings.st.cancelled')}</option>
            <option value="all">{t('bookings.filterAll')}</option>
          </select>
          <div className="relative flex-1 min-w-[14rem]">
            <Search className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input className={`${smallInputCls} w-full pl-8`} placeholder={t('bookings.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>

        {rows && rows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Stat label={t('bookings.statBookings')} value={String(totals.bookings)} sub={t('bookings.count', { count: totals.people })} />
            <Stat label={t('bookings.statCollected')} value={formatMoney(totals.collected, locale)} sub={t('bookings.statCollectedHelp')} />
            <Stat label={t('bookings.statRefunded')} value={formatMoney(totals.refunded, locale)} />
            <Stat label={t('bookings.statDue')} value={formatMoney(totals.due, locale)} sub={t('bookings.statDueHelp')} />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!rows && !error && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />{t('common.loading')}</div>}
        {rows && filtered.length === 0 && <p className="text-sm text-slate-500">{rows.length === 0 ? t('bookings.empty') : t('bookings.noMatch')}</p>}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">{t('bookings.slot')}</th>
                  <th className="py-2 pr-3">{t('bookings.reference')}</th>
                  <th className="py-2 pr-3">{t('bookings.team')}</th>
                  <th className="py-2 pr-3">{t('bookings.buyer')}</th>
                  <th className="py-2 pr-3 text-right">{t('bookings.people')}</th>
                  <th className="py-2 pr-3 text-right">{t('bookings.total')}</th>
                  <th className="py-2">{t('bookings.status')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} onClick={() => open(b.id)}
                    className={`border-b border-slate-100 align-top cursor-pointer hover:bg-slate-50 ${b.status === 'cancelled' || b.status === 'expired' ? 'text-slate-400' : ''} ${openId === b.id ? 'bg-slate-100' : ''}`}>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatLocal(b.slot_starts_at, locale)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">
                      {b.reference}
                      {b.disputed && <AlertTriangle className="w-3.5 h-3.5 text-red-600 inline ml-1 -mt-0.5" />}
                    </td>
                    <td className="py-2 pr-3">{b.team_name || '—'}</td>
                    <td className="py-2 pr-3">
                      <div>{b.buyer_name || '—'}</div>
                      <div className="text-xs text-slate-500">{b.buyer_email}</div>
                    </td>
                    <td className="py-2 pr-3 text-right">{b.tickets.length}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {formatMoney(b.total_cents, locale)}
                      {b.refunded_cents > 0 && <div className="text-xs text-violet-700">− {formatMoney(b.refunded_cents, locale)}</div>}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1"><StatusPill b={b} /><PaymentPill b={b} />{b.source !== 'online' && <SourcePill b={b} />}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openId && <BookingDrawer data={data} bookingId={openId} onClose={() => open(null)} onChanged={changed} />}
      {manual && (
        <ManualBookingModal data={data} defaultSlotId={slot ? Number(slot) : undefined} onClose={() => setManual(false)}
          onCreated={(b) => { setManual(false); changed(); open(b.id); }} />
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
