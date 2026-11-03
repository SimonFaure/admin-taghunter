import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileText, Loader2 } from 'lucide-react';
import { formatCents, paymentsApi } from '../../../lib/paymentsApi';
import type { CommissionInvoice } from '../../../types/payments';

// /my/payments -> monthly commission invoices issued by Tag Hunter (Events phase 3).

const btn = 'inline-flex items-center gap-1 px-2 py-1 border border-slate-300 text-slate-700 rounded-md text-xs font-medium hover:bg-slate-50 disabled:opacity-50';

export function InvoicesSection() {
  const { t, i18n } = useTranslation('payments');
  const locale = i18n.language;
  const [rows, setRows] = useState<CommissionInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    paymentsApi.invoices().then(setRows).catch(() => setError(t('invoices.loadError')));
  }, [t]);

  const period = (inv: CommissionInvoice) => {
    const [y, m] = inv.period_start.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  };
  const download = async (inv: CommissionInvoice, what: 'pdf' | 'csv') => {
    setBusy(`${inv.id}-${what}`);
    try {
      await paymentsApi.downloadInvoice(inv, what);
    } catch {
      setError(t('invoices.downloadError'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5" />{t('invoices.title')}</h3>
      <p className="text-sm text-slate-600 mt-1 mb-4">{t('invoices.help')}</p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {!rows && !error && <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" />…</div>}
      {rows && rows.length === 0 && <p className="text-sm text-slate-500">{t('invoices.empty')}</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">{t('invoices.number')}</th>
                <th className="py-2 pr-3">{t('invoices.period')}</th>
                <th className="py-2 pr-3 text-right">{t('invoices.ht')}</th>
                <th className="py-2 pr-3 text-right">{t('invoices.vat')}</th>
                <th className="py-2 pr-3 text-right">{t('invoices.ttc')}</th>
                <th className="py-2 pr-3">{t('invoices.scheme')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => {
                const sign = inv.kind === 'credit_note' ? '− ' : '';
                return (
                  <tr key={inv.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <div className="font-mono text-xs">{inv.number}</div>
                      <div className="text-xs text-slate-500">{t(inv.kind === 'credit_note' ? 'invoices.creditNote' : 'invoices.invoice')}</div>
                    </td>
                    <td className="py-2 pr-3 capitalize">{period(inv)}<div className="text-xs text-slate-500 normal-case">{t('invoices.bookings', { count: inv.bookings_count })}</div></td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{sign}{formatCents(inv.ht_cents, locale)}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{sign}{formatCents(inv.vat_cents, locale)}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap font-medium">{sign}{formatCents(inv.fees_ttc_cents, locale)}</td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{t(inv.vat_scheme === 'eu_reverse' ? 'invoices.reverse' : 'invoices.frVat')}</td>
                    <td className="py-2 whitespace-nowrap">
                      <button className={btn} disabled={busy !== null} onClick={() => download(inv, 'pdf')}>
                        {busy === `${inv.id}-pdf` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}PDF
                      </button>{' '}
                      <button className={btn} disabled={busy !== null} onClick={() => download(inv, 'csv')}>
                        {busy === `${inv.id}-csv` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}CSV
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
