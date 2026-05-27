import { Outlet } from 'react-router-dom';

// The studio editor routes (scenario / pattern / layout) each render their own
// in-editor "Back" control, so this layout intentionally has no top nav bar —
// it only provides the shared dark backdrop. Log out lives on the main app pages.
export function StudioLayout() {
  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <main>
        <Outlet />
      </main>
    </div>
  );
}
