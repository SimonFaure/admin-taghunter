import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Users, TrendingUp, Gamepad2, UserCircle } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { HelpButton } from '../help';

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
  const [stats, setStats] = useState<OverviewResp | null>(null);
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
      const [overviewRes, listRes, filtersRes] = await Promise.all([
        authFetch(`${API_BASE_URL}/statistics.php?action=overview${suffix}`),
        authFetch(`${API_BASE_URL}/statistics.php?action=list&limit=200${suffix}`),
        authFetch(`${API_BASE_URL}/statistics.php?action=filters${suffix}`),
      ]);
      if (!overviewRes.ok || !listRes.ok || !filtersRes.ok) {
        throw new Error('Failed to fetch statistics');
      }
      setStats(await overviewRes.json());
      setGames((await listRes.json()).games ?? []);
      setOptions(await filtersRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const isAdmin = stats?.is_admin ?? false;
  const maxPerDay = stats ? Math.max(1, ...stats.games_per_day.map((d) => d.count)) : 1;

  const setFilter = (k: keyof FilterState, v: string) => setFilters((prev) => ({ ...prev, [k]: v }));

  const fmtDate = (s: string | null) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString() : '—');

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <HelpButton chapter="statistics" className="text-slate-400 hover:text-slate-700" />
      </div>
      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
          <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
          <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Game type</label>
          <select value={filters.game_type} onChange={(e) => setFilter('game_type', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm capitalize min-w-[8rem]">
            <option value="">All</option>
            {options?.game_types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Scenario</label>
          <select value={filters.scenario_uniqid} onChange={(e) => setFilter('scenario_uniqid', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm min-w-[10rem]">
            <option value="">All</option>
            {options?.scenarios.map((s) => <option key={s.scenario_uniqid} value={s.scenario_uniqid}>{s.title}</option>)}
          </select>
        </div>
        {isAdmin && options?.clients && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Client</label>
            <select value={filters.client_id} onChange={(e) => setFilter('client_id', e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm min-w-[10rem]">
              <option value="">All</option>
              {options.clients.map((c) => <option key={c.client_id} value={String(c.client_id)}>{c.name || c.email || `#${c.client_id}`}</option>)}
            </select>
          </div>
        )}
        {(filters.from || filters.to || filters.game_type || filters.scenario_uniqid || filters.client_id) && (
          <button onClick={() => setFilters(EMPTY_FILTERS)}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 underline">Clear</button>
        )}
      </div>

      <div className="flex space-x-4 border-b border-slate-200">
        <button onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium transition-all ${activeTab === 'overview' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
          Overview
        </button>
        <button onClick={() => setActiveTab('games')}
          className={`px-4 py-2 font-medium transition-all ${activeTab === 'games' ? 'text-slate-900 border-b-2 border-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
          Games
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
            <KpiCard icon={<Gamepad2 className="w-6 h-6 text-blue-600" />} bg="bg-blue-100" value={stats.overview.total_games} label="Games Played" />
            <KpiCard icon={<Users className="w-6 h-6 text-emerald-600" />} bg="bg-emerald-100" value={stats.overview.total_teams} label="Teams" />
            <KpiCard icon={<UserCircle className="w-6 h-6 text-amber-600" />} bg="bg-amber-100" value={stats.overview.total_players} label="Players" />
          </div>

          <div className={`grid grid-cols-1 ${isAdmin ? 'lg:grid-cols-2' : ''} gap-6`}>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <TrendingUp className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-bold text-slate-900">Top Scenarios</h3>
              </div>
              <div className="space-y-3">
                {stats.top_scenarios.length === 0 ? (
                  <p className="text-slate-600 text-sm">No games yet</p>
                ) : stats.top_scenarios.slice(0, 5).map((s, i) => (
                  <div key={(s.scenario_uniqid ?? '') + i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-semibold text-slate-400 w-6">#{i + 1}</span>
                      <span className="text-sm font-medium text-slate-900">{s.title}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-600">{s.launches} game{s.launches === 1 ? '' : 's'}</span>
                  </div>
                ))}
              </div>
            </div>

            {isAdmin && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Users className="w-5 h-5 text-slate-700" />
                  <h3 className="text-lg font-bold text-slate-900">Top Clients</h3>
                </div>
                <div className="space-y-3">
                  {(stats.top_clients ?? []).length === 0 ? (
                    <p className="text-slate-600 text-sm">No client activity yet</p>
                  ) : (stats.top_clients ?? []).slice(0, 5).map((c, i) => (
                    <div key={c.client_id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <span className="text-sm font-semibold text-slate-400 w-6">#{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{c.name || '—'}</p>
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

          {stats.games_per_day.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <BarChart3 className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-bold text-slate-900">Games Per Day (Last 30 Days)</h3>
              </div>
              <div className="space-y-2">
                {stats.games_per_day.slice(0, 14).map((day) => (
                  <div key={day.date} className="flex items-center space-x-4">
                    <span className="text-sm text-slate-600 w-24">{new Date(day.date).toLocaleDateString()}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                      <div className="bg-blue-600 h-full rounded-full" style={{ width: `${Math.min((day.count / maxPerDay) * 100, 100)}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-slate-900 w-12 text-right">{day.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Scenario</th>
                  {isAdmin && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Client</th>}
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Teams</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Players</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {games.length === 0 ? (
                  <tr><td colSpan={isAdmin ? 7 : 6} className="px-6 py-12 text-center text-slate-600">No games match these filters</td></tr>
                ) : games.map((g) => (
                  <tr key={g.summary_uuid} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">{fmtDate(g.played_at)}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{g.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 capitalize">{g.game_type}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{g.scenario_title || g.scenario_uniqid || '—'}</td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-sm">
                        <div className="text-slate-900">{g.client_name || '—'}</div>
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

function KpiCard({ icon, bg, value, label }: { icon: React.ReactNode; bg: string; value: number; label: string }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 ${bg} rounded-lg`}>{icon}</div>
      </div>
      <h3 className="text-2xl font-bold text-slate-900 mb-1">{value.toLocaleString()}</h3>
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}
