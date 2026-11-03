import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { eventsApi } from '../../../../lib/eventsApi';
import type { PromoCode } from '../../../../types/events';
import { btnGhost, btnSecondary, Card, errorText, IntInput, isDirty, MoneyInput, SaveBar, smallInputCls, type TabProps } from '../ui';

// Events phase 3: promo codes (% or fixed amount off tickets + options).

const blank = (): PromoCode => ({ code: '', kind: 'percent', value: 1000, max_uses: null, valid_from: null, valid_until: null, active: true });

export function PromoTab({ data, onSaved }: TabProps) {
  const { t } = useTranslation('events');
  const ev = data.event;
  const saved = useMemo(() => data.promo_codes ?? [], [data]);
  const [codes, setCodes] = useState<PromoCode[]>(saved);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setCodes(saved); }, [saved]);
  const dirty = isDirty(codes, saved);
  const upd = (i: number, v: PromoCode) => setCodes(codes.map((x, j) => (j === i ? v : x)));
  const err = (i: number, f: string) => {
    const c = errors[`codes.${i}.${f}`];
    return c ? <div className="text-xs text-red-600">{t(`errors.promo_${c}`, { defaultValue: t(`errors.${c}`, { defaultValue: c }) })}</div> : null;
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      onSaved(await eventsApi.promoSave(ev.id, codes));
      setMsg({ ok: true, text: t('common.saved') });
    } catch (e) {
      const ex = e as { errors?: Record<string, string> };
      if (ex.errors) setErrors(ex.errors);
      setMsg({ ok: false, text: ex.errors ? t('promo.fixErrors') : errorText(t, e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('promo.title')} help={t('promo.help')}>
      {codes.length === 0 ? <p className="text-sm text-slate-500">{t('promo.empty')}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-2">{t('promo.code')}</th>
                <th className="py-2 pr-2">{t('promo.discount')}</th>
                <th className="py-2 pr-2">{t('promo.maxUses')}</th>
                <th className="py-2 pr-2">{t('promo.validFrom')}</th>
                <th className="py-2 pr-2">{t('promo.validUntil')}</th>
                <th className="py-2 pr-2">{t('promo.uses')}</th>
                <th className="py-2 pr-2">{t('promo.active')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {codes.map((c, i) => (
                <tr key={c.id ?? `new-${i}`} className={`border-b border-slate-100 align-top ${c.active ? '' : 'opacity-60'}`}>
                  <td className="py-2 pr-2">
                    <input className={`${smallInputCls} w-36 font-mono uppercase`} value={c.code} maxLength={40} placeholder="ZOMBIE10"
                      onChange={(e) => upd(i, { ...c, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })} />
                    {err(i, 'code')}
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1">
                      {c.kind === 'percent' ? (
                        <input className={`${smallInputCls} w-20`} inputMode="decimal" value={String(c.value / 100)}
                          onChange={(e) => {
                            const n = Number(e.target.value.replace(',', '.'));
                            upd(i, { ...c, value: Number.isFinite(n) ? Math.round(n * 100) : 0 });
                          }} />
                      ) : (
                        <MoneyInput cents={c.value} onChange={(v) => upd(i, { ...c, value: v ?? 0 })} className={`${smallInputCls} w-24`} />
                      )}
                      <select className={smallInputCls} value={c.kind} onChange={(e) => upd(i, { ...c, kind: e.target.value as PromoCode['kind'], value: e.target.value === 'percent' ? 1000 : 500 })}>
                        <option value="percent">%</option>
                        <option value="fixed">€</option>
                      </select>
                    </div>
                    {err(i, 'value')}
                  </td>
                  <td className="py-2 pr-2">
                    <IntInput value={c.max_uses} min={1} placeholder="∞" onChange={(v) => upd(i, { ...c, max_uses: v })} className={`${smallInputCls} w-20`} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="datetime-local" className={smallInputCls} value={c.valid_from ?? ''} onChange={(e) => upd(i, { ...c, valid_from: e.target.value || null })} />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="datetime-local" className={smallInputCls} value={c.valid_until ?? ''} onChange={(e) => upd(i, { ...c, valid_until: e.target.value || null })} />
                  </td>
                  <td className="py-2 pr-2 pt-3 text-slate-700 whitespace-nowrap">{c.uses ?? 0}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                  <td className="py-2 pr-2 pt-3 text-center"><input type="checkbox" checked={c.active} onChange={(e) => upd(i, { ...c, active: e.target.checked })} /></td>
                  <td className="py-2">
                    <button type="button" className={btnGhost} title={(c.uses ?? 0) > 0 ? t('promo.usedRemoveHelp') : t('common.remove')}
                      onClick={() => setCodes(codes.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500 mt-3">{t('promo.note')}</p>
      <button type="button" className={`${btnSecondary} mt-3`} onClick={() => setCodes([...codes, blank()])}><Plus className="w-4 h-4" />{t('promo.add')}</button>
      <div className="mt-6"><SaveBar dirty={dirty} saving={saving} onSave={save} label={t('promo.save')} msg={msg} /></div>
    </Card>
  );
}
