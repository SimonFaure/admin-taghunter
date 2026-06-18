import { Navigate, Route, Routes } from 'react-router-dom';
import { Dashboard } from '../components/Dashboard';
import { ClientLayout } from '../layouts/ClientLayout';
import { MyHomeView } from '../components/client/MyHomeView';
import { MyScenariosView } from '../components/client/MyScenariosView';
import { ScenarioDetailView } from '../components/client/ScenarioDetailView';
import { MyPatternsView } from '../components/client/MyPatternsView';
import { MyCardsView } from '../components/client/MyCardsView';
import { MyDevicesView } from '../components/client/MyDevicesView';
import { MyAccountView } from '../components/client/MyAccountView';
import { AccountSecurityView } from '../components/client/AccountSecurityView';
import { HomeRedirect, LoginPage } from '../auth/LoginPage';
import { StudioLayout } from '../layouts/StudioLayout';
import { RequireAuth, RequireRole } from './guards';
import { StudioScenarioRoute } from './studio/StudioScenarioRoute';
import { StudioPatternRoute } from './studio/StudioPatternRoute';
import { StudioLayoutRoute } from './studio/StudioLayoutRoute';
import { GameTypesView } from '../components/GameTypesView';
import { MySettingsView } from '../components/client/MySettingsView';
import { ClientStatisticsView } from '../components/client/ClientStatisticsView';
import { MyHelpView } from '../components/client/MyHelpView';
import { MyReleasesView } from '../components/client/MyReleasesView';

// Admin list views (/admin/scenarios etc.) aren't split out yet — Dashboard's
// existing tab state still owns those. Leaving them as placeholder routes for
// bookmarkability until Phase 3b.
function Placeholder({ path }: { path: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <h1 className="text-2xl font-semibold text-slate-200">PLACEHOLDER: {path}</h1>
    </div>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<RequireAuth />}>
        <Route element={<RequireRole role="admin" />}>
          <Route path="/admin/scenarios" element={<Placeholder path="/admin/scenarios" />} />
          <Route path="/admin/patterns" element={<Placeholder path="/admin/patterns" />} />
          <Route path="/admin/*" element={<Dashboard />} />
        </Route>

        <Route element={<RequireRole role="client" />}>
          <Route path="/my" element={<ClientLayout />}>
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<MyHomeView />} />
            <Route path="scenarios" element={<MyScenariosView />} />
            <Route path="scenarios/:uniqid" element={<ScenarioDetailView />} />
            <Route path="patterns" element={<MyPatternsView />} />
            <Route path="cards" element={<MyCardsView />} />
            <Route path="devices" element={<MyDevicesView />} />
            <Route path="releases" element={<MyReleasesView />} />
            <Route path="game-types" element={<GameTypesView />} />
            <Route path="statistics" element={<ClientStatisticsView />} />
            <Route path="settings" element={<MySettingsView />} />
            <Route path="help" element={<MyHelpView />} />
            <Route path="account" element={<MyAccountView />} />
            <Route path="account/security" element={<AccountSecurityView />} />
            <Route path="*" element={<Navigate to="home" replace />} />
          </Route>
        </Route>

        <Route element={<StudioLayout />}>
          <Route path="/studio/scenarios/:uniqid" element={<StudioScenarioRoute />} />
          <Route path="/studio/patterns/:uniqid" element={<StudioPatternRoute />} />
          <Route path="/studio/layouts/:uniqid" element={<StudioLayoutRoute />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
