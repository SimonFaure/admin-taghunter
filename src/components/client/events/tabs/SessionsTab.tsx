import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, Loader2, Plus, Trash2, Wand2 } from 'lucide-react';
import { EventsApiError, eventsApi, formatLocal } from '../../../../lib/eventsApi';
import { authFetch } from '../../../../lib/authFetch';
import type { EventSlot } from '../../../../types/events';
import { btnGhost, btnPrimary, btnSecondary, CancelFlowModal, Card, errorText, IntInput, isDirty, Pill, SaveBar, smallInputCls, type TabProps } from '../ui';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

/** The licensee's playable scenarios (same list as "Mes scénarios"), for the per-session game. */
function useScenarioOptions(): { id: number; title: string; game_type: string }[] | null {
  const [list, setList] = useState<{ id: number; title: string; game_type: string }[] | null>(null);
  useEffect(() => {
    let alive = true;
    authFetch(`${API_BASE_URL}/client_scenarios.php?action=list`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!alive || !Array.isArray(body?.data)) return;
        const rows = (body.data as { id: number | string; title: string; game_type: string; status?: string }[])
          .map((x) => ({ id: Number(x.id), title: x.title, game_type: x.game_type }))
          .sort((a, b) => a.title.localeCompare(b.title));
        setList(rows);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return list;
}

function nextStart(slots: EventSlot[]): string {
  const last = slots.map((s) => s.starts_at).sort().pop();
  if (last) {
    const [d, tm] = last.split('T');
    const [h, m] = tm.split(':').map(Number);
    const total = h * 60 + m + 60;
    if (total < 24 * 60) return `${d}T${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
  const t = new Date(Date.now() + 7 * 86400000);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}T14:00`;
}

export function SessionsTab({ data, onSaved }: TabProps) {
  const { t, i18n } = useTranslation('events');
  const ev = data.event;
  const types = data.ticket_types.filter((tp) => tp.id !== undefined);
  const saved = useMemo(() => data.slots, [data]);
  const [slots, setSlots] = useState<EventSlot[]>(saved);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cancelSlot, setCancelSlot] = useState<EventSlot | null>(null);
  const scenarios = useScenarioOptions();
  useEffect(() => { setSlots(saved); }, [saved]);
  const dirty = isDirty(slots, saved);
  const lang = ev.main_language;
  const typeLabel = (id: number) => {
    const tp = types.find((x) => x.id === id);
    return tp ? (tp.label_i18n[lang] || Object.values(tp.label_i18n)[0] || `#${id}`) : `#${id}`;
  };

  const upd = (i: number, v: EventSlot) => setSlots(slots.map((x, j) => (j === i ? v : x)));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      onSaved(await eventsApi.slotsSave(ev.id, slots));
      setMsg({ ok: true, text: t('common.saved') });
    } catch (e) {
      if (e instanceof EventsApiError && e.message === 'slot_has_bookings') setMsg({ ok: false, text: t('sessions.hasBookings') });
      else {
        if (e instanceof EventsApiError && e.errors) setErrors(e.errors);
        setMsg({ ok: false, text: errorText(t, e) });
      }
    } finally {
      setSaving(false);
    }
  };

  const dayLabel = (local: string) => {
    const [y, m, d] = local.slice(0, 10).split('-').map(Number);
    return new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  };

  return (
    <div className="space-y-6">
      <Card title={t('sessions.title')} help={t('sessions.help', { tz: ev.timezone })}>
        {types.length === 0 && <p className="text-sm text-amber-700 mb-3">{t('sessions.noTypes')}</p>}
        {slots.length === 0 ? (
          <p className="text-sm text-slate-500">{t('sessions.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-2">{t('sessions.start')}</th>
                  <th className="py-2 pr-2">{t('sessions.duration')}</th>
                  <th className="py-2 pr-2">{t('sessions.capacity')}</th>
                  <th className="py-2 pr-2">{t('sessions.taken')}</th>
                  <th className="py-2 pr-2">{t('sessions.status')}</th>
                  <th className="py-2 pr-2">{t('sessions.types')}</th>
                  <th className="py-2 pr-2">{t('sessions.label')}</th>
                  {scenarios && <th className="py-2 pr-2">{t('sessions.game')}</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {slots.map((s, i) => {
                  const cancelled = s.status === 'cancelled';
                  const taken = s.taken ?? 0;
                  return (
                    <tr key={s.id ?? `new-${i}`} className={`border-b border-slate-100 align-top ${cancelled ? 'opacity-50' : ''}`}>
                      <td className="py-2 pr-2">
                        <input type="datetime-local" className={smallInputCls} value={s.starts_at} disabled={cancelled}
                          onChange={(e) => upd(i, { ...s, starts_at: e.target.value })} />
                        <div className="text-xs text-slate-400 mt-0.5">{s.starts_at && dayLabel(s.starts_at)}</div>
                        {errors[`slots.${i}.starts_at`] && <div className="text-xs text-red-600">{t('errors.invalid')}</div>}
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-1">
                          <IntInput value={s.duration_minutes} min={5} onChange={(v) => upd(i, { ...s, duration_minutes: v ?? 90 })} className={`${smallInputCls} w-20`} />
                          <span className="text-xs text-slate-500">{t('common.minutes')}</span>
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <IntInput value={s.capacity} min={Math.max(1, taken)} onChange={(v) => upd(i, { ...s, capacity: v ?? 1 })} className={`${smallInputCls} w-20`} />
                        {errors[`slots.${i}.capacity`] && <div className="text-xs text-red-600">{t('errors.below_taken')}</div>}
                      </td>
                      <td className="py-2 pr-2 pt-3.5 text-slate-700">{taken}</td>
                      <td className="py-2 pr-2">
                        {cancelled ? <Pill tone="red">{t('sessions.cancelled')}</Pill> : (
                          <select className={smallInputCls} value={s.status} onChange={(e) => upd(i, { ...s, status: e.target.value as EventSlot['status'] })}>
                            <option value="open">{t('sessions.open')}</option>
                            <option value="closed">{t('sessions.closed')}</option>
                          </select>
                        )}
                      </td>
                      <td className="py-2 pr-2">
                        <div className="space-y-1">
                          {types.map((tp) => {
                            const key = String(tp.id);
                            const on = key in s.types;
                            return (
                              <div key={key} className="flex items-center gap-2 whitespace-nowrap">
                                <label className="flex items-center gap-1.5">
                                  <input type="checkbox" checked={on} disabled={cancelled} onChange={(e) => {
                                    const next = { ...s.types };
                                    if (e.target.checked) next[key] = null; else delete next[key];
                                    upd(i, { ...s, types: next });
                                  }} />
                                  <span className={tp.active ? '' : 'line-through text-slate-400'}>{typeLabel(tp.id as number)}</span>
                                </label>
                                {on && (
                                  <span className="flex items-center gap-1 text-xs text-slate-500">
                                    {t('sessions.cap')}
                                    <IntInput value={s.types[key]} min={0} placeholder="–" onChange={(v) => upd(i, { ...s, types: { ...s.types, [key]: v } })} className={`${smallInputCls} w-16 py-0.5`} />
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="py-2 pr-2">
                        <input className={`${smallInputCls} w-32`} placeholder={t('sessions.labelPlaceholder')} value={s.label_i18n[lang] ?? ''} maxLength={80} disabled={cancelled}
                          onChange={(e) => upd(i, { ...s, label_i18n: { ...s.label_i18n, [lang]: e.target.value } })} />
                      </td>
                      {scenarios && (
                        <td className="py-2 pr-2">
                          <select className={`${smallInputCls} w-44`} value={s.scenario_id ?? ''} disabled={cancelled} title={t('sessions.gameHelp')}
                            onChange={(e) => upd(i, { ...s, scenario_id: e.target.value ? Number(e.target.value) : null })}>
                            <option value="">{t('sessions.noGame')}</option>
                            {s.scenario_id !== null && !scenarios.some((x) => x.id === s.scenario_id) && <option value={s.scenario_id}>#{s.scenario_id}</option>}
                            {scenarios.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                          </select>
                        </td>
                      )}
                      <td className="py-2 whitespace-nowrap">
                        <button type="button" className={btnGhost} disabled={taken > 0 || cancelled} title={taken > 0 ? t('sessions.hasBookings') : t('common.remove')}
                          onClick={() => setSlots(slots.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></button>
                        {s.id !== undefined && !cancelled && (
                          <button type="button" className={`${btnGhost} text-red-600 hover:text-red-700 hover:bg-red-50`} title={dirty ? t('sessions.unsavedFirst') : t('sessions.cancelSlot')}
                            disabled={dirty} onClick={() => setCancelSlot(s)}><Ban className="w-4 h-4" /></button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className={`${btnSecondary} mt-3`} disabled={types.length === 0} onClick={() => {
          const prev = slots[slots.length - 1];
          setSlots([...slots, {
            starts_at: nextStart(slots), duration_minutes: prev?.duration_minutes ?? 90, capacity: prev?.capacity ?? 30, status: 'open',
            scenario_id: null, label_i18n: {}, types: Object.fromEntries(types.filter((x) => x.active).map((x) => [String(x.id), null])), taken: 0,
          }]);
        }}><Plus className="w-4 h-4" />{t('sessions.add')}</button>
        <div className="mt-6"><SaveBar dirty={dirty} saving={saving} onSave={save} label={t('sessions.save')} msg={msg} /></div>
      </Card>

      <Generator data={data} onSaved={onSaved} blocked={dirty} />

      {cancelSlot && cancelSlot.id !== undefined && (
        <CancelFlowModal kind="cancel_slot"
          label={t('cancel.cancel_slot.label', { when: formatLocal(cancelSlot.starts_at, i18n.language), count: cancelSlot.taken ?? 0 })}
          onStart={(reason) => eventsApi.slotCancel(ev.id, cancelSlot.id as number, reason)}
          onClose={() => setCancelSlot(null)}
          onDone={(p) => { setCancelSlot(null); if (p) onSaved(p); else eventsApi.get(ev.id).then(onSaved).catch(() => {}); }} />
      )}
    </div>
  );
}

function Generator({ data, onSaved, blocked }: TabProps & { blocked: boolean }) {
  const { t } = useTranslation('events');
  const ev = data.event;
  const types = data.ticket_types.filter((tp) => tp.id !== undefined && tp.active);
  const lang = ev.main_language;
  const [date, setDate] = useState(() => nextStart([]).slice(0, 10));
  const [from, setFrom] = useState('14:00');
  const [to, setTo] = useState('18:00');
  const [every, setEvery] = useState<number | null>(20);
  const [duration, setDuration] = useState<number | null>(90);
  const [capacity, setCapacity] = useState<number | null>(30);
  const [typeIds, setTypeIds] = useState<number[]>(() => types.map((x) => x.id as number));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async () => {
    if (blocked) { setMsg({ ok: false, text: t('sessions.unsavedFirst') }); return; }
    setBusy(true);
    setMsg(null);
    try {
      const p = await eventsApi.slotsGenerate(ev.id, {
        date, from, to, every_minutes: every ?? 30, duration_minutes: duration ?? 90, capacity: capacity ?? 30, ticket_type_ids: typeIds,
      });
      onSaved(p);
      setMsg({ ok: true, text: t('sessions.generated', { count: p.created ?? 0 }) });
    } catch (e) {
      setMsg({ ok: false, text: errorText(t, e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('sessions.generator')} help={t('sessions.generatorHelp')}>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label><span className="block text-xs text-slate-600 mb-0.5">{t('sessions.date')}</span>
          <input type="date" className={smallInputCls} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label><span className="block text-xs text-slate-600 mb-0.5">{t('sessions.from')}</span>
          <input type="time" className={smallInputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label><span className="block text-xs text-slate-600 mb-0.5">{t('sessions.to')}</span>
          <input type="time" className={smallInputCls} value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label><span className="block text-xs text-slate-600 mb-0.5">{t('sessions.every')} ({t('common.minutes')})</span>
          <IntInput value={every} min={5} onChange={setEvery} className={`${smallInputCls} w-20`} /></label>
        <label><span className="block text-xs text-slate-600 mb-0.5">{t('sessions.duration')} ({t('common.minutes')})</span>
          <IntInput value={duration} min={5} onChange={setDuration} className={`${smallInputCls} w-20`} /></label>
        <label><span className="block text-xs text-slate-600 mb-0.5">{t('sessions.capacity')}</span>
          <IntInput value={capacity} min={1} onChange={setCapacity} className={`${smallInputCls} w-20`} /></label>
      </div>
      {types.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <span className="text-xs text-slate-600">{t('sessions.types')} :</span>
          {types.map((tp) => (
            <label key={tp.id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={typeIds.includes(tp.id as number)}
                onChange={(e) => setTypeIds(e.target.checked ? [...typeIds, tp.id as number] : typeIds.filter((x) => x !== tp.id))} />
              {tp.label_i18n[lang] || Object.values(tp.label_i18n)[0]}
            </label>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className={btnPrimary} onClick={run} disabled={busy || types.length === 0}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}{t('sessions.generate')}
        </button>
        {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}</span>}
      </div>
    </Card>
  );
}
