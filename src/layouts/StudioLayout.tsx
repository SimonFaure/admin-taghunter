import { ArrowLeft, LogOut } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function StudioLayout() {
  const { userType, logout } = useAuth();
  const navigate = useNavigate();
  const backTarget = userType === 'admin' ? '/admin' : '/my/scenarios';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="flex items-center gap-3 border-b border-slate-800 px-4 py-3">
        <button
          type="button"
          onClick={() => navigate(backTarget)}
          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <span className="text-sm text-slate-400">Studio</span>
        <button
          type="button"
          onClick={handleLogout}
          className="ml-auto inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <LogOut size={16} />
          Log out
        </button>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
