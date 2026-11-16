import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { ordersApi, OrdersApiError } from '../../../lib/ordersApi';
import { formatDate, formatMoney, STATUS_STYLES } from '../../../lib/ordersFormat';
import type { OrderRequestDetail, OrderRequestSummary } from '../../../types/orders';

// /my/orders/requests and /my/orders/requests/:id - the licensee's request history.

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-700'}`}>{label}</span>;
}

export function MyOrderRequestsView() {
  const { t, i18n } = useTranslation('orders');
  const lang = i18n.language;
  const navigate = useNavigate();
  const [rows, setRows] = useState<OrderRequestSummary[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    ordersApi.myRequests(lang).then(setRows).catch(() => setError(true));
  }, [lang]);

  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2"><ClipboardList className="w-6 h-6" />{t('requestsTitle')}</h2>
        <p className="text-slate-600 mt-1">{t('requestsSubtitle')}</p>
      </div>
      {error ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-600 mb-4">{t('loadError')}</p>
          <button type="button" onClick={load} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm">{t('retry')}</button>
        </div>
      ) : rows === null ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">{t('requests.none')}</div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">{t('requests.number')}</th>
                <th className="px-4 py-3 font-medium">{t('requests.type')}</th>
                <th className="px-4 py-3 font-medium">{t('requests.date')}</th>
                <th className="px-4 py-3 font-medium">{t('requests.items')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('requests.total')}</th>
                <th className="px-4 py-3 font-medium">{t('requests.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/my/orders/requests/${r.id}`)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.number}</td>
                  <td className="px-4 py-3">
                    {t(`requests.kind_${r.kind}`)}
                    {r.kind === 'rent' && r.rent_start && (
                      <span className="block text-xs text-slate-500">{t('rent.period', { a: formatDate(r.rent_start, lang), b: formatDate(r.rent_end, lang), count: r.days })}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(r.created_at, lang)}</td>
                  <td className="px-4 py-3 text-slate-600">{r.line_count}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(r.total_cents, lang)}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} label={t(`status.${r.status}`)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function MyOrderRequestDetailView() {
  const { t, i18n } = useTranslation('orders');
  const lang = i18n.language;
  const { id = '' } = useParams();
  const [req, setReq] = useState<OrderRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ordersApi.myRequest(Number(id), lang).then(setReq).catch(() => setError(t('loadError')));
  }, [id, lang, t]);

  const cancel = async () => {
    if (!req || !window.confirm(t('requests.cancelConfirm', { number: req.number }))) return;
    setBusy(true);
    try {
      setReq(await ordersApi.cancel(req.id, lang));
    } catch (e) {
      setError(e instanceof OrdersApiError && e.message === 'not_cancellable' ? t('errors.not_cancellable') : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link to="/my/orders/requests" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
      <ArrowLeft className="w-4 h-4" />{t('requests.back')}
    </Link>
  );

  if (!req) {
    return (
      <div className="space-y-4">
        {back}
        {error ? <p className="text-slate-600">{error}</p> : <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" /></div>}
      </div>
    );
  }

  const rent = req.kind === 'rent';
  const address = [req.company, req.contact_name, req.address_line1, req.address_line2, [req.postal_code, req.city].filter(Boolean).join(' '), req.country].filter(Boolean);

  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
            {req.number}
            <StatusBadge status={req.status} label={t(`status.${req.status}`)} />
          </h2>
          <p className="text-slate-600 mt-1">
            {rent ? t('titleRent') : t('titleSale')} · {formatDate(req.created_at, lang)}
            {rent && req.rent_start && <> · {t('rent.period', { a: formatDate(req.rent_start, lang), b: formatDate(req.rent_end, lang), count: req.days })}</>}
          </p>
        </div>
        {req.status === 'new' && (
          <button type="button" disabled={busy} onClick={cancel} className="px-4 py-2 rounded-lg border border-rose-300 text-rose-700 text-sm hover:bg-rose-50 disabled:opacity-50">
            {t('requests.cancel')}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('requests.product')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('requests.qty')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('requests.unit')}</th>
                  <th className="px-4 py-3 font-medium text-right">{t('requests.lineTotal')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {req.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3">
                      <span className="text-slate-900">{l.display_name}</span>
                      {l.sku && <span className="block text-xs text-slate-400">{l.sku}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">{l.quantity}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(l.unit_price_cents, lang)}{rent && l.product_id != null ? t('requests.perDay') : ''}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(l.total_cents, lang)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200">
                  <td colSpan={3} className="px-4 py-3 text-right font-semibold">{t('requests.estimate')}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMoney(req.total_cents, lang)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="px-4 pb-3 text-xs text-slate-500">{t('basket.note')}</p>
          </div>

          {req.message && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">{t('requests.message')}</h3>
              <p className="text-sm text-slate-700 whitespace-pre-line">{req.message}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <h3 className="font-semibold text-slate-900 mb-2">{t('requests.address')}</h3>
            {address.map((a, i) => <p key={i} className="text-slate-700">{a}</p>)}
            <p className="text-slate-700 mt-1">{req.contact_email}{req.contact_phone ? ` · ${req.contact_phone}` : ''}</p>
            {rent && (
              <p className="text-slate-600 mt-2">
                {t('rent.pickup')} : {req.pickup_mode ? t(`mode.${req.pickup_mode}`) : '-'}<br />
                {t('rent.return')} : {req.return_mode ? t(`mode.${req.return_mode}`) : '-'}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">{t('requests.history')}</h3>
            <ol className="space-y-3">
              {req.events.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="text-slate-900">
                    {e.type === 'created' ? t('requests.event_created') : e.type === 'edited' ? t('requests.event_edited') : t('requests.event_status', { status: t(`status.${e.status}`) })}
                    {e.type === 'status' && e.actor === 'client' && <span className="text-slate-500"> ({t('requests.by_client')})</span>}
                  </p>
                  <p className="text-xs text-slate-500">{formatDate(e.created_at, lang)}</p>
                  {e.note && (
                    <div className="mt-1 rounded-lg bg-slate-50 px-3 py-2">
                      <p className="text-xs font-medium text-slate-500">{t('requests.noteFromTh')}</p>
                      <p className="text-slate-700 whitespace-pre-line">{e.note}</p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
