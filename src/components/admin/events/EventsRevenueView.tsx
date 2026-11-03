import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { eventsAdminApi, formatCents, PaymentsApiError } from '../../../lib/paymentsApi';
import type { CommissionInvoice, RevenueRow } from '../../../types/payments';

// Admin -> Events -> Revenue: online ticket sales, Taghunter booking fees and
// refunds per licensee per month, plus the monthly commission invoices.

const card = 'bg-white rounded-xl border border-slate-200 p-6';
const inputCls = 'border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400';
const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50';
const btnSmall = 'inline-flex items-center gap-1 px-2 py-1 border border-slate-300 text-slate-700 rounded-md text-xs font-medium hover:bg-slate-50 disabled:opacity-50';

const eur = (c: number) => formatCents(c, 'fr-FR');

function lastMonth(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function EventsRevenueView() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<RevenueRow[] | null>(null);
  const [invoices, setInvoices] = useState<CommissionInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(lastMonth());
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dl, setDl] = useState<string | null>(null);

  const loadInvoices = useCallback(() => {
    eventsAdminApi.invoices().then(setInvoices).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    setRows(null);
    eventsAdminApi.revenue(year).then(setRows).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [year]);
  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const totals = useMemo(() => (rows ?? []).reduce((a, r) => ({
    bookings: a.bookings + r.bookings, gmv: a.gmv + r.gmv_cents, fees: a.fees + r.fees_cents,
    refunded: a.refunded + r.refunded_cents, feesRefunded: a.feesRefunded + r.fees_refunded_cents,
  }), { bookings: 0, gmv: 0, fees: 0, refunded: 0, feesRefunded: 0 }), [rows]);

  const generate = async () => {
    setGenBusy(true);
    setGenMsg(null);
    try {
      const n = await eventsAdminApi.generateInvoices(period);
      setGenMsg({ ok: true, text: n === 0 ? `Nothing new to issue for ${period} (already issued, or no fees).` : `${n} document(s) issued for ${period}.` });
      loadInvoices();
    } catch (e) {
      const code = e instanceof PaymentsApiError && e.errors ? e.errors.period : null;
      setGenMsg({ ok: false, text: code === 'not_finished' ? 'Only finished months can be invoiced.' : code === 'invalid' ? 'Invalid month.' : (e instanceof Error ? e.message : 'Failed.') });
    } finally {
      setGenBusy(false);
    }
  };

  const download = async (inv: CommissionInvoice, what: 'pdf' | 'csv') => {
    setDl(`${inv.id}${what}`);
    try { await eventsAdminApi.downloadInvoice(inv, what); } catch { setError('Download failed.'); } finally { setDl(null); }
  };

  if (error === 'events_unavailable') return <p className="text-red-600">Events migrations not applied on this database.</p>;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Online ticket sales</h3>
            <p className="text-sm text-slate-600">Paid online bookings by month of payment (UTC). GMV = what buyers paid; fees = Taghunter booking fees (TTC).</p>
          </div>
          <select className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {error && error !== 'events_unavailable' && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {!rows ? <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div> : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No paid online booking in {year}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Month</th>
                  <th className="py-2 pr-3">Licensee</th>
                  <th className="py-2 pr-3 text-right">Bookings</th>
                  <th className="py-2 pr-3 text-right">GMV</th>
                  <th className="py-2 pr-3 text-right">Fees</th>
                  <th className="py-2 pr-3 text-right">Refunded</th>
                  <th className="py-2 pr-3 text-right">Fees refunded</th>
                  <th className="py-2 text-right">Net fees</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.month}-${r.client_id}`} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">{r.month}</td>
                    <td className="py-2 pr-3">{r.licensee}</td>
                    <td className="py-2 pr-3 text-right">{r.bookings}</td>
                    <td className="py-2 pr-3 text-right">{eur(r.gmv_cents)}</td>
                    <td className="py-2 pr-3 text-right">{eur(r.fees_cents)}</td>
                    <td className="py-2 pr-3 text-right text-slate-500">{eur(r.refunded_cents)}</td>
                    <td className="py-2 pr-3 text-right text-slate-500">{eur(r.fees_refunded_cents)}</td>
                    <td className="py-2 text-right font-medium">{eur(r.fees_cents - r.fees_refunded_cents)}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-slate-50">
                  <td className="py-2 pr-3" colSpan={2}>Total {year}</td>
                  <td className="py-2 pr-3 text-right">{totals.bookings}</td>
                  <td className="py-2 pr-3 text-right">{eur(totals.gmv)}</td>
                  <td className="py-2 pr-3 text-right">{eur(totals.fees)}</td>
                  <td className="py-2 pr-3 text-right">{eur(totals.refunded)}</td>
                  <td className="py-2 pr-3 text-right">{eur(totals.feesRefunded)}</td>
                  <td className="py-2 text-right">{eur(totals.fees - totals.feesRefunded)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={card}>
        <h3 className="text-lg font-semibold text-slate-900">Commission invoices</h3>
        <p className="text-sm text-slate-600 mb-4">
          Issued automatically by the cron on the 1st of each month for the previous month (Paris time). Generating again is safe: a licensee&apos;s month is never invoiced twice.
        </p>
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <label>
            <span className="block text-xs text-slate-600 mb-0.5">Month</span>
            <input type="month" className={inputCls} value={period} max={lastMonth()} onChange={(e) => setPeriod(e.target.value)} />
          </label>
          <button className={btnPrimary} onClick={generate} disabled={genBusy || !period}>
            {genBusy && <Loader2 className="w-4 h-4 animate-spin" />}Generate invoices
          </button>
          {genMsg && <span className={`text-sm ${genMsg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{genMsg.text}</span>}
        </div>
        {!invoices ? <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div> : invoices.length === 0 ? (
          <p className="text-sm text-slate-500">No invoice issued yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-3">Number</th>
                  <th className="py-2 pr-3">Licensee</th>
                  <th className="py-2 pr-3">Period</th>
                  <th className="py-2 pr-3 text-right">HT</th>
                  <th className="py-2 pr-3 text-right">TTC</th>
                  <th className="py-2 pr-3">VAT</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">{inv.number}{inv.kind === 'credit_note' && <span className="ml-1 text-violet-700">(credit note)</span>}</td>
                    <td className="py-2 pr-3">{inv.licensee}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{inv.period_start.slice(0, 7)}</td>
                    <td className="py-2 pr-3 text-right">{eur(inv.ht_cents)}</td>
                    <td className="py-2 pr-3 text-right font-medium">{eur(inv.fees_ttc_cents)}</td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{inv.vat_scheme === 'eu_reverse' ? 'Reverse charge' : 'FR 20 %'}</td>
                    <td className="py-2 whitespace-nowrap">
                      <button className={btnSmall} disabled={dl !== null} onClick={() => download(inv, 'pdf')}>
                        {dl === `${inv.id}pdf` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}PDF
                      </button>{' '}
                      <button className={btnSmall} disabled={dl !== null} onClick={() => download(inv, 'csv')}>
                        {dl === `${inv.id}csv` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}CSV
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
