import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, TrendingUp, Gamepad2, UserCircle } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { HelpButton } from '../help';
import { StatsActivityChart, type TimeseriesRow } from './StatsActivityChart';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// Shared game-statistics view, fed by /backend/api/statistics.php reading the
// game_summaries table. The endpoint scopes by role: admins see every client
// (and a client filter + client column); clients see only their own games. The
// component adapts off the `is_admin` flag in the response, so the same code
// serves the admin dashboard tab and the client /my/game-statistics page.

interface Overview {
  total_games: number;
  total_teams: number;
  total_players: number;
}
interface ScenarioStat {
  scenario_uniqid: string | null;
  title: string;
  launches: number;
  players: number;
}
interface ClientStat {
  client_id: number;
  name: string | null;
  email: string | null;
  launches: number;
}
interface OverviewResp {
  overview: Overview;
  games_per_day: Array<{ date: string; count: number }>;
  top_scenarios: ScenarioStat[];
  top_clients?: ClientStat[];
  is_admin: boolean;
}
interface GameRow {
  summary_uuid: string;
  name: string | null;
  game_type: string;
  scenario_uniqid: string | null;
  scenario_title: string | null;
  played_at: string | null;
  teams_launched: number | null;
  teams_played: number;
  players_played: number;
  client_id: number;
  client_name: string | null;
  client_email: string | null;
}
interface FiltersResp {
  game_types: string[];
  scenarios: Array<{ scenario_uniqid: string; title: string }>;
  clients?: Array<{ client_id: number; name: string | null; email: string | null }>;
}

interface FilterState {
  from: string;
  to: string;
  game_type: string;
  scenario_uniqid: string;
  client_id: string;
}

const EMPTY_FILTERS: FilterState = { from: '', to: '', game_type: '', scenario_uniqid: '', client_id: '' };

export function StatisticsView() {
  const { t, i18n } = useTranslation('statistics');
  const [stats, setStats] = useState<OverviewResp | null>(null);
  const [series, setSeries] = useState<TimeseriesRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [options, setOptions] = useState<FiltersResp | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'games'>('overview');

  const queryString = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.from) p.set('from', filters.from);
    if (filters.to) p.set('to', filters.to);
    if (filters.game_type) p.set('game_type', filters.game_type);
    if (filters.scenario_uniqid) p.set('scenario_uniqid', filters.scenario_uniqid);
    if (filters.client_id) p.set('client_id', filters.client_id);
    return p.toString();
  }, [filters]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const qs = queryString();
      const suffix = qs ? `&${qs}` : '';
      const [overviewRes, listRes, filtersRes, seriesRes] = await Promise.all([
        authFetch(`${API_BASE_URL}/statistics.php?action=overview${suffix}`),
        authFetch(`${API_BASE_URL}/statistics.php?action=list&limit=200${suffix}`),
        authFetch(`${API_BASE_URL}/statistics.php?action=filters${suffix}`),
        authFetch(`${API_BASE_URL}/statistics.php?action=timeseries${suffix}`),
      ]);
      if (!overviewRes.ok || !listRes.ok || !filtersRes.ok || !seriesRes.ok) {
        throw new Error(t('errors.fetchFailed'));
      }
      setStats(await overviewRes.json());
      setGames((await listRes.json()).games ?? []);
      setOptions(await filtersRes.json());
      setSeries((await seriesRes.json()).rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const isAdmin = stats?.is_admin ?? false;

  const setFilter = (k: keyof FilterState, v: string) => setFilters((prev) => ({ ...prev, [k]: v }));

  const fmtDate = (s: string | null) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString(i18n.language) : t('empty'));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <HelpButton chapter="statistics" className="text-slate-400 hover:text-slate-700" />
      </div>
      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('filters.from')}</label>
          <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('filters.to')}</label>
          <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('filters.gameType')}</label>
          <select value={filters.game_type} onChange={(e) => setFilter('game_type', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm capitalize min-w-[8rem]">
            <option value="">{t('filters.all')}</option>
            {options?.game_types.map((gt) => <option key={gt} value={gt}>{gt}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('filters.scenario')}</label>
          <select value={filters.scenario_uniqid} onChange={(e) => setFilter('scenario_uniqid', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm min-w-[10rem]">
            <option value="">{t('filters.all')}</option>
            {options?.scenarios.map((s) => <option key={s.scenario_uniqid} value={s.scenario_uniqid}>{s.title}</option>)}
          </select>
        </div>
        {isAdmin && options?.clients && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t('filters.client')}</label>
            <select value={filters.client_id} onChange={(e) => setFilter('client_id', e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm min-w-[10rem]">
              <option value="">{t('filters.all')}</option>
              {options.clients.map((c) => <option key={c.client_id} value={String(c.client_id)}>{c.name || c.email || `#${c.client_id}`}</option>)}
            </select>
          </div>
        )}
        {(filters.from || filters.to || filters.game_type || filters.scenario_uniqid || filters.client_id) && (
          <button onClick={() => setFilters(EMPTY_FILTERS)}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 underline">{t('filters.clear')}</button>
        )}
      </div>

      <div className="flex space-x-4 border-b border-slate-200">
        <button onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium transition-all ${activeTab === 'overview' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
          {t('tabs.overview')}
        </button>
        <button onClick={() => setActiveTab('games')}
          className={`px-4 py-2 font-medium transition-all ${activeTab === 'games' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
          {t('tabs.games')}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="text-red-800">{error}</p></div>
      ) : !stats ? null : activeTab === 'overview' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KpiCard icon={<Gamepad2 className="w-6 h-6 text-blue-600" />} bg="bg-blue-100" value={stats.overview.total_games} label={t('kpi.gamesPlayed')} lang={i18n.language} />
            <KpiCard icon={<Users className="w-6 h-6 text-emerald-600" />} bg="bg-emerald-100" value={stats.overview.total_teams} label={t('kpi.teams')} lang={i18n.language} />
            <KpiCard icon={<UserCircle className="w-6 h-6 text-amber-600" />} bg="bg-amber-100" value={stats.overview.total_players} label={t('kpi.players')} lang={i18n.language} />
          </div>

          <StatsActivityChart rows={series} allGameTypes={options?.game_types ?? []} from={filters.from} to={filters.to} />

          <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : ''} gap-6`}>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <TrendingUp className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-bold text-slate-900">{t('topScenarios.title')}</h3>
              </div>
              <div className="space-y-3">
                {stats.top_scenarios.length === 0 ? (
                  <p className="text-slate-600 text-sm">{t('topScenarios.empty')}</p>
                ) : stats.top_scenarios.slice(0, 5).map((s, i) => (
                  <div key={(s.scenario_uniqid ?? '') + i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-semibold text-slate-400 w-6">#{i + 1}</span>
                      <span className="text-sm font-medium text-slate-900">{s.title}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-600">{t('topScenarios.gameCount', { count: s.launches })}</span>
                  </div>
                ))}
              </div>
            </div>

            {isAdmin && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Users className="w-5 h-5 text-slate-700" />
                  <h3 className="text-lg font-bold text-slate-900">{t('topClients.title')}</h3>
                </div>
                <div className="space-y-3">
                  {(stats.top_clients ?? []).length === 0 ? (
                    <p className="text-slate-600 text-sm">{t('topClients.empty')}</p>
                  ) : (stats.top_clients ?? []).slice(0, 5).map((c, i) => (
                    <div key={c.client_id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <span className="text-sm font-semibold text-slate-400 w-6">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{c.name || t('empty')}</p>
                          <p className="text-xs text-slate-500 truncate">{c.email}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-slate-600 ml-2">{c.launches}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">{t('table.date')}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">{t('table.name')}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">{t('table.type')}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">{t('table.scenario')}</th>
                  {isAdmin && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">{t('table.client')}</th>}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">{t('table.teams')}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">{t('table.players')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {games.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 7 : 6} className="px-6 py-12 text-center text-slate-600">{t('table.empty')}</td></tr>
                ) : games.map((g) => (
                  <tr key={g.summary_uuid} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">{fmtDate(g.played_at)}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{g.name || t('empty')}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 capitalize">{g.game_type}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{g.scenario_title || g.scenario_uniqid || t('empty')}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-sm">
                        <div className="text-slate-900">{g.client_name || t('empty')}</div>
                        <div className="text-xs text-slate-500">{g.client_email}</div>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right text-sm text-slate-900">
                      {g.teams_played}
                      {g.teams_launched != null && g.teams_launched !== g.teams_played && (
                        <span className="text-slate-400"> / {g.teams_launched}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-900">{g.players_played}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, bg, value, label, lang }: { icon: React.ReactNode; bg: string; value: number; label: string; lang: string }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 ${bg} rounded-lg`}>{icon}</div>
      </div>
      <h3 className="text-2xl font-bold text-slate-900 mb-1">{value.toLocaleString(lang)}</h3>
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}
