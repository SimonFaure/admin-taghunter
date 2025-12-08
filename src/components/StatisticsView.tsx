import { useState, useEffect } from 'react';
import { BarChart3, Users, Clock, CheckCircle, TrendingUp, Gamepad2 } from 'lucide-react';

interface Statistics {
  overview: {
    total_games: number;
    unique_clients: number;
    avg_duration: number;
    completion_rate: number;
  };
  games_per_day: Array<{ date: string; count: number }>;
  top_scenarios: Array<{ id: number; title: string; launches: number }>;
  top_clients: Array<{ id: number; name: string; email: string; launches: number }>;
}

interface RecentGame {
  id: number;
  client_id: number;
  client_name: string;
  client_email: string;
  scenario_id: number | null;
  scenario_title: string | null;
  game_title: string | null;
  launched_at: string;
  duration_minutes: number;
  completed: boolean;
}

export function StatisticsView() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [recentGames, setRecentGames] = useState<RecentGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'recent'>('overview');

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      setLoading(true);

      const [overviewRes, recentRes] = await Promise.all([
        fetch('https://admin.taghunter.fr/backend/api/statistics.php?action=overview', {
          credentials: 'include',
        }),
        fetch('https://admin.taghunter.fr/backend/api/statistics.php?action=recent&limit=20', {
          credentials: 'include',
        }),
      ]);

      if (!overviewRes.ok || !recentRes.ok) {
        throw new Error('Failed to fetch statistics');
      }

      const overviewData = await overviewRes.json();
      const recentData = await recentRes.json();

      setStats(overviewData);
      setRecentGames(recentData.games || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex space-x-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium transition-all ${
            activeTab === 'overview'
              ? 'text-slate-900 border-b-2 border-slate-900'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('recent')}
          className={`px-4 py-2 font-medium transition-all ${
            activeTab === 'recent'
              ? 'text-slate-900 border-b-2 border-slate-900'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Recent Activity
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Gamepad2 className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">
                {stats.overview.total_games.toLocaleString()}
              </h3>
              <p className="text-sm text-slate-600">Total Games Launched</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-emerald-100 rounded-lg">
                  <Users className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">
                {stats.overview.unique_clients.toLocaleString()}
              </h3>
              <p className="text-sm text-slate-600">Active Clients</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">
                {stats.overview.avg_duration.toFixed(1)} min
              </h3>
              <p className="text-sm text-slate-600">Avg. Duration</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">
                {stats.overview.completion_rate}%
              </h3>
              <p className="text-sm text-slate-600">Completion Rate</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <TrendingUp className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-bold text-slate-900">Top Scenarios</h3>
              </div>
              <div className="space-y-3">
                {stats.top_scenarios.length === 0 ? (
                  <p className="text-slate-600 text-sm">No scenarios launched yet</p>
                ) : (
                  stats.top_scenarios.slice(0, 5).map((scenario, index) => (
                    <div key={scenario.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-semibold text-slate-400 w-6">#{index + 1}</span>
                        <span className="text-sm font-medium text-slate-900">{scenario.title}</span>
                      </div>
                      <span className="text-sm font-semibold text-slate-600">{scenario.launches}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <Users className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-bold text-slate-900">Top Clients</h3>
              </div>
              <div className="space-y-3">
                {stats.top_clients.length === 0 ? (
                  <p className="text-slate-600 text-sm">No client activity yet</p>
                ) : (
                  stats.top_clients.slice(0, 5).map((client, index) => (
                    <div key={client.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <span className="text-sm font-semibold text-slate-400 w-6">#{index + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{client.name}</p>
                          <p className="text-xs text-slate-500 truncate">{client.email}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold text-slate-600 ml-2">{client.launches}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {stats.games_per_day.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center space-x-2 mb-4">
                <BarChart3 className="w-5 h-5 text-slate-700" />
                <h3 className="text-lg font-bold text-slate-900">Games Per Day (Last 30 Days)</h3>
              </div>
              <div className="space-y-2">
                {stats.games_per_day.slice(0, 10).map((day) => (
                  <div key={day.date} className="flex items-center space-x-4">
                    <span className="text-sm text-slate-600 w-24">{new Date(day.date).toLocaleDateString()}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full"
                        style={{
                          width: `${Math.min((day.count / Math.max(...stats.games_per_day.map(d => d.count))) * 100, 100)}%`
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-900 w-12 text-right">{day.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'recent' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Scenario
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Launched At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {recentGames.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-600">
                      No games launched yet
                    </td>
                  </tr>
                ) : (
                  recentGames.map((game) => (
                    <tr key={game.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{game.client_name}</div>
                          <div className="text-xs text-slate-500">{game.client_email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-900">
                          {game.scenario_title || game.game_title || 'N/A'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-900">
                          {new Date(game.launched_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-900">
                          {game.duration_minutes > 0 ? `${game.duration_minutes} min` : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          game.completed
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {game.completed ? 'Completed' : 'In Progress'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
