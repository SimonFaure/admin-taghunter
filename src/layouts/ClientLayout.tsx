import { useEffect, useMemo, useState } from 'react';
import {
  LogOut, Home, Film, LayoutGrid, QrCode, Trophy, Gamepad2, BarChart3, FileText, Building2, Ticket, Wallet,
  ShoppingCart, Video, Download, Calculator, HelpCircle, ChevronDown,
} from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { getAppAccess, type AppAccess } from '../auth/appAccess';
import { HelpProvider, studioOpenPdf } from '../help';
import { LicenseeDataProvider, useLicenseeData, type LicenseeData } from './LicenseeDataContext';

// Licensee space chrome (every /my/* page): logo, user card, grouped navigation.
// Design: taghunter-home-redesign/HANDOFF.md. Each entry still declares which
// Client Apps surface it (project_client_app_section); `show(access)` hides it
// otherwise, and a group whose entries are all hidden disappears with its title.

type Badge = (d: LicenseeData) => number | null;

// A single clickable destination.
type NavLeaf = {
  to: string;
  labelKey: string;
  icon: typeof Home;
  end?: boolean;
  show: (a: AppAccess) => boolean;
  badge?: Badge;
};
// A collapsible entry grouping several leaves (Playground, Commandes).
type NavSub = {
  id: string;
  labelKey: string;
  icon: typeof Home;
  defaultOpen: boolean;
  show: (a: AppAccess) => boolean;
  children: Omit<NavLeaf, 'icon'>[];
};
type NavEntry = NavLeaf | NavSub;
// A section title is either translated (titleKey) or a product name that depends
// on the licensee's apps (titleFor, untranslated).
type NavSection = { titleKey: string | null; titleFor?: (a: AppAccess) => string; entries: NavEntry[] };
const isSub = (e: NavEntry): e is NavSub => 'children' in e;

const anyScenarioApp = (a: AppAccess) => a.playground || a.go || a.spot;
const goOrSpot = (a: AppAccess) => a.go || a.spot;
const playground = (a: AppAccess) => a.playground;
const always = () => true;

const NAV: NavSection[] = [
  {
    titleKey: null,
    entries: [
      { to: '/my/home', labelKey: 'nav.home', icon: Home, end: true, show: always },
      { to: '/my/scenarios', labelKey: 'nav.scenarios', icon: Film, show: anyScenarioApp, badge: (d) => (d.loading ? null : d.held.length) },
      // The full product line-up, owned rows marked (read-only browse).
      { to: '/my/catalog', labelKey: 'nav.catalog', icon: LayoutGrid, show: anyScenarioApp, badge: (d) => d.catalogCount },
    ],
  },
  {
    titleKey: 'navGroups.play',
    entries: [
      {
        id: 'playground',
        labelKey: 'nav.playground',
        icon: Gamepad2,
        defaultOpen: true,
        show: playground,
        children: [
          { to: '/my/patterns', labelKey: 'nav.patterns', show: playground },
          { to: '/my/cards', labelKey: 'nav.cards', show: playground },
          { to: '/my/team-names', labelKey: 'nav.teamNames', show: playground },
          { to: '/my/devices', labelKey: 'nav.devices', show: playground },
          { to: '/my/releases', labelKey: 'nav.releases', show: playground },
        ],
      },
    ],
  },
  {
    // Titled after the companion apps the licensee actually has.
    titleKey: null,
    titleFor: (a) => [a.go && 'GO', a.spot && 'SPOT'].filter(Boolean).join(' / '),
    entries: [
      { to: '/my/qr-codes', labelKey: 'nav.qrCodes', icon: QrCode, show: goOrSpot },
      // One merged leaderboards page; RankingsView shows a GO/Spot tab when both are on.
      { to: '/my/rankings', labelKey: 'nav.rankings', icon: Trophy, show: goOrSpot },
    ],
  },
  {
    titleKey: 'navGroups.manage',
    entries: [
      // Playground game stats + GO/Spot usage in one page.
      { to: '/my/statistics', labelKey: 'nav.statistics', icon: BarChart3, show: anyScenarioApp },
      { to: '/my/report-layouts', labelKey: 'nav.reportLayouts', icon: FileText, show: playground },
      // The licensee's own customers (project_licensee_customers), Playground games only.
      { to: '/my/customers', labelKey: 'nav.customers', icon: Building2, show: playground },
      // Events / online ticketing (admin-enabled per licensee).
      { to: '/my/events', labelKey: 'nav.events', icon: Ticket, show: (a) => a.events },
      { to: '/my/payments', labelKey: 'nav.payments', icon: Wallet, show: (a) => a.events },
    ],
  },
  {
    titleKey: 'navGroups.shop',
    entries: [
      // Equipment sale + rental requests; products filtered per app server-side
      // (project_studio_commandes_equipment_orders). The admin can switch ordering
      // off (all or per licensee); past requests then stay under "Mes demandes".
      {
        id: 'orders',
        labelKey: 'nav.orders',
        icon: ShoppingCart,
        defaultOpen: false,
        show: (a) => a.orders || a.ordersHistory,
        children: [
          { to: '/my/orders/equipment', labelKey: 'nav.ordersSale', show: (a) => a.orders },
          { to: '/my/orders/rental', labelKey: 'nav.ordersRent', show: (a) => a.orders },
          { to: '/my/orders/requests', labelKey: 'nav.ordersRequests', show: (a) => a.orders || a.ordersHistory },
        ],
      },
    ],
  },
  {
    titleKey: 'navGroups.resources',
    entries: [
      { to: '/my/game-types', labelKey: 'nav.gameTypes', icon: Video, show: playground },
      // Download-only Tag Hunter default tutorial videos (mp4 + .vtt).
      { to: '/my/tutorial-downloads', labelKey: 'nav.tutorialDownloads', icon: Download, show: playground },
      // Mystery scoring defaults (by age + per scenario), applied by the playground.
      { to: '/my/mystery-scoring', labelKey: 'nav.mysteryScoring', icon: Calculator, show: playground },
      { to: '/my/help', labelKey: 'nav.help', icon: HelpCircle, show: always },
    ],
  },
];
// "Paramètres" (/my/settings) stays hidden from clients (route redirects home);
// "Mon compte" (/my/account) lives in the user card.

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-th-accent-light';
const itemBase = `flex w-full items-center gap-3 min-h-[44px] px-3 rounded-th-sm text-sm text-left transition-colors ${focusRing}`;
const itemClass = ({ isActive }: { isActive: boolean }) =>
  `${itemBase} ${isActive ? 'bg-white/[.09] text-white font-semibold' : 'font-medium text-th-nav-text hover:bg-white/[.06] hover:text-white'}`;
const subClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center min-h-[44px] px-2.5 rounded-lg text-[13.5px] transition-colors ${focusRing} ${
    isActive ? 'bg-white/[.09] text-white font-semibold' : 'text-th-nav-text hover:bg-white/[.06] hover:text-white'
  }`;

const isUnder = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`);

function NavLeafLink({ item }: { item: NavLeaf }) {
  const { t, i18n } = useTranslation('client');
  const data = useLicenseeData();
  const { to, labelKey, icon: Icon, end } = item;
  const count = item.badge?.(data);
  return (
    <NavLink to={to} end={end} className={itemClass}>
      {({ isActive }) => (
        <>
          <Icon className={`h-[18px] w-[18px] flex-none ${isActive ? 'text-th-accent-light' : ''}`} aria-hidden="true" />
          <span className="flex-1 min-w-0">{t(labelKey)}</span>
          {count != null && (
            <span className="rounded-full bg-white/[.08] px-2 py-0.5 text-xs font-medium text-[#C9D0DD]">
              {count.toLocaleString(i18n.language)}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

// A collapsible entry. Opens by itself whenever the current page is one of its
// children, so a deep link never lands on a closed group.
function NavSubSection({ sub, access }: { sub: NavSub; access: AppAccess }) {
  const { t } = useTranslation('client');
  const { pathname } = useLocation();
  const children = sub.children.filter((c) => c.show(access));
  const hasActiveChild = children.some((c) => isUnder(pathname, c.to));
  const [open, setOpen] = useState(sub.defaultOpen || hasActiveChild);
  useEffect(() => {
    if (hasActiveChild) setOpen(true);
  }, [hasActiveChild]);
  const Icon = sub.icon;
  const panelId = `nav-sub-${sub.id}`;

  if (children.length === 0) return null;

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={`${itemBase} font-medium hover:bg-white/[.06] hover:text-white ${hasActiveChild ? 'text-white' : 'text-th-nav-text'}`}
      >
        <Icon className={`h-[18px] w-[18px] flex-none ${hasActiveChild ? 'text-th-accent-light' : ''}`} aria-hidden="true" />
        <span className="flex-1 min-w-0">{t(sub.labelKey)}</span>
        <ChevronDown
          className={`h-4 w-4 flex-none motion-safe:transition-transform motion-safe:duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <div id={panelId} hidden={!open} className="mb-1 ml-[21px] mt-0.5 flex-col border-l border-white/10 pl-3 [&:not([hidden])]:flex">
        {children.map((child) => (
          <NavLink key={child.to} to={child.to} end={child.end} className={subClass}>
            {t(child.labelKey)}
          </NavLink>
        ))}
      </div>
    </>
  );
}

/** Up to two initials from the licensee name (or the e-mail). */
function initialsOf(name: string): string {
  const words = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';
}

function Sidebar({ access }: { access: AppAccess }) {
  const { t } = useTranslation('client');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const displayName = user?.name || user?.email || '';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    // Fixed 248px column from 840px up (sticky, own scroll); below that it takes
    // the full width above the content and scrolls with the page.
    <aside className="flex basis-full flex-col gap-7 bg-th-sidebar px-4 py-6 text-th-nav-text min-[840px]:sticky min-[840px]:top-0 min-[840px]:h-screen min-[840px]:flex-[0_0_248px] min-[840px]:overflow-y-auto print:hidden">
      <div className="flex justify-center px-2">
        <img src="/logo_th_blanc.png" alt="Tag Hunter" className="block h-10 w-auto max-w-full object-contain" />
      </div>

      <div className="-mt-2 rounded-[14px] border border-white/[.08] bg-white/[.05] p-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-th-accent font-th-display text-sm font-bold text-white"
          >
            {initialsOf(displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <span className="line-clamp-2 break-words text-sm font-semibold leading-tight text-white" title={displayName}>{displayName}</span>
            <NavLink
              to="/my/account"
              className={({ isActive }) =>
                // after: grows the touch target to 44px without moving the card layout.
                `relative inline-flex min-h-[24px] items-center rounded text-xs after:absolute after:-inset-x-1 after:-inset-y-[10px] after:content-[''] text-[#C9D0DD] underline underline-offset-2 hover:text-white ${focusRing} ${isActive ? 'font-semibold text-white' : ''}`
              }
            >
              {t('nav.account')}
            </NavLink>
          </div>
          {/* Icon only; the label stays for screen readers and as a tooltip. */}
          <button
            type="button"
            onClick={handleLogout}
            aria-label={t('signOut')}
            title={t('signOut')}
            className={`flex h-11 w-11 flex-none items-center justify-center rounded-th-sm border border-white/[.14] text-[#E2E6EF] transition-colors hover:bg-white/[.06] hover:text-white ${focusRing}`}
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>

      <nav aria-label={t('navLabel')} className="flex flex-1 flex-col gap-5">
        {NAV.map((section, i) => {
          const entries = section.entries.filter((e) => e.show(access));
          if (entries.length === 0) return null;
          const title = section.titleFor ? section.titleFor(access) : section.titleKey ? t(section.titleKey) : null;
          return (
            <div key={i} className="flex flex-col gap-0.5">
              {title && (
                <span className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[.1em] text-th-nav-label">
                  {title}
                </span>
              )}
              {entries.map((entry) =>
                isSub(entry) ? (
                  <NavSubSection key={entry.id} sub={entry} access={access} />
                ) : (
                  <NavLeafLink key={entry.to} item={entry} />
                ),
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export function ClientLayout() {
  const { i18n } = useTranslation('client');
  const { user } = useAuth();
  const navigate = useNavigate();

  const access = useMemo(
    () => getAppAccess(user),
    [user?.playground_enabled, user?.go_enabled, user?.spot_enabled, user?.events_enabled, user?.orders_enabled, user?.orders_history], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Help only shows the chapters of the products enabled on this account (GO, Spot, Playground).
  const helpProducts = useMemo(
    () => (['playground', 'go', 'spot'] as const).filter((p) => access[p]),
    [access],
  );

  return (
    <HelpProvider audience="client" lang={i18n.language} products={helpProducts} navigateToDocs={() => navigate('/my/help')} openPdfFile={studioOpenPdf}>
      <LicenseeDataProvider access={access}>
        <div className="flex min-h-screen flex-wrap bg-th-bg font-th-body text-th-ink print:block print:bg-white">
          <Sidebar access={access} />
          <main className="min-w-0 flex-1 basis-full px-4 pb-10 pt-4 sm:px-6 min-[840px]:basis-0 lg:px-10 lg:pb-14 lg:pt-6 print:p-0">
            <div className="mx-auto max-w-7xl">
              <Outlet />
            </div>
          </main>
        </div>
      </LicenseeDataProvider>
    </HelpProvider>
  );
}
