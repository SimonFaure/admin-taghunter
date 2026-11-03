import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { EventsApiError, eventsApi, formatLocal } from '../../../../lib/eventsApi';
import type { EventBookingDetail, EventEditorPayload, ManualBookingInput } from '../../../../types/events';
import { btnPrimary, btnSecondary, errorText, Field, inputCls, IntInput, Modal, smallInputCls, Toggle } from '../ui';

// Licensee-entered booking (paid on site, on invoice, or free invitation).
// Counts against capacity; no booking fee; QR email optional. Events phase 3.

type Source = ManualBookingInput['source'];

export function ManualBookingModal({ data, defaultSlotId, onClose, onCreated }: {
  data: EventEditorPayload; defaultSlotId?: number; onClose: () => void; onCreated: (b: EventBookingDetail) => void;
}) {
  const { t, i18n } = useTranslation('events');
  const ev = data.event;
  const lang = ev.main_language;
  const slots = data.slots.filter((s) => s.id !== undefined && s.status !== 'cancelled');
  const [slotId, setSlotId] = useState<number>(defaultSlotId ?? (slots[0]?.id as number) ?? 0);
  const [source, setSource] = useState<Source>('manual_onsite');
  const [paid, setPaid] = useState(false);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [names, setNames] = useState<{ first_name: string; age: number | null }[]>([]);
  const [showNames, setShowNames] = useState(false);
  const [addonQty, setAddonQty] = useState<Record<number, number>>({});
  const [team, setTeam] = useState('');
  const [buyer, setBuyer] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [notes, setNotes] = useState('');
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const slot = slots.find((s) => s.id === slotId);
  const types = data.ticket_types.filter((tp) => tp.id !== undefined && slot && String(tp.id) in slot.types);
  const label = (i18n18: Record<string, string | undefined>) => i18n18[lang] || Object.values(i18n18).find(Boolean) || '';
  const requested = useMemo(() => types.flatMap((tp) => Array.from({ length: qty[tp.id as number] ?? 0 }, () => tp.id as number)), [types, qty]);
  const remaining = slot ? Math.max(0, slot.capacity - (slot.taken ?? 0)) : 0;
  const variants = (data.addons ?? []).filter((a) => a.active).flatMap((a) => a.variants.filter((v) => v.active && v.id !== undefined).map((v) => ({
    id: v.id as number, label: [label(a.label_i18n), label(v.label_i18n)].filter(Boolean).join(' – '),
  })));
  const err = (k: string) => (errors[k] ? t(`errors.${errors[k]}`, { defaultValue: errors[k] }) : null);

  const submit = async () => {
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const b = await eventsApi.bookingManualCreate(ev.id, {
        slot_id: slotId,
        source,
        paid: source !== 'manual_free' && paid,
        send_email: sendEmail && buyer.email.trim() !== '',
        notes,
        lang: i18n.language,
        tickets: requested.map((typeId, i) => ({ ticket_type_id: typeId, first_name: names[i]?.first_name || undefined, age: names[i]?.age ?? null })),
        team_name: team,
        buyer,
        addons: Object.entries(addonQty).filter(([, q]) => q > 0).map(([id, q]) => ({ variant_id: Number(id), qty: q })),
      });
      onCreated(b);
    } catch (e) {
      if (e instanceof EventsApiError && e.errors) setErrors(e.errors);
      setError(e instanceof EventsApiError && e.message === 'sold_out'
        ? t('manual.soldOut', { count: Number(e.details.remaining ?? 0) })
        : e instanceof EventsApiError && e.message === 'type_sold_out' ? t('manual.typeSoldOut') : errorText(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal wide title={t('manual.title')} onClose={onClose} footer={<>
      <button className={btnSecondary} onClick={onClose}>{t('common.cancel')}</button>
      <button className={btnPrimary} disabled={busy || !slot || requested.length === 0} onClick={submit}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('manual.create')}
      </button>
    </>}>
      <div className="space-y-5 text-sm">
        <p className="text-slate-600">{t('manual.help')}</p>
        {error && <p className="rounded-lg bg-red-50 text-red-700 p-3">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('bookings.slot')}>
            <select className={inputCls} value={slotId} onChange={(e) => { setSlotId(Number(e.target.value)); setQty({}); }}>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>{formatLocal(s.starts_at, i18n.language)} · {t('manual.left', { count: Math.max(0, s.capacity - (s.taken ?? 0)) })}{s.status === 'closed' ? ` · ${t('sessions.closed')}` : ''}</option>
              ))}
            </select>
          </Field>
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-1">{t('manual.source')}</span>
            <div className="space-y-1">
              {(['manual_onsite', 'manual_invoice', 'manual_free'] as Source[]).map((s) => (
                <label key={s} className="flex items-center gap-2"><input type="radio" checked={source === s} onChange={() => setSource(s)} />{t(`bookings.src.${s}`)}</label>
              ))}
            </div>
            {source !== 'manual_free' && <div className="mt-2"><Toggle checked={paid} onChange={setPaid} label={t('manual.alreadyPaid')} /></div>}
          </div>
        </div>

        <div>
          <div className="font-medium text-slate-800 mb-1">{t('manual.tickets')} <span className="text-xs font-normal text-slate-500">({t('manual.left', { count: remaining })})</span></div>
          {types.length === 0 && <p className="text-slate-500">{t('manual.noTypes')}</p>}
          <div className="space-y-1.5">
            {types.map((tp) => (
              <div key={tp.id} className="flex items-center justify-between gap-3">
                <span>{label(tp.label_i18n)} <span className="text-slate-400">· {tp.base_price_cents > 0 ? `${(tp.base_price_cents / 100).toFixed(2).replace('.', ',')} €` : t('tickets.free')}</span></span>
                <IntInput value={qty[tp.id as number] ?? 0} min={0} max={30} onChange={(v) => setQty({ ...qty, [tp.id as number]: Math.max(0, v ?? 0) })} className={`${smallInputCls} w-20`} />
              </div>
            ))}
          </div>
          {err('tickets') && <p className="text-xs text-red-600 mt-1">{err('tickets')}</p>}
          <p className="text-xs text-slate-500 mt-1">{t('manual.priceHelp')}</p>
          {requested.length > 0 && (
            <button type="button" className="text-xs text-blue-700 hover:underline mt-2" onClick={() => setShowNames(!showNames)}>{t(showNames ? 'manual.hideNames' : 'manual.showNames')}</button>
          )}
          {showNames && requested.map((typeId, i) => (
            <div key={i} className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-slate-400 w-28 truncate">{label(types.find((x) => x.id === typeId)?.label_i18n ?? {})}</span>
              <input className={`${smallInputCls} flex-1`} placeholder={t('manual.firstName')} value={names[i]?.first_name ?? ''}
                onChange={(e) => { const n = names.slice(); n[i] = { first_name: e.target.value, age: n[i]?.age ?? null }; setNames(n); }} />
              <input className={`${smallInputCls} w-20`} inputMode="numeric" placeholder={t('manual.age')} value={names[i]?.age ?? ''}
                onChange={(e) => { const n = names.slice(); n[i] = { first_name: n[i]?.first_name ?? '', age: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) }; setNames(n); }} />
            </div>
          ))}
        </div>

        {variants.length > 0 && (
          <div>
            <div className="font-medium text-slate-800 mb-1">{t('manual.addons')}</div>
            {variants.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 mb-1.5">
                <span>{v.label}</span>
                <IntInput value={addonQty[v.id] ?? 0} min={0} max={50} onChange={(q) => setAddonQty({ ...addonQty, [v.id]: Math.max(0, q ?? 0) })} className={`${smallInputCls} w-20`} />
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('bookings.team')} wide><input className={inputCls} value={team} maxLength={60} onChange={(e) => setTeam(e.target.value)} placeholder={t('manual.teamPlaceholder')} /></Field>
          <Field label={t('manual.firstName')} error={err('buyer.first_name')}><input className={inputCls} value={buyer.first_name} onChange={(e) => setBuyer({ ...buyer, first_name: e.target.value })} /></Field>
          <Field label={t('manual.lastName')}><input className={inputCls} value={buyer.last_name} onChange={(e) => setBuyer({ ...buyer, last_name: e.target.value })} /></Field>
          <Field label={t('manual.email')} error={err('buyer.email')}><input type="email" className={inputCls} value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} /></Field>
          <Field label={t('manual.phone')} error={err('buyer.phone')}><input className={inputCls} value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} /></Field>
          <Field label={t('drawer.notes')} help={t('drawer.notesHelp')} wide>
            <textarea className={`${inputCls} min-h-[60px]`} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder={t('manual.notesPlaceholder')} />
          </Field>
        </div>
        <Toggle checked={sendEmail && buyer.email.trim() !== ''} onChange={setSendEmail} label={t('manual.sendEmail')}
          help={buyer.email.trim() === '' ? t('manual.sendEmailNeedsEmail') : undefined} />
      </div>
    </Modal>
  );
}
