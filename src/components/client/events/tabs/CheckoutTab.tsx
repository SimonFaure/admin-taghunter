import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import { eventsApi, type EventSettingsPatch } from '../../../../lib/eventsApi';
import type { EventQuestion, EventSettings } from '../../../../types/events';
import {
  btnGhost, btnSecondary, Card, errorText, Field, IntInput, isDirty, move, MoveButtons, SaveBar, smallInputCls, Toggle, UploadButton, type TabProps,
} from '../ui';

type Rules = Pick<EventSettings,
  'team_size_min' | 'team_size_max' | 'require_player_details' | 'minor_age_threshold' | 'adult_age' | 'sales_cutoff_minutes'
  | 'refund_policy' | 'refund_days_before' | 'refund_retention_bp' | 'availability_display' | 'few_left_bp' | 'last_tickets_banner'
  | 'image_rights_enabled' | 'newsletter_enabled' | 'terms_pdf'>;

function pickRules(e: EventSettings): Rules {
  const { team_size_min, team_size_max, require_player_details, minor_age_threshold, adult_age, sales_cutoff_minutes,
    refund_policy, refund_days_before, refund_retention_bp, availability_display, few_left_bp, last_tickets_banner,
    image_rights_enabled, newsletter_enabled, terms_pdf } = e;
  return { team_size_min, team_size_max, require_player_details, minor_age_threshold, adult_age, sales_cutoff_minutes,
    refund_policy, refund_days_before, refund_retention_bp, availability_display, few_left_bp, last_tickets_banner,
    image_rights_enabled, newsletter_enabled, terms_pdf };
}

export function CheckoutTab({ data, onSaved, onGoPage }: TabProps & { onGoPage: () => void }) {
  return (
    <div className="space-y-6">
      <RulesCard data={data} onSaved={onSaved} onGoPage={onGoPage} />
      <QuestionsCard data={data} onSaved={onSaved} />
    </div>
  );
}

function RulesCard({ data, onSaved, onGoPage }: TabProps & { onGoPage: () => void }) {
  const { t } = useTranslation('events');
  const ev = data.event;
  const saved = useMemo(() => pickRules(ev), [ev]);
  const [r, setR] = useState<Rules>(saved);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { setR(saved); }, [saved]);
  const dirty = isDirty(r, saved);
  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setR((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      onSaved(await eventsApi.update(ev.id, r as EventSettingsPatch));
      setMsg({ ok: true, text: t('common.saved') });
    } catch (e) {
      const ex = e as { errors?: Record<string, string> };
      if (ex.errors) setErrors(ex.errors);
      setMsg({ ok: false, text: errorText(t, e) });
    } finally {
      setSaving(false);
    }
  };

  const cutH = Math.floor(r.sales_cutoff_minutes / 60);
  const cutM = r.sales_cutoff_minutes % 60;
  const pdfUrl = r.terms_pdf ? data.media_base + encodeURIComponent(r.terms_pdf) : null;

  return (
    <Card>
      <h3 className="text-lg font-semibold text-slate-900 mb-3">{t('checkout.team')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('checkout.teamMin')} help={t('checkout.teamHelp')}>
          <IntInput value={r.team_size_min} min={1} max={30} onChange={(v) => set('team_size_min', v ?? 1)} className={`${smallInputCls} w-24`} />
        </Field>
        <Field label={t('checkout.teamMax')} error={errors.team_size_max ? t(`errors.${errors.team_size_max}`) : null}>
          <IntInput value={r.team_size_max} min={1} max={30} onChange={(v) => set('team_size_max', v ?? 6)} className={`${smallInputCls} w-24`} />
        </Field>
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-3">{t('checkout.players')}</h3>
      <Toggle checked={r.require_player_details} onChange={(v) => set('require_player_details', v)} label={t('checkout.requireDetails')} help={t('checkout.requireDetailsHelp')} />
      <div className={`mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700 ${r.require_player_details ? '' : 'opacity-50'}`}>
        {t('checkout.minorRule')}
        <IntInput value={r.minor_age_threshold} min={1} max={18} placeholder="–" onChange={(v) => set('minor_age_threshold', v)} className={`${smallInputCls} w-16`} />
        {t('checkout.minorRuleSuffix')}
        <IntInput value={r.adult_age} min={16} max={21} onChange={(v) => set('adult_age', v ?? 18)} className={`${smallInputCls} w-16`} />
        {t('checkout.minorRuleSuffix2')}
        <span className="text-xs text-slate-500">({t('checkout.minorRuleOff')})</span>
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-3">{t('checkout.sales')}</h3>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        {t('checkout.cutoff')}
        <IntInput value={cutH} min={0} max={168} onChange={(v) => set('sales_cutoff_minutes', (v ?? 0) * 60 + cutM)} className={`${smallInputCls} w-16`} />{t('checkout.hours')}
        <IntInput value={cutM} min={0} max={59} onChange={(v) => set('sales_cutoff_minutes', cutH * 60 + Math.min(59, v ?? 0))} className={`${smallInputCls} w-16`} />{t('common.minutes')}
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-1">{t('checkout.refund')}</h3>
      <p className="text-xs text-slate-500 mb-3">{t('checkout.refundHelp')}</p>
      <div className="space-y-2 text-sm text-slate-800">
        <label className="flex items-center gap-2"><input type="radio" checked={r.refund_policy === 'none'} onChange={() => set('refund_policy', 'none')} />{t('checkout.refundNone')}</label>
        <label className="flex flex-wrap items-center gap-2">
          <input type="radio" checked={r.refund_policy === 'full_until'} onChange={() => set('refund_policy', 'full_until')} />
          {t('checkout.refundFull')}
          <IntInput value={r.refund_days_before} min={0} max={365} onChange={(v) => setR((x) => ({ ...x, refund_policy: 'full_until', refund_days_before: v }))} className={`${smallInputCls} w-16`} />
          {t('checkout.refundFullSuffix')}
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <input type="radio" checked={r.refund_policy === 'partial'} onChange={() => set('refund_policy', 'partial')} />
          {t('checkout.refundPartial')}
          <IntInput value={r.refund_retention_bp === null ? null : r.refund_retention_bp / 100} min={0} max={100}
            onChange={(v) => setR((x) => ({ ...x, refund_policy: 'partial', refund_retention_bp: v === null ? null : v * 100 }))} className={`${smallInputCls} w-16`} />
          {t('checkout.refundPartialSuffix')}
        </label>
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-3">{t('checkout.availability')}</h3>
      <div className="space-y-2 text-sm text-slate-800">
        <label className="flex items-center gap-2"><input type="radio" checked={r.availability_display === 'status'} onChange={() => set('availability_display', 'status')} />{t('checkout.availabilityStatus')}</label>
        <label className="flex items-center gap-2"><input type="radio" checked={r.availability_display === 'exact'} onChange={() => set('availability_display', 'exact')} />{t('checkout.availabilityExact')}</label>
        <div className="flex flex-wrap items-center gap-2 text-slate-700">
          {t('checkout.fewLeft')}
          <IntInput value={Math.round(r.few_left_bp / 100)} min={0} max={100} onChange={(v) => set('few_left_bp', (v ?? 20) * 100)} className={`${smallInputCls} w-16`} />
          {t('checkout.fewLeftSuffix')}
        </div>
        <Toggle checked={r.last_tickets_banner} onChange={(v) => set('last_tickets_banner', v)} label={t('checkout.lastTickets')} />
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-3">{t('checkout.consents')}</h3>
      <div className="space-y-2">
        <Toggle checked={r.image_rights_enabled} onChange={(v) => set('image_rights_enabled', v)} label={t('checkout.imageRights')} />
        <Toggle checked={r.newsletter_enabled} onChange={(v) => set('newsletter_enabled', v)} label={t('checkout.newsletter')} />
      </div>

      <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-1">{t('checkout.terms')}</h3>
      <p className="text-sm text-slate-600">
        {t('checkout.termsText')} <button type="button" className="text-blue-700 hover:underline" onClick={onGoPage}>{t('checkout.goPage')} →</button>
      </p>
      <div className="mt-3">
        <span className="block text-sm font-medium text-slate-700 mb-1">{t('checkout.termsPdf')}</span>
        <div className="flex flex-wrap items-center gap-3">
          <UploadButton eventId={ev.id} kind="terms_pdf" accept="application/pdf" label={r.terms_pdf ? t('common.replace') : undefined} onUploaded={(f) => set('terms_pdf', f)} />
          {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">{t('checkout.viewPdf')}<ExternalLink className="w-3.5 h-3.5" /></a>}
          {r.terms_pdf && <button type="button" className="text-sm text-slate-500 hover:text-red-600" onClick={() => set('terms_pdf', null)}>{t('checkout.removePdf')}</button>}
        </div>
      </div>

      <div className="mt-6"><SaveBar dirty={dirty} saving={saving} onSave={save} label={t('checkout.save')} msg={msg} /></div>
    </Card>
  );
}

function QuestionsCard({ data, onSaved }: TabProps) {
  const { t } = useTranslation('events');
  const ev = data.event;
  const saved = useMemo(() => data.questions, [data]);
  const [qs, setQs] = useState<EventQuestion[]>(saved);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setQs(saved); }, [saved]);
  const dirty = isDirty(qs, saved);
  const upd = (i: number, v: EventQuestion) => setQs(qs.map((x, j) => (j === i ? v : x)));

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await eventsApi.questionsSave(ev.id, qs));
      setMsg({ ok: true, text: t('common.saved') });
    } catch (e) {
      setMsg({ ok: false, text: errorText(t, e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={t('checkout.questions')} help={t('checkout.questionsHelp')}>
      <div className="space-y-4">
        {qs.map((q, i) => (
          <div key={q.id ?? `new-${i}`} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex-1 min-w-[16rem] grid gap-2">
                {ev.languages.map((l) => (
                  <label key={l}>
                    <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('checkout.questionLabel', { lang: l.toUpperCase() })}</span>
                    <input className={`${smallInputCls} w-full`} value={q.label_i18n[l] ?? ''} maxLength={200}
                      onChange={(e) => upd(i, { ...q, label_i18n: { ...q.label_i18n, [l]: e.target.value } })} />
                  </label>
                ))}
              </div>
              <div className="space-y-2 text-sm">
                <label>
                  <span className="block text-xs font-medium text-slate-600 mb-0.5">{t('checkout.kind')}</span>
                  <select className={smallInputCls} value={q.kind} onChange={(e) => {
                    const kind = e.target.value as EventQuestion['kind'];
                    upd(i, { ...q, kind, options_i18n: kind === 'choice' && q.options_i18n.length < 2 ? [{}, {}] : q.options_i18n });
                  }}>
                    <option value="text">{t('checkout.kindText')}</option>
                    <option value="choice">{t('checkout.kindChoice')}</option>
                    <option value="checkbox">{t('checkout.kindCheckbox')}</option>
                  </select>
                </label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={q.required} onChange={(e) => upd(i, { ...q, required: e.target.checked })} />{t('checkout.required')}</label>
              </div>
              <MoveButtons index={i} count={qs.length} onMove={(a, b) => setQs(move(qs, a, b))} onRemove={() => setQs(qs.filter((_, j) => j !== i))} />
            </div>
            {q.kind === 'choice' && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                {ev.languages.map((l) => (
                  <div key={l} className="mb-2">
                    <span className="block text-xs font-medium text-slate-600 mb-1">{t('checkout.options', { lang: l.toUpperCase() })}</span>
                    <div className="flex flex-wrap gap-2">
                      {q.options_i18n.map((o, oi) => (
                        <span key={oi} className="inline-flex items-center gap-1">
                          <input className={`${smallInputCls} w-32`} value={o[l] ?? ''} maxLength={80}
                            onChange={(e) => upd(i, { ...q, options_i18n: q.options_i18n.map((x, k) => (k === oi ? { ...x, [l]: e.target.value } : x)) })} />
                          {l === ev.languages[0] && q.options_i18n.length > 2 && (
                            <button type="button" className={btnGhost} onClick={() => upd(i, { ...q, options_i18n: q.options_i18n.filter((_, k) => k !== oi) })}><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                {q.options_i18n.length < 20 && (
                  <button type="button" className={btnGhost} onClick={() => upd(i, { ...q, options_i18n: [...q.options_i18n, {}] })}><Plus className="w-4 h-4" />{t('checkout.addOption')}</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {qs.length < 5
        ? <button type="button" className={`${btnSecondary} mt-4`} onClick={() => setQs([...qs, { kind: 'text', label_i18n: {}, options_i18n: [], required: false }])}><Plus className="w-4 h-4" />{t('checkout.addQuestion')}</button>
        : <p className="text-xs text-slate-500 mt-4">{t('checkout.maxQuestions')}</p>}
      <div className="mt-6"><SaveBar dirty={dirty} saving={saving} onSave={save} label={t('checkout.saveQuestions')} msg={msg} /></div>
    </Card>
  );
}
