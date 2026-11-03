import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Ban, Check, Copy, Loader2, Mail, Pencil, Undo2, X } from 'lucide-react';
import { EventsApiError, eventsApi, formatLocal, formatMoney } from '../../../../lib/eventsApi';
import type { BookingUpdateInput, EventBookingDetail, EventEditorPayload } from '../../../../types/events';
import { btnDanger, btnPrimary, btnSecondary, errorText, Field, inputCls, MoneyInput, Pill, smallInputCls, Toggle } from '../ui';
import { PaymentPill, SourcePill, StatusPill } from './badges';

// Side panel with everything about one booking + the licensee's actions
// (edit, mark paid, refund, cancel, resend). Events phase 3.

type Mode = 'view' | 'edit' | 'refund' | 'cancel';

export function BookingDrawer({ data, bookingId, onClose, onChanged }: {
  data: EventEditorPayload; bookingId: number; onClose: () => void; onChanged: () => void;
}) {
  const { t, i18n } = useTranslation('events');
  const locale = i18n.language;
  const [b, setB] = useState<EventBookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    eventsApi.booking(bookingId).then(setB).catch((e) => setError(errorText(t, e)));
  }, [bookingId, t]);
  useEffect(() => { setB(null); setMode('view'); setNotice(null); load(); }, [load]);

  const done = (next: EventBookingDetail, text: string) => {
    setB(next);
    setMode('view');
    setNotice({ ok: true, text });
    onChanged();
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof EventsApiError && e.message === 'invalid_amount') {
        setNotice({ ok: false, text: t('drawer.refundTooMuch', { max: formatMoney(Number(e.details.max_cents ?? 0), locale) }) });
      } else {
        setNotice({ ok: false, text: errorText(t, e) });
      }
    } finally {
      setBusy(false);
    }
  };

  const money = (c: number) => formatMoney(c, locale, data.event.currency);
  const online = b?.source === 'online';
  const offline = b && (b.payment_status === 'offline_due' || b.payment_status === 'offline_paid');
  const canCancel = b && (b.status === 'confirmed' || b.status === 'pending');

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200">
          <div>
            <div className="font-mono text-lg font-bold text-slate-900">{b?.reference ?? '…'}</div>
            {b && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                <StatusPill b={b} /><PaymentPill b={b} /><SourcePill b={b} />
                {b.disputed && <Pill tone="red">{t('drawer.disputed')}</Pill>}
                {b.anonymised && <Pill tone="slate">{t('drawer.anonymised')}</Pill>}
              </div>
            )}
          </div>
          <button className="p-2 rounded-lg hover:bg-slate-100" onClick={onClose} aria-label="×"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">
          {error && <p className="text-red-600">{error}</p>}
          {!b && !error && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />{t('common.loading')}</div>}
          {b && (
            <>
              {notice && <p className={`rounded-lg p-3 ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{notice.text}</p>}
              {b.disputed && (
                <p className="rounded-lg p-3 bg-red-50 text-red-800"><AlertTriangle className="w-4 h-4 inline mr-1 -mt-0.5" />{t('drawer.disputeHelp')}</p>
              )}

              {/* Actions */}
              {mode === 'view' && !b.anonymised && (
                <div className="flex flex-wrap gap-2">
                  <button className={btnSecondary} onClick={() => setMode('edit')}><Pencil className="w-4 h-4" />{t('drawer.edit')}</button>
                  {b.status === 'confirmed' && b.buyer_email && (
                    <button className={btnSecondary} disabled={busy} onClick={() => run(async () => {
                      await eventsApi.bookingResend(b.id);
                      setNotice({ ok: true, text: t('drawer.resent', { email: b.buyer_email }) });
                    })}><Mail className="w-4 h-4" />{t('drawer.resend')}</button>
                  )}
                  {offline && b.status === 'confirmed' && (
                    <button className={btnSecondary} disabled={busy} onClick={() => run(async () => {
                      const next = await eventsApi.bookingUpdate(b.id, { payment_status: b.payment_status === 'offline_due' ? 'offline_paid' : 'offline_due' });
                      done(next, t('common.saved'));
                    })}>
                      <Check className="w-4 h-4" />{t(b.payment_status === 'offline_due' ? 'drawer.markPaid' : 'drawer.markUnpaid')}
                    </button>
                  )}
                  {online && b.refundable_cents > 0 && (
                    <button className={btnSecondary} onClick={() => setMode('refund')}><Undo2 className="w-4 h-4" />{t('drawer.refund')}</button>
                  )}
                  {canCancel && <button className={`${btnSecondary} text-red-700 border-red-200 hover:bg-red-50`} onClick={() => setMode('cancel')}><Ban className="w-4 h-4" />{t('drawer.cancel')}</button>}
                </div>
              )}
              {mode === 'edit' && <EditForm b={b} busy={busy} onCancel={() => setMode('view')} onSave={(input) => run(async () => done(await eventsApi.bookingUpdate(b.id, input), t('common.saved')))} />}
              {mode === 'refund' && <RefundForm b={b} money={money} busy={busy} onCancel={() => setMode('view')}
                onSubmit={(amount, reason, notify) => run(async () => done(await eventsApi.bookingRefund(b.id, amount, reason, notify), t('drawer.refunded', { amount: money(amount) })))} />}
              {mode === 'cancel' && <CancelForm b={b} money={money} busy={busy} onCancel={() => setMode('view')}
                onSubmit={(input) => run(async () => done(await eventsApi.bookingCancel(b.id, input), t('drawer.cancelledDone')))} />}

              {/* Who / when */}
              <Section title={t('drawer.booking')}>
                <Row k={t('bookings.slot')} v={formatLocal(b.slot_starts_at, locale)} />
                {b.team_name && <Row k={t('bookings.team')} v={b.team_name} />}
                <Row k={t('bookings.buyer')} v={<>
                  <div>{b.buyer_name || '—'}</div>
                  {b.buyer_email && <a className="text-blue-700 hover:underline" href={`mailto:${b.buyer_email}`}>{b.buyer_email}</a>}
                  {b.buyer_phone && <div><a className="text-blue-700 hover:underline" href={`tel:${b.buyer_phone}`}>{b.buyer_phone}</a></div>}
                </>} />
                <Row k={t('drawer.language')} v={b.language.toUpperCase()} />
                <Row k={t('drawer.created')} v={b.created_at ? new Date(b.created_at).toLocaleString(locale) : '—'} />
                {b.cancel_reason && b.status === 'cancelled' && <Row k={t('drawer.cancelReason')} v={b.cancel_reason} />}
                {b.internal_notes && <Row k={t('drawer.notes')} v={<span className="whitespace-pre-line">{b.internal_notes}</span>} />}
              </Section>

              <Section title={t('bookings.participants')}>
                <ul className="space-y-1">
                  {b.tickets.map((tk) => (
                    <li key={tk.id} className="flex justify-between gap-3">
                      <span>{tk.first_name || '—'}{tk.age !== null ? ` (${tk.age})` : ''} <span className="text-slate-400">· {tk.label}</span></span>
                      <span className="text-slate-600 whitespace-nowrap">{tk.unit_price_cents > 0 ? money(tk.unit_price_cents) : t('tickets.free')}</span>
                    </li>
                  ))}
                  {b.addons.map((a, i) => (
                    <li key={`a${i}`} className="flex justify-between gap-3">
                      <span>{a.qty} × {a.label}</span>
                      <span className="text-slate-600 whitespace-nowrap">{money(a.qty * a.unit_price_cents)}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              {b.answers.length > 0 && (
                <Section title={t('drawer.answers')}>
                  {b.answers.map((a) => <Row key={a.question_id} k={a.label} v={a.display ?? '—'} />)}
                </Section>
              )}

              <Section title={t('drawer.amounts')}>
                <Row k={t('drawer.subtotal')} v={money(b.subtotal_cents)} />
                {b.discount_cents > 0 && <Row k={t('drawer.discount', { code: b.promo_code ?? '' })} v={`− ${money(b.discount_cents)}`} />}
                {b.booking_fee_cents > 0 && <Row k={t('drawer.fee')} v={money(b.booking_fee_cents)} />}
                <Row k={<b>{t('bookings.total')}</b>} v={<b>{money(b.total_cents)}</b>} />
                {b.refunded_cents > 0 && <Row k={t('drawer.refundedTotal')} v={<span className="text-violet-700">{money(b.refunded_cents)}</span>} />}
                {online && b.status !== 'pending' && <Row k={t('drawer.refundable')} v={money(b.refundable_cents)} />}
                {b.source !== 'online' && <p className="text-xs text-slate-500 mt-1">{t('drawer.offlineHelp')}</p>}
              </Section>

              {b.refunds.length > 0 && (
                <Section title={t('drawer.refunds')}>
                  {b.refunds.map((r, i) => (
                    <Row key={i} k={r.created_at ? new Date(r.created_at).toLocaleString(locale) : ''}
                      v={<span>{money(r.amount_cents)}{r.fee_refunded_cents > 0 ? ` (${t('drawer.inclFee', { amount: money(r.fee_refunded_cents) })})` : ''}
                        <span className="block text-xs text-slate-500">{t(`drawer.by.${r.initiated_by}`, { defaultValue: r.initiated_by })}{r.reason ? ` · ${r.reason}` : ''}</span></span>} />
                  ))}
                </Section>
              )}

              <Section title={t('drawer.manageLink')}>
                <p className="text-xs text-slate-500 mb-2">{t('drawer.manageLinkHelp')}</p>
                <div className="flex gap-2">
                  <input readOnly className={`${smallInputCls} flex-1 text-xs`} value={b.manage_url} />
                  <button className={btnSecondary} onClick={() => {
                    void navigator.clipboard?.writeText(b.manage_url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}>{copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}</button>
                </div>
              </Section>

              <Section title={t('drawer.history')}>
                <ol className="space-y-1.5">
                  {b.log.map((l, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="text-xs text-slate-400 whitespace-nowrap pt-0.5">{l.created_at ? new Date(l.created_at).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
                      <span>
                        {t(`drawer.log.${l.type}`, { defaultValue: l.type })}
                        {l.type === 'refund' && l.data?.amount !== undefined && ` · ${money(Number(l.data.amount))}`}
                        {l.actor_type && <span className="text-xs text-slate-400"> · {t(`drawer.actor.${l.actor_type}`, { defaultValue: l.actor_type })}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</h4>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-slate-500">{k}</span>
      <span className="text-right text-slate-900">{v}</span>
    </div>
  );
}

function EditForm({ b, busy, onSave, onCancel }: { b: EventBookingDetail; busy: boolean; onSave: (i: BookingUpdateInput) => void; onCancel: () => void }) {
  const { t } = useTranslation('events');
  const [team, setTeam] = useState(b.team_name ?? '');
  const [buyer, setBuyer] = useState({ first_name: b.buyer_first_name ?? '', last_name: b.buyer_last_name ?? '', email: b.buyer_email ?? '', phone: b.buyer_phone ?? '' });
  const [players, setPlayers] = useState(b.tickets.map((tk) => ({ first_name: tk.first_name ?? '', age: tk.age })));
  const [notes, setNotes] = useState(b.internal_notes ?? '');
  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
      <Field label={t('bookings.team')}><input className={inputCls} value={team} maxLength={60} onChange={(e) => setTeam(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('manual.firstName')}><input className={inputCls} value={buyer.first_name} onChange={(e) => setBuyer({ ...buyer, first_name: e.target.value })} /></Field>
        <Field label={t('manual.lastName')}><input className={inputCls} value={buyer.last_name} onChange={(e) => setBuyer({ ...buyer, last_name: e.target.value })} /></Field>
        <Field label={t('manual.email')}><input type="email" className={inputCls} value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} /></Field>
        <Field label={t('manual.phone')}><input className={inputCls} value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} /></Field>
      </div>
      <div>
        <div className="text-sm font-medium text-slate-700 mb-1">{t('bookings.participants')}</div>
        {players.map((p, i) => (
          <div key={i} className="flex gap-2 mb-1.5 items-center">
            <span className="text-xs text-slate-400 w-28 truncate">{b.tickets[i].label}</span>
            <input className={`${smallInputCls} flex-1`} placeholder={t('manual.firstName')} value={p.first_name} onChange={(e) => setPlayers(players.map((x, j) => (j === i ? { ...x, first_name: e.target.value } : x)))} />
            <input className={`${smallInputCls} w-20`} inputMode="numeric" placeholder={t('manual.age')} value={p.age ?? ''}
              onChange={(e) => setPlayers(players.map((x, j) => (j === i ? { ...x, age: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) } : x)))} />
          </div>
        ))}
      </div>
      <Field label={t('drawer.notes')} help={t('drawer.notesHelp')}>
        <textarea className={`${inputCls} min-h-[70px]`} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy} onClick={() => onSave({
          team_name: team, buyer, tickets: players.map((p) => ({ first_name: p.first_name || null, age: p.age })), internal_notes: notes,
        })}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('common.save')}</button>
        <button className={btnSecondary} onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  );
}

function RefundForm({ b, money, busy, onSubmit, onCancel }: {
  b: EventBookingDetail; money: (c: number) => string; busy: boolean; onSubmit: (amount: number, reason: string, notify: boolean) => void; onCancel: () => void;
}) {
  const { t } = useTranslation('events');
  const [amount, setAmount] = useState<number | null>(b.refundable_cents);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const tooMuch = amount !== null && amount > b.refundable_cents;
  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
      <div className="font-medium text-slate-900">{t('drawer.refundTitle')}</div>
      <p className="text-xs text-slate-600">{t('drawer.refundHelp', { max: money(b.refundable_cents), fee: money(b.booking_fee_cents) })}</p>
      <div className="flex items-end gap-3">
        <Field label={t('drawer.amount')} error={tooMuch ? t('drawer.refundTooMuch', { max: money(b.refundable_cents) }) : null}>
          <MoneyInput cents={amount} onChange={setAmount} className={`${smallInputCls} w-32`} />
        </Field>
        <button type="button" className={`${btnSecondary} mb-0.5`} onClick={() => setAmount(b.refundable_cents)}>{t('drawer.refundAll')}</button>
      </div>
      <Field label={t('drawer.reason')}><input className={inputCls} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} /></Field>
      {b.buyer_email && <Toggle checked={notify} onChange={setNotify} label={t('drawer.notifyBuyer')} />}
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy || !amount || tooMuch} onClick={() => amount && onSubmit(amount, reason, notify)}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('drawer.refundConfirm', { amount: money(amount ?? 0) })}
        </button>
        <button className={btnSecondary} onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  );
}

function CancelForm({ b, money, busy, onSubmit, onCancel }: {
  b: EventBookingDetail; money: (c: number) => string; busy: boolean; onSubmit: (i: { refund: boolean; reason: string; notify: boolean }) => void; onCancel: () => void;
}) {
  const { t } = useTranslation('events');
  const canRefund = b.source === 'online' && b.refundable_cents > 0;
  const [refund, setRefund] = useState(canRefund);
  const [notify, setNotify] = useState(!!b.buyer_email && b.status === 'confirmed');
  const [reason, setReason] = useState('');
  return (
    <div className="rounded-xl border border-red-200 p-4 space-y-3 bg-red-50/40">
      <div className="font-medium text-red-900">{t('drawer.cancelTitle')}</div>
      <p className="text-xs text-slate-700">{t(b.status === 'pending' ? 'drawer.cancelPendingHelp' : 'drawer.cancelHelp')}</p>
      {canRefund && <Toggle checked={refund} onChange={setRefund} label={t('drawer.cancelRefund', { amount: money(b.refundable_cents) })} help={t('drawer.feeKept')} />}
      {b.buyer_email && b.status === 'confirmed' && <Toggle checked={notify} onChange={setNotify} label={t('drawer.notifyBuyer')} />}
      <Field label={t('drawer.reason')}><input className={inputCls} value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="flex gap-2">
        <button className={btnDanger} disabled={busy} onClick={() => onSubmit({ refund: canRefund && refund, reason, notify })}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('drawer.cancelConfirm')}
        </button>
        <button className={btnSecondary} onClick={onCancel}>{t('common.back')}</button>
      </div>
    </div>
  );
}
