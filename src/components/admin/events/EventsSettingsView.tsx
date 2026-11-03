import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { eventsAdminApi, PaymentsApiError } from '../../../lib/paymentsApi';
import type { EventsPlatformSettings } from '../../../types/payments';

// Admin -> Events -> Settings: platform-wide defaults for online ticketing.
// Per-licensee switch + commission override live on the licensee page.

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';
const card = 'bg-white rounded-xl border border-slate-200 p-6';

const ISSUER_FIELDS: [string, string][] = [
  ['legal_name', 'Legal name'], ['legal_form', 'Legal form'], ['capital', 'Share capital'],
  ['siret', 'SIRET'], ['rcs', 'RCS'], ['vat_number', 'VAT number'],
  ['address_line1', 'Address'], ['address_line2', 'Address line 2'], ['postal_code', 'Postal code'],
  ['city', 'City'], ['country', 'Country'], ['email', 'Email'], ['phone', 'Phone'],
  ['iban', 'IBAN'], ['bic', 'BIC'],
];

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-slate-400" />}
      <span className={ok ? 'text-slate-800' : 'text-slate-500'}>{label}</span>
    </div>
  );
}

export function EventsSettingsView() {
  const [s, setS] = useState<EventsPlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pct, setPct] = useState('');
  const [fixed, setFixed] = useState('');

  const apply = (d: EventsPlatformSettings) => {
    setS(d);
    setPct(String(d.commission_bp_default / 100));
    setFixed(String(d.commission_fixed_cents_default / 100));
  };

  useEffect(() => {
    eventsAdminApi.settings().then(apply).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <p className="text-red-600">{error === 'events_unavailable' ? 'Events migration (add_events_p1_payments.sql) not applied.' : error}</p>;
  if (!s) return <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      apply(await eventsAdminApi.saveSettings({
        commission_bp_default: Math.round(parseFloat(pct.replace(',', '.') || '0') * 100),
        commission_fixed_cents_default: Math.round(parseFloat(fixed.replace(',', '.') || '0') * 100),
        platform_terms_version: s.platform_terms_version,
        platform_terms_url: s.platform_terms_url,
        invoice_series_prefix: s.invoice_series_prefix,
        invoice_issuer: s.invoice_issuer,
      }));
      setMsg('Saved.');
    } catch (e) {
      setMsg(e instanceof PaymentsApiError && e.errors ? Object.values(e.errors).join(', ') : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const issuer = (s.invoice_issuer ?? {}) as Record<string, string>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className={card}>
        <h3 className="text-lg font-semibold text-slate-900 mb-3">Configuration</h3>
        <div className="space-y-2">
          <Check ok={s.stripe_configured} label={s.stripe_configured ? `Stripe keys set (${s.stripe_live ? 'LIVE' : 'test'} mode)` : 'Stripe keys missing in backend/config/payments.php'} />
          <Check ok={s.mailjet_configured} label={s.mailjet_configured ? 'Mailjet keys set' : 'Mailjet keys missing in backend/config/payments.php'} />
        </div>
      </div>

      <div className={card}>
        <h3 className="text-lg font-semibold text-slate-900">Default commission</h3>
        <p className="text-sm text-slate-600 mb-3">Booking fee added to each order and paid by the buyer (VAT included). Licensees without a custom rate use this.</p>
        <div className="flex items-center gap-2 text-sm">
          <input className={`${inputCls} w-24`} value={pct} onChange={(e) => setPct(e.target.value)} /> % +
          <input className={`${inputCls} w-24`} value={fixed} onChange={(e) => setFixed(e.target.value)} /> € per paid ticket
        </div>
      </div>

      <div className={card}>
        <h3 className="text-lg font-semibold text-slate-900">Platform terms</h3>
        <p className="text-sm text-slate-600 mb-3">Licensees must accept this version before connecting Stripe. Raising the version asks everyone to accept again.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Version</span>
            <input className={inputCls} value={s.platform_terms_version} onChange={(e) => setS({ ...s, platform_terms_version: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-sm font-medium text-slate-700 mb-1">Document URL</span>
            <input className={inputCls} value={s.platform_terms_url} placeholder="https://…" onChange={(e) => setS({ ...s, platform_terms_url: e.target.value })} />
          </label>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-lg font-semibold text-slate-900">Commission invoices</h3>
        <p className="text-sm text-slate-600 mb-3">Taghunter's identity printed on the monthly commission invoices (phase 3).</p>
        <label className="block mb-4 max-w-xs">
          <span className="block text-sm font-medium text-slate-700 mb-1">Invoice number prefix</span>
          <input className={inputCls} value={s.invoice_series_prefix} onChange={(e) => setS({ ...s, invoice_series_prefix: e.target.value })} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {ISSUER_FIELDS.map(([key, label]) => (
            <label key={key} className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
              <input className={inputCls} value={issuer[key] ?? ''}
                onChange={(e) => setS({ ...s, invoice_issuer: { ...issuer, [key]: e.target.value } })} />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50" onClick={save} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save settings
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}
