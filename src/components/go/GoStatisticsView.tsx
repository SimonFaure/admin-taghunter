import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Users, Film, Smartphone } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

type ByScenarioRow = {
  client_id: number | string | null;
  client_name: string | null;
  scenario_id: number | string | null;
  scenario_title: string | null;
  loads: number | string;
};

type GoStats = {
  by_scenario: ByScenarioRow[];
  totals: { total_loads: number | string; clients: number | string; scenarios: number | string };
  teams: { teams: number | string };
};

/**
 * Admin GO/Drop → Statistics: usage across all operators. Loads are the "which
 * client ran which scenario, how many times" metric; the team count comes from
 * go_scores. Backed by go.php?action=go_stats (admin-token gated), filtered by
 * `app`. Parameterized for the GO and Drop nav groups.
 */
export function GoStatisticsView({ app = 'go' }: { app?: 'go' | 'drop' }) {
  const { t } = useTranslation();
  const isDrop = app === 'drop';
  const appName = isDrop ? 'Drop' : 'GO';
  const tint = isDrop ? 'text-sky-600' : 'text-emerald-600';
  const [stats, setStats] = useState<GoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/go.php?action=go_stats&app=${app}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setStats(json.data as GoStats);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('goViews:stats.loadError', { app: appName }));
      } finally {
        setLoading(false);
      }
    })();
  }, [app, appName, t]);

  const num = (v: number | string | null | undefined) => Number(v ?? 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <BarChart3 className={`w-7 h-7 ${tint}`} />
        <h1 className="text-2xl font-bold text-slate-900">{t('goViews:stats.title', { app: appName })}</h1>
      </div>
      <p className="text-slate-500 mb-6">{t('goViews:stats.subtitle', { app: appName })}</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon={Smartphone} label={t('goViews:stats.totalLoads')} value={num(stats?.totals.total_loads)} tint="emerald" />
            <StatCard icon={Users} label={t('goViews:stats.clientsUsing', { app: appName })} value={num(stats?.totals.clients)} tint="blue" />
            <StatCard icon={Film} label={t('goViews:stats.scenariosPlayed')} value={num(stats?.totals.scenarios)} tint="amber" />
            <StatCard icon={Users} label={t('goViews:stats.teamsPlayed')} value={num(stats?.teams.teams)} tint="rose" />
          </div>

          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">{t('goViews:stats.loadsByScenario')}</h2>
          {!stats?.by_scenario.length ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg text-slate-500">{t('goViews:stats.noLoads', { app: appName })}</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">{t('goViews:stats.colClient')}</th>
                    <th className="px-4 py-2">{t('goViews:stats.colScenario')}</th>
                    <th className="px-4 py-2 text-right">{t('goViews:stats.colLoads')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.by_scenario.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 text-slate-900">{row.client_name || t('goViews:stats.clientFallback', { id: row.client_id ?? '-' })}</td>
                      <td className="px-4 py-2.5 text-slate-600">{row.scenario_title || t('goViews:stats.scenarioFallback', { id: row.scenario_id ?? '-' })}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-900">{num(row.loads)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  sub?: string;
  tint: 'emerald' | 'blue' | 'amber' | 'rose';
}) {
  const tints: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-600',
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600',
    rose: 'bg-rose-100 text-rose-600',
  };
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
      <div className={`inline-flex p-2.5 rounded-lg mb-3 ${tints[tint]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</h3>
      <p className="text-sm text-slate-600">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
