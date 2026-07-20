import { useTranslation } from 'react-i18next';
import { StatisticsView } from '../StatisticsView';
import { useAuth } from '../../auth/AuthContext';
import { getAppAccess } from '../../auth/appAccess';
import { GoDropStatsSections } from './ClientGoStatisticsView';

// Merged client Statistics page. Shows the Playground game statistics (the shared
// StatisticsView, auto-scoped to the logged-in client by statistics.php) when the
// client has Playground, followed by GO & Drop usage sections for whichever of
// those apps is enabled. A GO/Drop-only client (no Playground) sees just the
// GO/Drop block. (project_client_app_section)
export function ClientStatisticsView() {
  const { t } = useTranslation('clientStats');
  const { user } = useAuth();
  const access = getAppAccess(user);

  return (
    <div>
      <div className="mb-6">
        <p className="text-slate-600">{t('subtitle')}</p>
      </div>
      {access.playground && <StatisticsView />}
      <GoDropStatsSections />
    </div>
  );
}
