import { TrendingUp, Trophy, Target, Clock, Calendar } from 'lucide-react';
import { useState, useEffect } from 'react';

export function ClientStatisticsView() {
  const [stats] = useState({
    gamesPlayed: 0,
    totalTime: '0h',
    averageScore: 0,
    achievements: 0,
    winRate: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  return (
    <div>
      <div className="mb-6">
        <p className="text-slate-600">
          Track your gaming performance and achievements
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="p-3 bg-blue-100 rounded-lg w-fit mb-4">
                <Target className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats.gamesPlayed}</h3>
              <p className="text-sm text-slate-600">Games Played</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="p-3 bg-emerald-100 rounded-lg w-fit mb-4">
                <Clock className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats.totalTime}</h3>
              <p className="text-sm text-slate-600">Play Time</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="p-3 bg-amber-100 rounded-lg w-fit mb-4">
                <TrendingUp className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats.averageScore}</h3>
              <p className="text-sm text-slate-600">Avg Score</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="p-3 bg-rose-100 rounded-lg w-fit mb-4">
                <Trophy className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats.achievements}</h3>
              <p className="text-sm text-slate-600">Achievements</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="p-3 bg-purple-100 rounded-lg w-fit mb-4">
                <Target className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats.winRate}%</h3>
              <p className="text-sm text-slate-600">Win Rate</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Recent Games</h3>
              <div className="space-y-3">
                <div className="text-center py-8 text-slate-500">
                  No games played yet
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Achievements</h3>
              <div className="space-y-3">
                <div className="text-center py-8 text-slate-500">
                  No achievements unlocked yet
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center space-x-3 mb-4">
              <Calendar className="w-5 h-5 text-slate-900" />
              <h3 className="text-lg font-bold text-slate-900">Activity Timeline</h3>
            </div>
            <div className="text-center py-8 text-slate-500">
              Start playing to see your activity timeline
            </div>
          </div>
        </>
      )}
    </div>
  );
}
