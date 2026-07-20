import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/AuthContext';
import { getAppAccess } from '../../auth/appAccess';
import { GoSessionsView } from './GoSessionsView';

// Merged GO + Drop leaderboards. When the client has both apps a tab switcher
// picks which app's board to show; with only one enabled we drop straight into
// that app's view (no tabs). GoSessionsView renders its own per-app title, so
// the tab bar is the only chrome we add. (project_client_app_section /
// project_taghunter_drop)
export function RankingsView() {
  const { t } = useTranslation('client');
  const { user } = useAuth();
  const access = getAppAccess(user);
  const both = access.go && access.drop;
  const [app, setApp] = useState<'go' | 'drop'>(access.go ? 'go' : 'drop');

  if (!both) {
    // Exactly one (or, defensively, neither) app enabled: show the enabled one.
    return <GoSessionsView app={access.drop ? 'drop' : 'go'} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-6 pt-6">
        <button
          onClick={() => setApp('go')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            app === 'go' ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          {t('nav.goSessions')}
        </button>
        <button
          onClick={() => setApp('drop')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            app === 'drop' ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          {t('nav.dropSessions')}
        </button>
      </div>
      <GoSessionsView app={app} />
    </div>
  );
}
