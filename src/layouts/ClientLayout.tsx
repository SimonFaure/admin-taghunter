import { LogOut, Home, User, Film, CreditCard, Smartphone, Package, Video, Settings, BarChart3, HelpCircle, Rocket } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { HelpProvider, studioOpenPdf } from '../help';

const NAV_ITEMS = [
  { to: '/my/home', labelKey: 'nav.home', icon: Home, end: true },
  { to: '/my/scenarios', labelKey: 'nav.scenarios', icon: Film, end: false },
  { to: '/my/patterns', labelKey: 'nav.patterns', icon: Package, end: false },
  { to: '/my/cards', labelKey: 'nav.cards', icon: CreditCard, end: false },
  { to: '/my/devices', labelKey: 'nav.devices', icon: Smartphone, end: false },
  { to: '/my/releases', labelKey: 'nav.releases', icon: Rocket, end: false },
  { to: '/my/game-types', labelKey: 'nav.gameTypes', icon: Video, end: false },
  { to: '/my/statistics', labelKey: 'nav.statistics', icon: BarChart3, end: false },
  { to: '/my/settings', labelKey: 'nav.settings', icon: Settings, end: false },
  { to: '/my/account', labelKey: 'nav.account', icon: User, end: false },
  { to: '/my/help', labelKey: 'nav.help', icon: HelpCircle, end: false },
];

export function ClientLayout() {
  const { t } = useTranslation('client');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <HelpProvider audience="client" navigateToDocs={() => navigate('/my/help')} openPdfFile={studioOpenPdf}>
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 border-b border-slate-800 flex-shrink-0">
          <div className="flex flex-col space-y-4">
            <img
              src="/logo_tag_hunter.png"
              alt="Tag Hunter"
              className="h-12 w-auto object-contain max-w-full"
            />
            <h1 className="text-lg font-bold">{t('portal')}</h1>
          </div>
        </div>

        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, labelKey, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center">
                <span className="text-sm font-semibold">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
                <p className="text-xs text-slate-400">{t('role')}</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">{t('signOut')}</span>
          </button>
        </div>
      </aside>

      <main className="ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
    </HelpProvider>
  );
}
