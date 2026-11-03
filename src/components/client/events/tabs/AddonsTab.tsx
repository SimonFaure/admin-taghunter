import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { eventsApi } from '../../../../lib/eventsApi';
import type { AddonVariant, EventAddon } from '../../../../types/events';
import {
  btnGhost, btnSecondary, Card, errorText, IntInput, isDirty, MoneyInput, move, MoveButtons, SaveBar, smallInputCls, UploadButton, type TabProps,
} from '../ui';

// Events phase 3: optional extras sold with a booking (T-shirt, photo, snack...).

const blankVariant = (): AddonVariant => ({ label_i18n: {}, price_cents: null, stock: null, active: true });
const blankAddon = (): EventAddon => ({
  label_i18n: {}, description_i18n: {}, image: null, price_cents: 0, vat_bp: null, max_per_booking: null, active: true, variants: [blankVariant()],
});

export function AddonsTab({ data, onSaved }: TabProps) {
  const { t } = useTranslation('events');
  const ev = data.event;
  const saved = useMemo(() => data.addons ?? [], [data]);
  const [addons, setAddons] = useState<EventAddon[]>(saved);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setAddons(saved); }, [saved]);
  const dirty = isDirty(addons, saved);
  const upd = (i: number, v: EventAddon) => setAddons(addons.map((x, j) => (j === i ? v : x)));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      onSaved(await eventsApi.addonsSave(ev.id, addons));
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
    <Card title={t('addons.title')} help={t('addons.help')}>
      {addons.length === 0 && <p className="text-sm text-slate-500">{t('addons.empty')}</p>}
      <div className="space-y-4">
        {addons.map((a, i) => (
          <div key={a.id ?? `new-${i}`} className={`rounded-xl border p-4 ${a.active ? 'border-slate-200' : 'border-dashed border-slate-300 bg-slate-50'}`}>
            <div className="flex flex-wrap items-start gap-4">
              <div className="w-28 shrink-0">
                <div className="w-28 h-28 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-xs text-slate-400">
                  {a.image_url ? <img src={a.image_url} alt="" className="w-full h-full object-cover" /> : t('addons.noImage')}
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  <UploadButton eventId={ev.id} kind="addon" accept="image/png,image/jpeg,image/webp" label={a.image ? t('common.replace') : t('addons.image')}
                    onUploaded={(file, url) => upd(i, { ...a, image: file, image_url: url })} />
                  {a.image && <button type="button" className={btnGhost} onClick={() => upd(i, { ...a, image: null, image_url: null })}>{t('common.remove')}</button>}
                </div>
              </div>
              <div className="flex-1 min-w-[16rem] grid gap-2">
                {ev.languages.map((l) => (
                  <label key={l} className="block">
                    <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('addons.label', { lang: l.toUpperCase() })}</span>
                    <input className={`${smallInputCls} w-full`} value={a.label_i18n[l] ?? ''} maxLength={190} placeholder={t('addons.labelPlaceholder')}
                      onChange={(e) => upd(i, { ...a, label_i18n: { ...a.label_i18n, [l]: e.target.value } })} />
                    {errors[`addons.${i}.label`] && l === ev.main_language && <span className="text-xs text-red-600">{t('errors.required')}</span>}
                  </label>
                ))}
                {ev.languages.map((l) => (
                  <label key={`d-${l}`} className="block">
                    <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('addons.description', { lang: l.toUpperCase() })}</span>
                    <input className={`${smallInputCls} w-full`} value={a.description_i18n[l] ?? ''} maxLength={500}
                      onChange={(e) => upd(i, { ...a, description_i18n: { ...a.description_i18n, [l]: e.target.value } })} />
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:min-w-[18rem] text-sm">
                <label>
                  <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('addons.price')}</span>
                  <MoneyInput cents={a.price_cents} onChange={(c) => upd(i, { ...a, price_cents: c ?? 0 })} className={`${smallInputCls} w-full`} />
                </label>
                <label>
                  <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('tickets.vat')} %</span>
                  <input className={`${smallInputCls} w-full`} inputMode="decimal" placeholder={t('tickets.vatDefault')}
                    value={a.vat_bp === null ? '' : String(a.vat_bp / 100)}
                    onChange={(e) => {
                      const v = e.target.value.replace(',', '.').trim();
                      upd(i, { ...a, vat_bp: v === '' || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) });
                    }} />
                </label>
                <label>
                  <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('tickets.maxPerBooking')}</span>
                  <IntInput value={a.max_per_booking} min={1} max={50} onChange={(v) => upd(i, { ...a, max_per_booking: v })} className={`${smallInputCls} w-full`} />
                </label>
                <label className="flex items-end gap-2 pb-1">
                  <input type="checkbox" checked={a.active} onChange={(e) => upd(i, { ...a, active: e.target.checked })} />
                  <span>{t('addons.active')}</span>
                </label>
              </div>
              <MoveButtons index={i} count={addons.length} onMove={(x, y) => setAddons(move(addons, x, y))} onRemove={() => setAddons(addons.filter((_, j) => j !== i))} />
            </div>

            {/* Variants */}
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-sm font-medium text-slate-800">{t('addons.variants')}</div>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">{t('addons.variantsHelp')}</p>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      {ev.languages.map((l) => <th key={l} className="pr-2 pb-1 font-normal">{t('addons.variantLabel', { lang: l.toUpperCase() })}</th>)}
                      <th className="pr-2 pb-1 font-normal">{t('addons.variantPrice')}</th>
                      <th className="pr-2 pb-1 font-normal">{t('addons.stock')}</th>
                      <th className="pr-2 pb-1 font-normal">{t('addons.sold')}</th>
                      <th className="pr-2 pb-1 font-normal">{t('addons.active')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {a.variants.map((v, vi) => {
                      const updV = (nv: AddonVariant) => upd(i, { ...a, variants: a.variants.map((x, k) => (k === vi ? nv : x)) });
                      const sold = v.sold ?? 0;
                      return (
                        <tr key={v.id ?? `nv-${vi}`} className={v.active ? '' : 'opacity-50'}>
                          {ev.languages.map((l) => (
                            <td key={l} className="pr-2 py-1">
                              <input className={`${smallInputCls} w-28`} value={v.label_i18n[l] ?? ''} maxLength={80} placeholder={vi === 0 && a.variants.length === 1 ? t('addons.unnamed') : 'S, M, L…'}
                                onChange={(e) => updV({ ...v, label_i18n: { ...v.label_i18n, [l]: e.target.value } })} />
                            </td>
                          ))}
                          <td className="pr-2 py-1">
                            <MoneyInput cents={v.price_cents} placeholder={t('addons.samePrice')} onChange={(c) => updV({ ...v, price_cents: c })} className={`${smallInputCls} w-28`} />
                          </td>
                          <td className="pr-2 py-1">
                            <IntInput value={v.stock} min={0} placeholder="∞" onChange={(s) => updV({ ...v, stock: s })} className={`${smallInputCls} w-20`} />
                            {v.stock !== null && v.stock < sold && <div className="text-xs text-amber-700">{t('addons.stockBelowSold')}</div>}
                          </td>
                          <td className="pr-2 py-1 text-slate-700">{sold}{v.stock !== null ? ` / ${v.stock}` : ''}</td>
                          <td className="pr-2 py-1 text-center"><input type="checkbox" checked={v.active} onChange={(e) => updV({ ...v, active: e.target.checked })} /></td>
                          <td className="py-1">
                            <button type="button" className={btnGhost} disabled={a.variants.length <= 1} title={t('common.remove')}
                              onClick={() => upd(i, { ...a, variants: a.variants.filter((_, k) => k !== vi) })}><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {a.variants.length < 30 && (
                <button type="button" className={`${btnGhost} mt-2`} onClick={() => upd(i, { ...a, variants: [...a.variants, blankVariant()] })}>
                  <Plus className="w-4 h-4" />{t('addons.addVariant')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {addons.length < 20 && (
        <button type="button" className={`${btnSecondary} mt-4`} onClick={() => setAddons([...addons, blankAddon()])}><Plus className="w-4 h-4" />{t('addons.add')}</button>
      )}
      <div className="mt-6"><SaveBar dirty={dirty} saving={saving} onSave={save} label={t('addons.save')} msg={msg} /></div>
    </Card>
  );
}
