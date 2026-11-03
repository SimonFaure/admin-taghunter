import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { eventsApi, type EventSettingsPatch } from '../../../../lib/eventsApi';
import { EVENT_LANGS, type Audience, type EventLang, type EventSettings } from '../../../../types/events';
import { btnDanger, CancelFlowModal, Card, errorText, Field, inputCls, isDirty, JobProgress, SaveBar, Toggle, type TabProps } from '../ui';

const REGIONS = ['ARA', 'BFC', 'BRE', 'CVL', 'COR', 'GES', 'HDF', 'IDF', 'NOR', 'NAQ', 'OCC', 'PDL', 'PAC', 'OTHER'];
const AUDIENCES: Audience[] = ['all', 'kids', 'family', 'adults'];
const COUNTRIES = ['FR', 'BE', 'LU', 'ES', 'DE', 'IT', 'NL', 'PT', 'AT', 'IE', 'FI', 'GR', 'HR', 'SI', 'SK', 'EE', 'LV', 'LT', 'MT', 'CY', 'BG', 'CH', 'GB', 'MC'];
const TIMEZONES = ['Europe/Paris', 'Europe/Brussels', 'Europe/Luxembourg', 'Europe/Madrid', 'Europe/Lisbon', 'Europe/Berlin', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Vienna', 'Europe/Dublin', 'Europe/Helsinki', 'Europe/Athens', 'Europe/Zagreb', 'Europe/Ljubljana', 'Europe/Bratislava',
  'Europe/Tallinn', 'Europe/Riga', 'Europe/Vilnius', 'Europe/Malta', 'Asia/Nicosia', 'Europe/Sofia', 'Atlantic/Canary', 'Indian/Reunion',
  'America/Guadeloupe', 'America/Martinique', 'America/Cayenne', 'Pacific/Noumea', 'Pacific/Tahiti'];

type S = Pick<EventSettings, 'slug' | 'main_language' | 'languages' | 'timezone' | 'venue_name' | 'venue_address' | 'venue_postal_code'
  | 'venue_city' | 'venue_country' | 'lat' | 'lng' | 'region' | 'audience' | 'listed' | 'sales_paused' | 'licensee_alert_email'>;

function pick(e: EventSettings): S {
  const { slug, main_language, languages, timezone, venue_name, venue_address, venue_postal_code, venue_city, venue_country,
    lat, lng, region, audience, listed, sales_paused, licensee_alert_email } = e;
  return { slug, main_language, languages, timezone, venue_name, venue_address, venue_postal_code, venue_city, venue_country,
    lat, lng, region, audience, listed, sales_paused, licensee_alert_email };
}

export function SettingsTab({ data, onSaved, checklist }: TabProps & { checklist: ReactNode }) {
  const { t, i18n } = useTranslation('events');
  const ev = data.event;
  const saved = useMemo(() => pick(ev), [ev]);
  const [s, setS] = useState<S>(saved);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState(false);
  useEffect(() => { setS(saved); }, [saved]);
  const dirty = isDirty(s, saved);
  const set = <K extends keyof S>(k: K, v: S[K]) => setS((x) => ({ ...x, [k]: v }));
  const err = (k: string) => (errors[k] ? t(`errors.${errors[k]}`, { defaultValue: errors[k] }) : null);
  const base = data.public_url.slice(0, data.public_url.length - ev.slug.length);
  const countryNames = useMemo(() => {
    try { return new Intl.DisplayNames([i18n.language], { type: 'region' }); } catch { return null; }
  }, [i18n.language]);
  const tzs = TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone, ...TIMEZONES];

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const patch: EventSettingsPatch = { ...s, slug: s.slug.trim() };
      onSaved(await eventsApi.update(ev.id, patch));
      setMsg({ ok: true, text: t('common.saved') });
    } catch (e) {
      const ex = e as { errors?: Record<string, string> };
      if (ex.errors) setErrors(ex.errors);
      setMsg({ ok: false, text: errorText(t, e) });
    } finally {
      setSaving(false);
    }
  };

  const num = (v: string): number | null => {
    const n = Number(v.replace(',', '.'));
    return v.trim() === '' || isNaN(n) ? null : n;
  };

  return (
    <div className="space-y-6">
      <Card title={t('settings.publication')}>{checklist}</Card>

      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.address')} help={t('settings.slugHelp')} error={err('slug')} wide>
            <div className="flex items-stretch">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-sm whitespace-nowrap">
                {base.replace(/^https?:\/\//, '')}
              </span>
              <input className={`${inputCls} rounded-l-none`} value={s.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} />
            </div>
          </Field>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-3">{t('settings.languages')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.mainLanguage')}>
            <select className={inputCls} value={s.main_language} onChange={(e) => {
              const m = e.target.value as EventLang;
              setS((x) => ({ ...x, main_language: m, languages: x.languages.includes(m) ? x.languages : [...x.languages, m] }));
            }}>
              {EVENT_LANGS.map((l) => <option key={l} value={l}>{t(`langs.${l}`)}</option>)}
            </select>
          </Field>
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-2">{t('settings.extraLanguages')}</span>
            <div className="flex gap-4">
              {EVENT_LANGS.map((l) => (
                <label key={l} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={s.languages.includes(l)} disabled={l === s.main_language}
                    onChange={(e) => set('languages', e.target.checked ? [...s.languages, l] : s.languages.filter((x) => x !== l))} />
                  {t(`langs.${l}`)}
                </label>
              ))}
            </div>
          </div>
          <Field label={t('settings.timezone')}>
            <select className={inputCls} value={s.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {tzs.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
            </select>
          </Field>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-3">{t('settings.venue')}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.venueName')}><input className={inputCls} value={s.venue_name ?? ''} maxLength={190} onChange={(e) => set('venue_name', e.target.value || null)} /></Field>
          <Field label={t('settings.venueAddress')}><input className={inputCls} value={s.venue_address ?? ''} maxLength={255} onChange={(e) => set('venue_address', e.target.value || null)} /></Field>
          <Field label={t('settings.postalCode')}><input className={inputCls} value={s.venue_postal_code ?? ''} maxLength={20} onChange={(e) => set('venue_postal_code', e.target.value || null)} /></Field>
          <Field label={t('settings.city')}><input className={inputCls} value={s.venue_city ?? ''} maxLength={120} onChange={(e) => set('venue_city', e.target.value || null)} /></Field>
          <Field label={t('settings.country')}>
            <select className={inputCls} value={s.venue_country ?? 'FR'} onChange={(e) => set('venue_country', e.target.value)}>
              {COUNTRIES.map((c) => <option key={c} value={c}>{countryNames?.of(c) ?? c}</option>)}
            </select>
          </Field>
          <Field label={t('settings.region')}>
            <select className={inputCls} value={s.region ?? ''} onChange={(e) => set('region', e.target.value || null)}>
              <option value="">—</option>
              {REGIONS.map((r) => <option key={r} value={r}>{t(`settings.regions.${r}`)}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2 grid grid-cols-2 gap-4">
            <Field label={`${t('settings.lat')} (${t('common.optional')})`}>
              <input className={inputCls} inputMode="decimal" value={s.lat ?? ''} placeholder="48.9156" onChange={(e) => set('lat', num(e.target.value))} />
            </Field>
            <Field label={`${t('settings.lng')} (${t('common.optional')})`}>
              <input className={inputCls} inputMode="decimal" value={s.lng ?? ''} placeholder="2.7342" onChange={(e) => set('lng', num(e.target.value))} />
            </Field>
            <p className="col-span-2 -mt-2 text-xs text-slate-500">{t('settings.geoHelp')}</p>
          </div>
          <Field label={t('settings.audience')}>
            <select className={inputCls} value={s.audience} onChange={(e) => set('audience', e.target.value as Audience)}>
              {AUDIENCES.map((a) => <option key={a} value={a}>{t(`settings.aud.${a}`)}</option>)}
            </select>
          </Field>
        </div>

        <h3 className="text-lg font-semibold text-slate-900 mt-6 mb-3">{t('settings.visibility')}</h3>
        <div className="space-y-3">
          <Toggle checked={s.listed} onChange={(v) => set('listed', v)} label={t('settings.listed')} help={t('settings.listedHelp')} />
          <Toggle checked={s.sales_paused} onChange={(v) => set('sales_paused', v)} label={t('settings.salesPaused')} />
          <Field label={t('settings.alertEmail')} help={t('settings.alertEmailHelp')} error={err('licensee_alert_email')}>
            <input type="email" className={`${inputCls} max-w-md`} value={s.licensee_alert_email ?? ''} onChange={(e) => set('licensee_alert_email', e.target.value || null)} />
          </Field>
        </div>

        <div className="mt-6"><SaveBar dirty={dirty} saving={saving} onSave={save} label={t('settings.save')} msg={msg} /></div>
      </Card>

      <section className="bg-white rounded-xl border border-red-200 p-6">
        <h3 className="text-lg font-semibold text-red-800">{t('cancel.dangerZone')}</h3>
        {data.cancelled_at ? (
          <div className="mt-2 space-y-3 text-sm">
            <p className="text-red-800">{t('cancel.eventCancelledOn', { date: new Date(data.cancelled_at).toLocaleString(i18n.language) })}</p>
            {data.jobs.filter((j) => j.kind === 'cancel_event').slice(0, 1).map((j) => <JobProgress key={j.id} job={j} />)}
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600 mt-1 mb-3">{t('cancel.cancel_event.help')}</p>
            <button className={btnDanger} onClick={() => setCancelling(true)}><Ban className="w-4 h-4" />{t('cancel.cancel_event.button')}</button>
          </>
        )}
      </section>

      {cancelling && (
        <CancelFlowModal kind="cancel_event" label={t('cancel.cancel_event.label', { count: data.bookings_count })}
          onStart={(reason) => eventsApi.eventCancel(ev.id, reason)}
          onClose={() => setCancelling(false)}
          onDone={(p) => { setCancelling(false); if (p) onSaved(p); else eventsApi.get(ev.id).then(onSaved).catch(() => {}); }} />
      )}
    </div>
  );
}
