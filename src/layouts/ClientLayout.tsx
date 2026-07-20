import { useState } from 'react';
import { LogOut, Home, User, Film, CreditCard, Smartphone, Package, Video, Settings, BarChart3, HelpCircle, Rocket, QrCode, Trophy, Tags, Printer, Gamepad2, ChevronDown } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { getAppAccess, type AppAccess } from '../auth/appAccess';
import { HelpProvider, studioOpenPdf } from '../help';

// A single clickable destination.
type NavLeaf = {
  to: string;
  labelKey: string;
  icon: typeof Home;
  end: boolean;
  show: (a: AppAccess) => boolean;
};
// A collapsible section grouping several leaves under one header (e.g. Playground).
type NavGroup = {
  group: true;
  labelKey: string;
  icon: typeof Home;
  show: (a: AppAccess) => boolean;
  children: NavLeaf[];
};
type NavEntry = NavLeaf | NavGroup;
const isGroup = (e: NavEntry): e is NavGroup => 'group' in e;

// Each entry declares which Client Apps surface it (project_client_app_section).
// `show(access)` returns true when at least one enabling app is on. Home / Account
// / Help are universal chrome (always shown). The Playground-management surfaces
// (patterns, cards, team names, devices, downloads, tutorial videos) are grouped
// under one collapsible "Playground" section. Leaderboards (GO + Drop) are merged
// into one "Rankings" entry; GO/Drop usage stats are merged into the Statistics
// page. Scenarios shows for either group; its content mode is handled inside
// MyScenariosView via getAppAccess().scenariosGoOnly.
const NAV_ITEMS: NavEntry[] = [
  { to: '/my/home', labelKey: 'nav.home', icon: Home, end: true, show: () => true },
  { to: '/my/scenarios', labelKey: 'nav.scenarios', icon: Film, end: false, show: (a) => a.playground || a.go || a.drop },
  { to: '/my/qr-codes', labelKey: 'nav.qrCodes', icon: QrCode, end: false, show: (a) => a.go || a.drop },
  // One merged leaderboards page; RankingsView shows a GO/Drop tab when both are on.
  { to: '/my/rankings', labelKey: 'nav.rankings', icon: Trophy, end: false, show: (a) => a.go || a.drop },
  {
    group: true,
    labelKey: 'nav.playground',
    icon: Gamepad2,
    show: (a) => a.playground,
    children: [
      { to: '/my/patterns', labelKey: 'nav.patterns', icon: Package, end: false, show: (a) => a.playground },
      { to: '/my/cards', labelKey: 'nav.cards', icon: CreditCard, end: false, show: (a) => a.playground },
      { to: '/my/team-names', labelKey: 'nav.teamNames', icon: Tags, end: false, show: (a) => a.playground },
      { to: '/my/devices', labelKey: 'nav.devices', icon: Smartphone, end: false, show: (a) => a.playground },
      { to: '/my/releases', labelKey: 'nav.releases', icon: Rocket, end: false, show: (a) => a.playground },
      { to: '/my/game-types', labelKey: 'nav.gameTypes', icon: Video, end: false, show: (a) => a.playground },
    ],
  },
  { to: '/my/report-layouts', labelKey: 'nav.reportLayouts', icon: Printer, end: false, show: (a) => a.playground },
  // Merged: Playground game stats + GO/Drop usage sections in one page.
  { to: '/my/statistics', labelKey: 'nav.statistics', icon: BarChart3, end: false, show: (a) => a.playground || a.go || a.drop },
  { to: '/my/settings', labelKey: 'nav.settings', icon: Settings, end: false, show: (a) => a.playground },
  { to: '/my/account', labelKey: 'nav.account', icon: User, end: false, show: () => true },
  { to: '/my/help', labelKey: 'nav.help', icon: HelpCircle, end: false, show: () => true },
];

const leafClass = ({ isActive }: { isActive: boolean }) =>
  `w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
    isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
  }`;

function NavLeafLink({ item }: { item: NavLeaf }) {
  const { t } = useTranslation('client');
  const { to, labelKey, icon: Icon, end } = item;
  return (
    <NavLink to={to} end={end} className={leafClass}>
      <Icon className="w-5 h-5" />
      <span className="font-medium">{t(labelKey)}</span>
    </NavLink>
  );
}

// A collapsible section. Starts open when one of its children is the active route
// so a deep link never lands the user on a collapsed group.
function NavGroupSection({ group, access }: { group: NavGroup; access: AppAccess }) {
  const { t } = useTranslation('client');
  const location = useLocation();
  const children = group.children.filter((c) => c.show(access));
  const hasActiveChild = children.some((c) => location.pathname.startsWith(c.to));
  const [open, setOpen] = useState(hasActiveChild);
  const Icon = group.icon;

  if (children.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-slate-400 hover:bg-slate-800/50 hover:text-white transition-all"
      >
        <span className="flex items-center space-x-3">
          <Icon className="w-5 h-5" />
          <span className="font-medium">{t(group.labelKey)}</span>
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="mt-1 ml-4 space-y-1 border-l border-slate-800 pl-2">
          {children.map((child) => (
            <NavLeafLink key={child.to} item={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ClientLayout() {
  const { t, i18n } = useTranslation('client');
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const access = getAppAccess(user);
  const navItems = NAV_ITEMS.filter((item) => item.show(access));

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <HelpProvider audience="client" lang={i18n.language} navigateToDocs={() => navigate('/my/help')} openPdfFile={studioOpenPdf}>
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 border-b border-slate-800 flex-shrink-0">
          <div className="flex flex-col space-y-4">
            <img
              src="/logo_th_blanc.png"
              alt="Tag Hunter"
              className="h-12 w-auto object-contain max-w-full"
            />
            <h1 className="text-lg font-bold">{t('portal')}</h1>
          </div>
        </div>

        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {navItems.map((item) =>
            isGroup(item) ? (
              <NavGroupSection key={item.labelKey} group={item} access={access} />
            ) : (
              <NavLeafLink key={item.to} item={item} />
            ),
          )}
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
