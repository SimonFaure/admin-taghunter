import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { eventsAdminApi, formatBp, formatCents, PaymentsApiError } from '../../../lib/paymentsApi';
import type { AdminLicenseeEvents } from '../../../types/payments';

// Admin licensee page -> "Events" section: master switch, commission override,
// public slug, and a read-only view of the licensee's legal info + Stripe state.
// Saves through events_admin.php (admin-only), never clients.php.

const inputCls = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';
const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50';
const btnSecondary = 'inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50';

const GATE_LABEL: Record<string, string> = {
  events_disabled: 'Events disabled',
  subscription_inactive: 'Licence overdue past grace: new sales paused',
  payments_unavailable: 'Stripe not active: paid sales impossible',
  events_unavailable: 'Events migration not applied',
};

export function AdminEventsSection({ clientId }: { clientId: number }) {
  const [data, setData] = useState<AdminLicenseeEvents | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [pct, setPct] = useState('');
  const [fixed, setFixed] = useState('');
  const [slug, setSlug] = useState('');
  const [vies, setVies] = useState(false);

  const apply = (d: AdminLicenseeEvents) => {
    setData(d);
    const isCustom = d.commission_bp !== null || d.commission_fixed_cents !== null;
    setCustom(isCustom);
    setPct(String((d.commission.bp) / 100));
    setFixed(String(d.commission.fixed_cents / 100));
    setSlug(d.slug ?? '');
  };

  useEffect(() => {
    eventsAdminApi.licensee(clientId).then(apply).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [clientId]);

  if (error) {
    return <p className="text-sm text-red-600">{error === 'events_unavailable' ? 'Events migration (add_events_p1_payments.sql) not applied on this database.' : error}</p>;
  }
  if (!data) return <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>;

  const save = async (patch: Parameters<typeof eventsAdminApi.saveLicensee>[0]) => {
    setSaving(true);
    setMsg(null);
    try {
      apply(await eventsAdminApi.saveLicensee(patch));
      setMsg('Saved.');
    } catch (e) {
      setMsg(e instanceof PaymentsApiError && e.errors ? Object.values(e.errors).join(', ') : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const saveCommissionAndSlug = () => save({
    client_id: clientId,
    commission_bp: custom ? Math.round(parseFloat(pct.replace(',', '.') || '0') * 100) : null,
    commission_fixed_cents: custom ? Math.round(parseFloat(fixed.replace(',', '.') || '0') * 100) : null,
    slug: slug.trim() || null,
  });

  const l = data.legal;
  const s = data.stripe;

  return (
    <div className="space-y-6">
      {/* Switch */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="font-medium text-slate-900">Events / online ticketing</div>
          <div className="text-sm text-slate-600">Shows "Payments" (and, from phase 2, "Events") in the licensee portal.</div>
        </div>
        <button
          onClick={() => save({ client_id: clientId, events_enabled: !data.events_enabled })}
          disabled={saving}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${data.events_enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
          aria-pressed={data.events_enabled}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${data.events_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      {data.sales_gate && data.events_enabled && (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />{GATE_LABEL[data.sales_gate] ?? data.sales_gate}
        </p>
      )}

      {/* Commission + slug */}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">Commission (booking fee paid by buyers, TTC)</div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" checked={!custom} onChange={() => setCustom(false)} /> Platform default
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 mt-1">
            <input type="radio" checked={custom} onChange={() => setCustom(true)} /> Custom for this licensee
          </label>
          {custom && (
            <div className="flex items-center gap-2 mt-2 text-sm">
              <input className={`${inputCls} w-20`} value={pct} onChange={(e) => setPct(e.target.value)} /> % +
              <input className={`${inputCls} w-20`} value={fixed} onChange={(e) => setFixed(e.target.value)} /> € / paid ticket
            </div>
          )}
          <div className="text-xs text-slate-500 mt-2">
            Effective now: {formatBp(data.commission.bp, 'fr')} + {formatCents(data.commission.fixed_cents, 'fr')}
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-slate-700 mb-2">Public slug (events.taghunter.fr/o/…)</div>
          <input className={`${inputCls} w-full`} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="not set" />
          <div className="text-xs text-slate-500 mt-1">The licensee can also set it from their Payments page.</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={saveCommissionAndSlug} disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>

      {/* Read-only: legal + Stripe */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4 text-sm">
          <div className="font-medium text-slate-900 mb-2">Legal information</div>
          {l.legal_name ? (
            <dl className="space-y-1 text-slate-700">
              <div><b>{l.legal_name}</b>{l.legal_form ? ` (${l.legal_form})` : ''}</div>
              {l.siret && <div>SIRET {l.siret}</div>}
              <div className="flex items-center gap-2 flex-wrap">
                {l.vat_regime === 'exempt' ? 'VAT exempt (293 B)' : <>VAT {l.vat_number ?? '—'} · {l.vat_default_bp / 100} %</>}
                {l.vat_number && (l.vat_valid === true
                  ? <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />VIES ok</span>
                  : <span className="text-amber-700">{l.vat_valid === false ? 'VIES: invalid' : 'VIES: not checked'}</span>)}
                {l.vat_number && (
                  <button className={btnSecondary} disabled={vies} onClick={async () => {
                    setVies(true);
                    try { apply(await eventsAdminApi.viesRecheck(clientId)); } catch { setMsg('VIES unavailable, try later.'); }
                    setVies(false);
                  }}><RefreshCw className={`w-3.5 h-3.5 ${vies ? 'animate-spin' : ''}`} />Re-check</button>
                )}
              </div>
              <div>{[l.address_line1, l.address_line2, `${l.postal_code ?? ''} ${l.city ?? ''}`.trim(), l.country].filter(Boolean).join(', ')}</div>
              <div>{l.legal_email}{l.public_phone ? ` · ${l.public_phone}` : ''}</div>
            </dl>
          ) : <p className="text-slate-500">Not filled in yet.</p>}
          {data.missing.length > 0 && <p className="text-xs text-amber-700 mt-2">Missing: {data.missing.join(', ')}</p>}
          <p className="text-xs text-slate-500 mt-2">
            Platform terms: {data.terms_version ? `v${data.terms_version} accepted ${data.terms_accepted_at ?? ''}` : 'not accepted'}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4 text-sm">
          <div className="font-medium text-slate-900 mb-2">Stripe</div>
          {!s.configured && <p className="text-amber-700 mb-2">Platform Stripe keys not configured (backend/config/payments.php).</p>}
          {s.connected ? (
            <dl className="space-y-1 text-slate-700">
              <div>State: <b>{s.state}</b>{s.livemode === false ? ' (test mode)' : ''}</div>
              <div>Charges {s.charges_enabled ? 'on' : 'off'} · Payouts {s.payouts_enabled ? 'on' : 'off'}</div>
              {s.disabled_reason && <div className="text-amber-700">Disabled: {s.disabled_reason}</div>}
              {(s.requirements?.currently_due?.length ?? 0) > 0 && <div className="text-amber-700">Due: {s.requirements!.currently_due.join(', ')}</div>}
              <a className="inline-flex items-center gap-1 text-blue-700 hover:underline"
                 href={`https://dashboard.stripe.com/${s.livemode ? '' : 'test/'}connect/accounts/${s.account_id}`} target="_blank" rel="noreferrer">
                {s.account_id} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </dl>
          ) : <p className="text-slate-500">No Stripe account connected.</p>}
        </div>
      </div>
    </div>
  );
}
