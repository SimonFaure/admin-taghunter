import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, Circle, ExternalLink, Loader2, RefreshCw, ShieldCheck, Wallet,
} from 'lucide-react';
import { PaymentsApiError, formatBp, formatCents, paymentsApi, type LegalSaveInput } from '../../../lib/paymentsApi';
import type { FieldErrors, PaymentsStatus, StripeState } from '../../../types/payments';
import { InvoicesSection } from './InvoicesSection';

// /my/payments - Events phase 1: legal identity, platform terms, Stripe Connect.
// Design: Claude plan "ok-i-need-a-moonlit-goose" (decisions 1, 2, 13, 23).

const EVENTS_PUBLIC_BASE = (import.meta.env.VITE_EVENTS_PUBLIC_BASE as string | undefined) || 'https://events.taghunter.fr';

const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';
const btnSecondary = 'inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50';
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';
const card = 'bg-white rounded-xl border border-slate-200 p-6';

type Form = Required<Omit<LegalSaveInput, 'accept_terms' | 'vat_valid' | 'vat_checked_at'>>;

function formFromStatus(s: PaymentsStatus): Form {
  const l = s.legal;
  return {
    legal_name: l.legal_name ?? '',
    legal_form: l.legal_form ?? '',
    siret: l.siret ?? '',
    vat_number: l.vat_number ?? '',
    vat_regime: l.vat_regime,
    vat_default_bp: l.vat_default_bp,
    address_line1: l.address_line1 ?? '',
    address_line2: l.address_line2 ?? '',
    postal_code: l.postal_code ?? '',
    city: l.city ?? '',
    country: l.country ?? 'FR',
    legal_email: l.legal_email ?? '',
    public_phone: l.public_phone ?? '',
    slug: s.slug ?? '',
  };
}

const STATE_TONE: Record<StripeState, string> = {
  none: 'bg-slate-100 text-slate-700',
  onboarding_incomplete: 'bg-amber-100 text-amber-800',
  pending_verification: 'bg-blue-100 text-blue-800',
  action_needed: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  disconnected: 'bg-red-100 text-red-800',
};

export function MyPaymentsView() {
  const { t, i18n } = useTranslation('payments');
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const handledReturn = useRef(false);

  const apply = useCallback((s: PaymentsStatus) => {
    setStatus(s);
    setForm(formFromStatus(s));
  }, []);

  const startStripe = useCallback(async () => {
    setStripeBusy(true);
    setStripeError(null);
    try {
      window.location.href = await paymentsApi.connectStart();
    } catch (e) {
      const msg = e instanceof PaymentsApiError ? e.message : String(e);
      setStripeError(msg);
      setStripeBusy(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    paymentsApi.status()
      .then((s) => { if (alive) apply(s); })
      .catch((e) => {
        if (!alive) return;
        setLoadError(e instanceof PaymentsApiError && e.message === 'events_disabled' ? t('unavailable') : t('loadError'));
      });
    return () => { alive = false; };
  }, [apply, t]);

  // Back from Stripe: ?stripe=return -> re-read the account; ?stripe=refresh ->
  // the onboarding link expired, get a fresh one and go straight back.
  useEffect(() => {
    const flag = params.get('stripe');
    if (!flag || handledReturn.current || !status) return;
    handledReturn.current = true;
    params.delete('stripe');
    setParams(params, { replace: true });
    if (flag === 'refresh') {
      void startStripe();
    } else {
      setStripeBusy(true);
      paymentsApi.connectRefresh().then(apply).catch(() => {}).finally(() => setStripeBusy(false));
    }
  }, [params, setParams, status, apply, startStripe]);

  const countryNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([i18n.language], { type: 'region' });
    } catch {
      return null;
    }
  }, [i18n.language]);

  if (loadError) {
    return (
      <div className="space-y-6">
        <Header t={t} />
        <div className={`${card} text-slate-700 flex items-start gap-3`}>
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p>{loadError}</p>
        </div>
      </div>
    );
  }
  if (!status || !form) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-12 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" /> {t('loading')}
      </div>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await paymentsApi.saveLegal({ ...form, accept_terms: acceptTerms || undefined });
      apply(res.data);
      setErrors(res.errors ?? {});
      setAcceptTerms(false);
      setNotice({ tone: 'ok', text: t('legal.saved') });
    } catch (e) {
      if (e instanceof PaymentsApiError && e.errors) setErrors(e.errors);
      setNotice({ tone: 'error', text: t('legal.saveError') });
    } finally {
      setSaving(false);
    }
  };

  const err = (key: string) => (errors[key] ? <p className="mt-1 text-xs text-red-600">{t(`errors.${errors[key]}`)}</p> : null);
  const legalMissing = status.missing.filter((m) => m !== 'terms');
  const legalDone = legalMissing.length === 0;
  const termsDone = status.terms.accepted;
  const stripeDone = status.stripe.state === 'active' || status.stripe.state === 'action_needed';
  const locale = i18n.language;

  return (
    <div className="space-y-6 max-w-4xl">
      <Header t={t} />

      {/* Progress */}
      <div className={`${card} grid gap-3 sm:grid-cols-3`}>
        {([['legal', legalDone], ['terms', termsDone], ['stripe', stripeDone]] as const).map(([key, done], i) => (
          <div key={key} className="flex items-center gap-3">
            {done
              ? <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              : <Circle className="w-6 h-6 text-slate-300 shrink-0" />}
            <div>
              <div className="text-sm font-medium text-slate-900">{i + 1}. {t(`steps.${key}`)}</div>
              <div className={`text-xs ${done ? 'text-emerald-700' : 'text-slate-500'}`}>{done ? t('steps.done') : t('steps.todo')}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Commission */}
      <div className={`${card} bg-slate-50`}>
        <h3 className="font-semibold text-slate-900 mb-1">{t('commission.title')}</h3>
        <p className="text-sm text-slate-700">
          {t('commission.text', {
            rate: formatBp(status.commission.bp, locale),
            fixed: formatCents(status.commission.fixed_cents, locale),
          })}
        </p>
        {status.commission.custom && <p className="text-xs text-slate-500 mt-2">{t('commission.custom')}</p>}
      </div>

      {/* Legal info */}
      <section className={card}>
        <h3 className="text-lg font-semibold text-slate-900">{t('legal.title')}</h3>
        <p className="text-sm text-slate-600 mt-1 mb-5">{t('legal.help')}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('legal.legal_name')} error={err('legal_name')}>
            <input className={inputCls} value={form.legal_name ?? ''} onChange={(e) => set('legal_name', e.target.value)} />
          </Field>
          <Field label={t('legal.legal_form')}>
            <input className={inputCls} value={form.legal_form ?? ''} placeholder={t('legal.legal_form_placeholder')} onChange={(e) => set('legal_form', e.target.value)} />
          </Field>

          <Field label={t('legal.country')} help={t('legal.country_help')} error={err('country')}>
            <select className={inputCls} value={form.country ?? ''} onChange={(e) => set('country', e.target.value)}>
              {status.countries.map((c) => (
                <option key={c} value={c}>{countryNames?.of(c) ?? c}</option>
              ))}
            </select>
          </Field>
          <Field label={t('legal.siret')} help={t('legal.siret_help')} error={err('siret')}>
            <input className={inputCls} inputMode="numeric" value={form.siret ?? ''} onChange={(e) => set('siret', e.target.value)} />
          </Field>

          <div className="sm:col-span-2">
            <span className="block text-sm font-medium text-slate-700 mb-2">{t('legal.vat_regime')}</span>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-6">
              {(['subject', 'exempt'] as const).map((r) => (
                <label key={r} className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="radio" name="vat_regime" checked={form.vat_regime === r} onChange={() => set('vat_regime', r)} />
                  {t(r === 'subject' ? 'legal.vat_subject' : 'legal.vat_exempt')}
                </label>
              ))}
            </div>
          </div>

          {form.vat_regime === 'subject' && (
            <>
              <Field label={t('legal.vat_number')} error={err('vat_number')}>
                <input className={inputCls} value={form.vat_number ?? ''} onChange={(e) => set('vat_number', e.target.value.toUpperCase())} />
                {status.legal.vat_number && status.legal.vat_number === form.vat_number?.replace(/[^A-Z0-9]/gi, '') && (
                  <VatBadge valid={status.legal.vat_valid ?? null} t={t} />
                )}
              </Field>
              <Field label={t('legal.vat_default')} help={t('legal.vat_default_help')}>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min={0} max={30} step={0.1} className={`${inputCls} max-w-[8rem]`}
                    value={(form.vat_default_bp ?? 2000) / 100}
                    onChange={(e) => set('vat_default_bp', Math.round(parseFloat(e.target.value || '0') * 100))}
                  />
                  <span className="text-sm text-slate-600">%</span>
                </div>
              </Field>
            </>
          )}

          <Field label={t('legal.address_line1')} error={err('address_line1')} wide>
            <input className={inputCls} value={form.address_line1 ?? ''} onChange={(e) => set('address_line1', e.target.value)} />
          </Field>
          <Field label={t('legal.address_line2')} wide>
            <input className={inputCls} value={form.address_line2 ?? ''} onChange={(e) => set('address_line2', e.target.value)} />
          </Field>
          <Field label={t('legal.postal_code')} error={err('postal_code')}>
            <input className={inputCls} value={form.postal_code ?? ''} onChange={(e) => set('postal_code', e.target.value)} />
          </Field>
          <Field label={t('legal.city')} error={err('city')}>
            <input className={inputCls} value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label={t('legal.legal_email')} help={t('legal.legal_email_help')} error={err('legal_email')}>
            <input type="email" className={inputCls} value={form.legal_email ?? ''} onChange={(e) => set('legal_email', e.target.value)} />
          </Field>
          <Field label={t('legal.public_phone')}>
            <input type="tel" className={inputCls} value={form.public_phone ?? ''} onChange={(e) => set('public_phone', e.target.value)} />
          </Field>

          <Field label={t('legal.slug')} help={t('legal.slug_help')} error={err('slug')} wide>
            <div className="flex items-stretch">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 text-slate-500 text-sm whitespace-nowrap">
                {EVENTS_PUBLIC_BASE.replace(/^https?:\/\//, '')}/o/
              </span>
              <input className={`${inputCls} rounded-l-none`} value={form.slug ?? ''} onChange={(e) => set('slug', e.target.value)} />
            </div>
          </Field>
        </div>

        {/* Terms */}
        <div className="mt-6 pt-5 border-t border-slate-200">
          <h4 className="font-semibold text-slate-900 flex items-center gap-2"><ShieldCheck className="w-5 h-5" />{t('terms.title')}</h4>
          <p className="text-sm text-slate-600 mt-1">{t('terms.text')}</p>
          {status.terms.url && (
            <a href={status.terms.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline mt-2">
              {t('terms.read', { version: status.terms.required_version })} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {status.terms.accepted ? (
            <p className="text-sm text-emerald-700 mt-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {t('terms.acceptedOn', {
                date: status.terms.accepted_at ? new Date(status.terms.accepted_at.replace(' ', 'T') + 'Z').toLocaleDateString(locale) : '',
                version: status.terms.accepted_version,
              })}
            </p>
          ) : (
            <>
              {status.terms.accepted_version && <p className="text-sm text-amber-700 mt-3">{t('terms.newVersion')}</p>}
              <label className="flex items-start gap-2 text-sm text-slate-800 mt-3">
                <input type="checkbox" className="mt-0.5" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
                {t('terms.accept', { version: status.terms.required_version })}
              </label>
            </>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button className={btnPrimary} onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? t('legal.saving') : t('legal.save')}
          </button>
          {notice && <span className={`text-sm ${notice.tone === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{notice.text}</span>}
        </div>
        {status.missing.length > 0 && (
          <p className="text-xs text-slate-500 mt-3">
            {t('legal.stillMissing', { fields: status.missing.map((m) => t(`fields.${m}`, { defaultValue: m })).join(', ') })}
          </p>
        )}
      </section>

      {/* Stripe */}
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">{t('stripe.title')}</h3>
          {status.stripe.configured && <div className="flex items-center gap-2">
            {status.stripe.connected && status.stripe.livemode === false && (
              <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-800">{t('stripe.testMode')}</span>
            )}
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATE_TONE[status.stripe.state]}`}>
              {t(`stripe.states.${status.stripe.state}`)}
            </span>
          </div>}
        </div>
        <p className="text-sm text-slate-600 mt-1">{t('stripe.help')}</p>

        {!status.stripe.configured ? (
          <p className="mt-4 text-sm text-slate-700 bg-slate-50 rounded-lg p-3">{t('stripe.notConfigured')}</p>
        ) : (
          <StripeBody
            status={status}
            busy={stripeBusy}
            locale={locale}
            t={t}
            onConnect={startStripe}
            onRefresh={() => {
              setStripeBusy(true);
              paymentsApi.connectRefresh().then(apply).catch(() => {}).finally(() => setStripeBusy(false));
            }}
          />
        )}
        {stripeError && (
          <p className="mt-3 text-sm text-red-600">
            {status.missing.length > 0 && stripeError === 'legal_info_incomplete' ? t('stripe.needLegal') : t('stripe.error', { message: stripeError })}
          </p>
        )}
      </section>

      {/* Commission invoices (phase 3) */}
      <InvoicesSection />
    </div>
  );
}

type T = ReturnType<typeof useTranslation>['t'];

function Header({ t }: { t: T }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Wallet className="w-6 h-6" />{t('title')}</h2>
      <p className="text-slate-600 mt-1">{t('subtitle')}</p>
    </div>
  );
}

function Field({ label, help, error, wide, children }: {
  label: string; help?: string; error?: ReactNode; wide?: boolean; children: ReactNode;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {help && !error && <span className="block mt-1 text-xs text-slate-500">{help}</span>}
      {error}
    </label>
  );
}

function VatBadge({ valid, t }: { valid: boolean | null; t: T }) {
  if (valid === true) return <span className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" />{t('legal.vat_valid')}</span>;
  if (valid === false) return <span className="mt-1 inline-flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="w-3.5 h-3.5" />{t('legal.vat_invalid')}</span>;
  return <span className="mt-1 inline-block text-xs text-slate-500">{t('legal.vat_unchecked')}</span>;
}

function StripeBody({ status, busy, locale, t, onConnect, onRefresh }: {
  status: PaymentsStatus; busy: boolean; locale: string; t: T; onConnect: () => void; onRefresh: () => void;
}) {
  const s = status.stripe;
  const blocked = status.missing.length > 0;
  const deadline = s.requirements?.current_deadline
    ? new Date(s.requirements.current_deadline * 1000).toLocaleDateString(locale)
    : null;

  const action = (() => {
    switch (s.state) {
      case 'none': return t('stripe.connect');
      case 'disconnected': return t('stripe.reconnect');
      case 'onboarding_incomplete': return t('stripe.continue');
      case 'action_needed': return t('stripe.update');
      default: return null;
    }
  })();

  return (
    <div className="mt-4 space-y-4">
      {s.state !== 'none' && s.state !== 'disconnected' && (
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-slate-700">{t('stripe.charges')} : <b className={s.charges_enabled ? 'text-emerald-700' : 'text-slate-500'}>{t(s.charges_enabled ? 'stripe.on' : 'stripe.off')}</b></span>
          <span className="text-slate-700">{t('stripe.payouts')} : <b className={s.payouts_enabled ? 'text-emerald-700' : 'text-slate-500'}>{t(s.payouts_enabled ? 'stripe.on' : 'stripe.off')}</b></span>
        </div>
      )}
      {s.state !== 'none' && (
        <p className="text-sm text-slate-700">{t(`stripe.stateHelp.${s.state}`)}{deadline && s.state === 'action_needed' ? ` ${t('stripe.deadline', { date: deadline })}` : ''}</p>
      )}
      {blocked && (s.state === 'none' || s.state === 'disconnected') && (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3">{t('stripe.needLegal')}</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {action && (
          <button className={btnPrimary} onClick={onConnect} disabled={busy || (blocked && (s.state === 'none' || s.state === 'disconnected'))}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? t('stripe.redirecting') : action}
          </button>
        )}
        {s.connected && s.state !== 'disconnected' && (
          <>
            <button className={btnSecondary} onClick={onRefresh} disabled={busy}>
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />{t('stripe.refresh')}
            </button>
            <a className={btnSecondary} href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer">
              {t('stripe.dashboard')} <ExternalLink className="w-4 h-4" />
            </a>
          </>
        )}
      </div>
      {s.state === 'none' && <p className="text-xs text-slate-500">{t('stripe.connectHelp')}</p>}
    </div>
  );
}
