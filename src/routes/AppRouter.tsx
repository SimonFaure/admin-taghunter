import { Navigate, Route, Routes } from 'react-router-dom';
import { Dashboard } from '../components/Dashboard';
import { ClientDashboard } from '../components/ClientDashboard';
import { MyScenariosView } from '../components/client/MyScenariosView';
import { MyPatternsView } from '../components/client/MyPatternsView';
import { MyLayoutsView } from '../components/client/MyLayoutsView';
import { HomeRedirect, LoginPage } from '../auth/LoginPage';
import { StudioLayout } from '../layouts/StudioLayout';
import { RequireAuth, RequireRole } from './guards';
import { StudioScenarioRoute } from './studio/StudioScenarioRoute';
import { StudioPatternRoute } from './studio/StudioPatternRoute';
import { StudioLayoutRoute } from './studio/StudioLayoutRoute';

// MyScenariosView's existing signature expects an onSelectScenario handler.
// For the list-at-URL mount we wire selection to navigate into the studio editor.
import { useNavigate } from 'react-router-dom';

function MyScenariosPage() {
  const navigate = useNavigate();
  return (
    <MyScenariosView
      onSelectScenario={(s: any) => {
        if (s?.uniqid) navigate(`/studio/scenarios/${s.uniqid}`);
      }}
    />
  );
}

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
          <Route path="/admin/layouts" element={<Placeholder path="/admin/layouts" />} />
          <Route path="/admin/*" element={<Dashboard />} />
        </Route>

        <Route element={<RequireRole role="client" />}>
          <Route path="/my/scenarios" element={<MyScenariosPage />} />
          <Route path="/my/patterns" element={<MyPatternsView />} />
          <Route path="/my/layouts" element={<MyLayoutsView />} />
          <Route path="/my/*" element={<ClientDashboard />} />
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
