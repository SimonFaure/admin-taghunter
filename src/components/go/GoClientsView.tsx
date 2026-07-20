import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, CheckCircle2, XCircle, ChevronRight } from 'lucide-react';
import { clientApi } from '../../lib/clientApi';
import type { Client } from '../../types/client';

/**
 * Admin GO/Drop → Clients: the operators who have the app enabled, with their
 * billing state. Click through to the full client page to manage flags + scenario
 * grants. Part of the admin "GO" / "Drop" nav groups (parameterized by `app`).
 */
export function GoClientsView({
  onViewClient,
  app = 'go',
}: {
  onViewClient: (id: string) => void;
  app?: 'go' | 'drop';
}) {
  const { t } = useTranslation();
  const isDrop = app === 'drop';
  const tint = isDrop ? 'text-sky-600' : 'text-emerald-600';
  const appName = isDrop ? 'Drop' : 'GO';
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await clientApi.getClients();
      setClients(data || []);
      setLoading(false);
    })();
  }, []);

  const goClients = useMemo(
    () =>
      clients.filter((c) => {
        const flag = (c as unknown as Record<string, unknown>)[isDrop ? 'drop_enabled' : 'go_enabled'];
        return Number(flag) === 1 || flag === true;
      }),
    [clients, isDrop],
  );

  // Billing-ok flag + grace differ per app.
  const billingOk = (c: Client) =>
    isDrop
      ? Number((c as unknown as Record<string, unknown>).drop_billing_ok) === 1 || (c as unknown as Record<string, unknown>).drop_billing_ok === true
      : !!c.go_subscription_active;
  const graceDays = (c: Client): string => {
    const v = isDrop ? (c as unknown as Record<string, unknown>).drop_billing_grace_days : c.go_billing_grace_days;
    return v == null ? '-' : String(v);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Smartphone className={`w-7 h-7 ${tint}`} />
        <h1 className="text-2xl font-bold text-slate-900">{t('goViews:clients.title', { app: appName })}</h1>
      </div>
      <p className="text-slate-500 mb-6">{t('goViews:clients.subtitle', { app: appName })}</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
        </div>
      ) : goClients.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-lg">
          <Smartphone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">{t('goViews:clients.noneEnabled', { app: appName })}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">{t('goViews:clients.colClient')}</th>
                <th className="px-4 py-2">{t('goViews:clients.colSubscription')}</th>
                <th className="px-4 py-2">{t('goViews:clients.colGrace')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {goClients.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onViewClient(String(c.id))}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900">{c.name || c.email}</div>
                    <div className="text-xs text-slate-500">{c.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {billingOk(c) ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 className="w-4 h-4" /> {t('goViews:clients.active')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-red-600">
                        <XCircle className="w-4 h-4" /> {t('goViews:clients.inactive')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{graceDays(c)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <ChevronRight className="w-4 h-4 text-slate-400 inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
