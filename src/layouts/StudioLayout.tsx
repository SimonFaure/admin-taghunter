import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { HelpProvider, studioOpenPdf } from '../help';

// The studio editor routes (scenario / pattern / layout) each render their own
// in-editor "Back" control, so this layout intentionally has no top nav bar —
// it only provides the shared dark backdrop. Log out lives on the main app pages.
//
// Reached by both admins (from the Dashboard) and clients (from /my). We wrap
// the layout in HelpProvider so HelpButton/HelpDot used inside the editor
// (ScenarioHeader, TypographySection, TextStringsSection, PatternCorrespondence)
// resolve a context. `navigateToDocs` sends each role back to its own help surface.
export function StudioLayout() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const audience = user?.user_type === 'admin' ? 'admin' : 'client';
  const navigateToDocs = () => {
    if (user?.user_type === 'admin') navigate('/admin', { state: { tab: 'help' } });
    else navigate('/my/help');
  };
  return (
    <HelpProvider audience={audience} navigateToDocs={navigateToDocs} openPdfFile={studioOpenPdf}>
      <div className="min-h-screen bg-slate-900 text-white">
        <main>
          <Outlet />
        </main>
      </div>
    </HelpProvider>
  );
}
