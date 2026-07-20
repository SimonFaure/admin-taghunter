import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Smartphone, Users, Film, CheckCircle2, Star } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { useAuth } from '../../auth/AuthContext';
import { getAppAccess } from '../../auth/appAccess';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

type ByScenarioRow = {
  scenario_id: number | string | null;
  scenario_title: string | null;
  loads: number | string;
  teams: number | string;
  finished: number | string;
  avg_score: number | string | null;
  best_score: number | string | null;
  last_played: string | null;
};

type GoStats = {
  by_scenario: ByScenarioRow[];
  totals: {
    loads: number | string;
    teams: number | string;
    finished: number | string;
    scenarios: number | string;
    avg_score: number | string | null;
    best_score: number | string | null;
    teams_30d: number | string;
  };
};

const num = (v: number | string | null | undefined) => Number(v ?? 0);

function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso.replace(' ', 'T'));
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}

/**
 * GO & Drop usage sections for the merged Statistics page. Each app's section
 * shows the caller's own usage (go.php?action=client_go_stats&app=… - scoped to
 * their client_id): how many times each scenario was opened (loads) and what
 * teams scored. Sections render per enabled app; the whole block hides when the
 * client has neither GO nor Drop (project_client_app_section / project_taghunter_drop).
 */
export function GoDropStatsSections() {
  const { t } = useTranslation('client');
  const { user } = useAuth();
  const access = getAppAccess(user);

  if (!access.go && !access.drop) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 mb-1">
        <LineChart className="w-7 h-7 text-emerald-600" />
        <h1 className="text-2xl font-bold text-slate-900">{t('goStats.title')}</h1>
      </div>
      <p className="text-slate-500 mb-6">{t('goStats.subtitle')}</p>

      {access.go && <StatsSection app="go" heading={t('goStats.goHeading')} />}
      {access.drop && <StatsSection app="drop" heading={t('goStats.dropHeading')} />}
    </div>
  );
}

/** One app's stats block (cards + per-scenario table), self-fetching by app. */
function StatsSection({ app, heading }: { app: 'go' | 'drop'; heading: string }) {
  const { t } = useTranslation('client');
  const [stats, setStats] = useState<GoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch(`${API_BASE_URL}/go.php?action=client_go_stats&app=${app}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setStats(json.data as GoStats);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('goStats.error'));
      } finally {
        setLoading(false);
      }
    })();
  }, [app, t]);

  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">{heading}</h2>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={Smartphone} label={t('goStats.cards.loads')} value={num(stats?.totals.loads)} tint="emerald" />
            <StatCard icon={Users} label={t('goStats.cards.teams')} value={num(stats?.totals.teams)} sub={t('goStats.cards.teams30d', { count: num(stats?.totals.teams_30d) })} tint="blue" />
            <StatCard icon={CheckCircle2} label={t('goStats.cards.finished')} value={num(stats?.totals.finished)} tint="green" />
            <StatCard icon={Film} label={t('goStats.cards.scenarios')} value={num(stats?.totals.scenarios)} tint="amber" />
            <StatCard icon={Star} label={t('goStats.cards.bestScore')} value={num(stats?.totals.best_score)} tint="rose" />
            <StatCard icon={LineChart} label={t('goStats.cards.avgScore')} value={num(stats?.totals.avg_score)} tint="violet" />
          </div>

          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">
            {t('goStats.byScenario')}
          </h3>
          {!stats?.by_scenario.length ? (
            <div className="text-center py-12 bg-slate-50 rounded-lg text-slate-500">{t('goStats.empty')}</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">{t('goStats.table.scenario')}</th>
                    <th className="px-4 py-2 text-right">{t('goStats.table.loads')}</th>
                    <th className="px-4 py-2 text-right">{t('goStats.table.teams')}</th>
                    <th className="px-4 py-2 text-right">{t('goStats.table.finished')}</th>
                    <th className="px-4 py-2 text-right">{t('goStats.table.avg')}</th>
                    <th className="px-4 py-2 text-right">{t('goStats.table.best')}</th>
                    <th className="px-4 py-2 text-right">{t('goStats.table.lastPlayed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.by_scenario.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 text-slate-900">
                        {row.scenario_title || `#${row.scenario_id ?? '-'}`}
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{num(row.loads)}</td>
                      <td className="px-4 py-2.5 text-right font-medium text-slate-900">{num(row.teams)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{num(row.finished)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{row.avg_score == null ? '-' : num(row.avg_score)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{row.best_score == null ? '-' : num(row.best_score)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{fmtDate(row.last_played)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
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
  tint: 'emerald' | 'blue' | 'green' | 'amber' | 'rose' | 'violet';
}) {
  const tints: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-600',
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    amber: 'bg-amber-100 text-amber-600',
    rose: 'bg-rose-100 text-rose-600',
    violet: 'bg-violet-100 text-violet-600',
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
