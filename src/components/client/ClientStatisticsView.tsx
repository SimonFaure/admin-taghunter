import { StatisticsView } from '../StatisticsView';

// Per-client game statistics. Reuses the shared StatisticsView, which is
// auto-scoped to the logged-in client by statistics.php (the endpoint returns
// is_admin=false for a client token, so no client column / client filter / top
// clients are shown — just this client's own played-game stats).
export function ClientStatisticsView() {
  return (
    <div>
      <div className="mb-6">
        <p className="text-slate-600">Your games, teams, and players over time.</p>
      </div>
      <StatisticsView />
    </div>
  );
}
