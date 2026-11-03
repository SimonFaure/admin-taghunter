import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { eventsApi } from '../../../../lib/eventsApi';
import type { TicketType } from '../../../../types/events';
import {
  btnGhost, btnSecondary, Card, errorText, IntInput, isDirty, MoneyInput, move, MoveButtons, SaveBar, smallInputCls, type TabProps,
} from '../ui';

const blankType = (): TicketType => ({
  role: 'player', label_i18n: {}, description_i18n: {}, base_price_cents: 0, vat_bp: null,
  min_age: null, cap_per_slot: null, max_per_booking: null, active: true, steps: [],
});

export function TicketsTab({ data, onSaved }: TabProps) {
  const { t } = useTranslation('events');
  const ev = data.event;
  const saved = useMemo(() => data.ticket_types, [data]);
  const [types, setTypes] = useState<TicketType[]>(saved);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setTypes(saved); }, [saved]);
  const dirty = isDirty(types, saved);

  const upd = (i: number, v: TicketType) => setTypes(types.map((x, j) => (j === i ? v : x)));

  const save = async () => {
    // A tier with neither limit would be dropped by the server: flag it here.
    for (const tp of types) {
      if (tp.steps.some((s) => !s.ends_at && !s.ends_after_sold)) {
        setMsg({ ok: false, text: t('tickets.tierNeedsEnd') });
        return;
      }
    }
    setSaving(true);
    setErrors({});
    try {
      onSaved(await eventsApi.ticketTypesSave(ev.id, types));
      setMsg({ ok: true, text: t('common.saved') });
    } catch (e) {
      const ex = e as { errors?: Record<string, string> };
      if (ex.errors) setErrors(ex.errors);
      setMsg({ ok: false, text: errorText(t, e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('tickets.title')} help={t('tickets.help')}>
      <div className="space-y-4">
        {types.map((tp, i) => (
          <div key={tp.id ?? `new-${i}`} className={`rounded-xl border p-4 ${tp.active ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50'}`}>
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-[16rem] grid gap-2">
                {ev.languages.map((l) => (
                  <label key={l} className="block">
                    <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('tickets.label', { lang: l.toUpperCase() })}</span>
                    <input className={`${smallInputCls} w-full`} value={tp.label_i18n[l] ?? ''} maxLength={190}
                      onChange={(e) => upd(i, { ...tp, label_i18n: { ...tp.label_i18n, [l]: e.target.value } })} />
                  </label>
                ))}
                {errors[`types.${i}.label`] && <span className="text-xs text-red-600">{t('errors.required')}</span>}
                {ev.languages.map((l) => (
                  <label key={`d-${l}`} className="block">
                    <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('tickets.description', { lang: l.toUpperCase() })}</span>
                    <input className={`${smallInputCls} w-full`} value={tp.description_i18n[l] ?? ''} maxLength={500}
                      onChange={(e) => upd(i, { ...tp, description_i18n: { ...tp.description_i18n, [l]: e.target.value } })} />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm min-w-[18rem]">
                <label className="col-span-2">
                  <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('tickets.role')}</span>
                  <select className={`${smallInputCls} w-full`} value={tp.role} onChange={(e) => upd(i, { ...tp, role: e.target.value as TicketType['role'] })}>
                    <option value="player">{t('tickets.rolePlayer')}</option>
                    <option value="individual">{t('tickets.roleIndividual')}</option>
                  </select>
                  {tp.role === 'individual' && <span className="block text-xs text-slate-500 mt-0.5">{t('tickets.roleHelp')}</span>}
                </label>
                <label>
                  <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('tickets.price')}</span>
                  <MoneyInput cents={tp.base_price_cents} onChange={(c) => upd(i, { ...tp, base_price_cents: c ?? 0 })} className={`${smallInputCls} w-full`} />
                </label>
                <label>
                  <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('tickets.vat')} %</span>
                  <input className={`${smallInputCls} w-full`} inputMode="decimal" placeholder={t('tickets.vatDefault')}
                    value={tp.vat_bp === null ? '' : String(tp.vat_bp / 100)}
                    onChange={(e) => {
                      const v = e.target.value.replace(',', '.').trim();
                      upd(i, { ...tp, vat_bp: v === '' || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) });
                    }} />
                </label>
                <label>
                  <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('tickets.minAge')}</span>
                  <IntInput value={tp.min_age} min={0} max={99} onChange={(v) => upd(i, { ...tp, min_age: v })} className={`${smallInputCls} w-full`} />
                </label>
                <label>
                  <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('tickets.capPerSlot')}</span>
                  <IntInput value={tp.cap_per_slot} min={0} onChange={(v) => upd(i, { ...tp, cap_per_slot: v })} className={`${smallInputCls} w-full`} />
                </label>
                <label>
                  <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('tickets.maxPerBooking')}</span>
                  <IntInput value={tp.max_per_booking} min={1} max={30} onChange={(v) => upd(i, { ...tp, max_per_booking: v })} className={`${smallInputCls} w-full`} />
                </label>
                <label className="flex items-end gap-2 pb-1">
                  <input type="checkbox" checked={tp.active} onChange={(e) => upd(i, { ...tp, active: e.target.checked })} />
                  <span>{t('tickets.active')}</span>
                </label>
                {!tp.active && <span className="col-span-2 text-xs text-slate-500">{t('tickets.inactiveHelp')}</span>}
              </div>
              <MoveButtons index={i} count={types.length} onMove={(a, b) => setTypes(move(types, a, b))} onRemove={() => setTypes(types.filter((_, j) => j !== i))} />
            </div>

            {/* Price tiers */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-sm font-medium text-slate-800">{t('tickets.tiers')}</div>
              {tp.steps.length === 0 && i === 0 && <p className="text-xs text-slate-500 mt-1">{t('tickets.tiersHelp')}</p>}
              {tp.steps.length > 0 && <p className="text-xs text-slate-500 mt-1 mb-2">{t('tickets.tiersHelp')}</p>}
              <div className="space-y-2">
                {tp.steps.map((s, si) => {
                  const updStep = (v: typeof s) => upd(i, { ...tp, steps: tp.steps.map((x, k) => (k === si ? v : x)) });
                  return (
                    <div key={si} className="flex flex-wrap items-end gap-3 text-sm">
                      <span className="text-slate-400 pb-2 w-5">{si + 1}.</span>
                      <label>
                        <span className="block text-xs text-slate-600">{t('tickets.tierPrice')}</span>
                        <MoneyInput cents={s.price_cents} onChange={(c) => updStep({ ...s, price_cents: c ?? 0 })} className={`${smallInputCls} w-28`} />
                      </label>
                      <label>
                        <span className="block text-xs text-slate-600">{t('tickets.tierEndsAt')}</span>
                        <input type="datetime-local" className={smallInputCls} value={s.ends_at ?? ''} onChange={(e) => updStep({ ...s, ends_at: e.target.value || null })} />
                      </label>
                      <label>
                        <span className="block text-xs text-slate-600">{t('tickets.tierEndsAfter')}</span>
                        <IntInput value={s.ends_after_sold} min={1} onChange={(v) => updStep({ ...s, ends_after_sold: v })} className={`${smallInputCls} w-28`} />
                      </label>
                      <button type="button" className={`${btnGhost} mb-1`} title={t('common.remove')} onClick={() => upd(i, { ...tp, steps: tp.steps.filter((_, k) => k !== si) })}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>
              {tp.steps.length < 10 && (
                <button type="button" className={`${btnGhost} mt-2`} onClick={() => upd(i, { ...tp, steps: [...tp.steps, { price_cents: Math.max(0, tp.base_price_cents - 500), ends_at: null, ends_after_sold: null }] })}>
                  <Plus className="w-4 h-4" />{t('tickets.addTier')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {types.length < 20 && (
        <button type="button" className={`${btnSecondary} mt-4`} onClick={() => setTypes([...types, blankType()])}><Plus className="w-4 h-4" />{t('tickets.addType')}</button>
      )}
      <div className="mt-6"><SaveBar dirty={dirty} saving={saving} onSave={save} label={t('tickets.save')} msg={msg} /></div>
    </Card>
  );
}
