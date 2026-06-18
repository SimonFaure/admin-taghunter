import { useTranslation } from 'react-i18next';
import { StatisticsView } from '../StatisticsView';

// Per-client game statistics. Reuses the shared StatisticsView, which is
// auto-scoped to the logged-in client by statistics.php (the endpoint returns
// is_admin=false for a client token, so no client column / client filter / top
// clients are shown — just this client's own played-game stats).
export function ClientStatisticsView() {
  const { t } = useTranslation('clientStats');
  return (
    <div>
      <div className="mb-6">
        <p className="text-slate-600">{t('subtitle')}</p>
      </div>
      <StatisticsView />
    </div>
  );
}
