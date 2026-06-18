import { useAuth } from '../contexts/AuthContext';
import { LogOut, Home, Users, Settings, FileText, Code, Film, TrendingUp, Image, Shield, Activity, Package, Clock, CreditCard, Monitor, AlertTriangle, Languages, Rocket, Terminal, ChevronDown, ChevronRight, Video, FolderOpen, HelpCircle, Printer, Tags, LayoutGrid, FlaskConical } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ClientsView } from './ClientsView';
import { ClientDetailView } from './ClientDetailView';
import LogsView from './LogsView';
import ApiDocsView from './ApiDocsView';
import { AdminNotificationsList } from './AdminNotificationsList';
import { ScenariosView } from './ScenariosView';
import { ScenarioCatalogView } from './ScenarioCatalogView';
import { StatisticsView } from './StatisticsView';
import { SettingsView } from './SettingsView';
import { MediaView } from './MediaView';
import { AdminUsersView } from './AdminUsersView';
import { PatternsView } from './PatternsView';
import { ActivityHistoryView } from './ActivityHistoryView';
import { CardsListView } from './CardsListView';
import { TeamNamesView } from './TeamNamesView';
import { ReportLayoutsView } from './ReportLayoutsView';
import { DevicesView } from './DevicesView';
import { RecentErrorsView } from './RecentErrorsView';
import { GameTypesView } from './GameTypesView';
import { ReleasesView } from './ReleasesView';
import { TestersView } from './TestersView';
import AdminTranslationsView from './admin/AdminTranslationsView';
import { dashboardApi, DashboardStats, DashboardActivity } from '../lib/api';
import { HelpProvider, DocsShell, studioOpenPdf } from '../help';

type MenuItem = { id: string; label: string; icon: typeof Home; route?: string };
type NavGroup = { id: string; label: string; icon: typeof Home; items: MenuItem[]; storageKey: string };

// Top-level nav entries (day-to-day content management).
const mainMenuItems: MenuItem[] = [
  { id: 'home', label: 'Dashboard', icon: Home },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'scenarios', label: 'Scenarios', icon: Film },
  { id: 'catalog', label: 'Catalog', icon: LayoutGrid },
  { id: 'patterns', label: 'Patterns', icon: Package },
  { id: 'cards', label: 'Cards', icon: CreditCard },
  { id: 'team-names', label: 'Team Names', icon: Tags },
  { id: 'report-layouts', label: 'Report Layouts', icon: Printer },
  { id: 'devices', label: 'Devices', icon: Monitor },
  { id: 'statistics', label: 'Statistics', icon: TrendingUp },
  { id: 'admin-users', label: 'Admin Users', icon: Shield },
  { id: 'translations', label: 'Translations', icon: Languages },
  { id: 'help', label: 'Help', icon: HelpCircle },
];

// Media assets, grouped under the collapsible "Media" section.
const mediaMenuItems: MenuItem[] = [
  { id: 'media', label: 'Library', icon: Image },
  { id: 'game-types', label: 'Videos', icon: Video },
];

// Developer / operations tools, grouped under the collapsible "Dev" section.
const devMenuItems: MenuItem[] = [
  { id: 'logs', label: 'API Logs', icon: FileText },
  { id: 'api-docs', label: 'Docs', icon: Code },
  { id: 'activity-history', label: 'Activity History', icon: Clock },
  { id: 'recent-errors', label: 'Recent Errors', icon: AlertTriangle },
  { id: 'releases', label: 'Releases', icon: Rocket },
  { id: 'testers', label: 'Testers', icon: FlaskConical },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// Collapsible nav sections, rendered after the top-level entries.
const navGroups: NavGroup[] = [
  { id: 'media', label: 'Media', icon: FolderOpen, items: mediaMenuItems, storageKey: 'studioMediaNavOpen' },
  { id: 'dev', label: 'Dev', icon: Terminal, items: devMenuItems, storageKey: 'studioDevNavOpen' },
];

const allMenuItems: MenuItem[] = [...mainMenuItems, ...mediaMenuItems, ...devMenuItems];

export function Dashboard() {
  const { user, signOut } = useAuth();
  // Allow callers to land on a specific tab via `navigate('/admin', { state: { tab } })`.
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = (location.state as { tab?: string } | null)?.tab ?? 'home';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const state: Record<string, boolean> = {};
    for (const group of navGroups) {
      const saved = localStorage.getItem(group.storageKey);
      // Default: expanded when landing directly on one of the group's tabs.
      state[group.id] = saved !== null ? saved === '1' : group.items.some((item) => item.id === initialTab);
    }
    return state;
  });

  const toggleGroup = (group: NavGroup) => {
    setOpenGroups((prev) => {
      const next = !prev[group.id];
      localStorage.setItem(group.storageKey, next ? '1' : '0');
      return { ...prev, [group.id]: next };
    });
  };
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<DashboardActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const handleNotificationNavigate = (tab: string) => {
    setActiveTab(tab);
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const [statsResponse, activitiesResponse] = await Promise.all([
          dashboardApi.getStats(),
          dashboardApi.getRecentActivity(4),
        ]);

        if (statsResponse.data) {
          setStats(statsResponse.data);
        }

        if (activitiesResponse.data) {
          setActivities(activitiesResponse.data.activities);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (activeTab === 'home') {
      fetchDashboardData();
    }
  }, [activeTab]);

  // Keep a collapsible group expanded whenever the active tab lives inside it,
  // so navigating there from elsewhere (quick actions, notifications) reveals it.
  useEffect(() => {
    const group = navGroups.find((g) => g.items.some((item) => item.id === activeTab));
    if (!group) return;
    setOpenGroups((prev) => (prev[group.id] ? prev : { ...prev, [group.id]: true }));
  }, [activeTab]);

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const renderMenuButton = (item: MenuItem) => {
    const Icon = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => {
          if (item.route) {
            navigate(item.route);
            return;
          }
          setActiveTab(item.id);
        }}
        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
          activeTab === item.id
            ? 'bg-slate-800 text-white'
            : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
        }`}
      >
        <Icon className="w-5 h-5" />
        <span className="font-medium">{item.label}</span>
      </button>
    );
  };

  const renderCollapsibleGroup = (group: NavGroup) => {
    const GroupIcon = group.icon;
    const open = openGroups[group.id];
    const groupActive = group.items.some((item) => item.id === activeTab);
    return (
      <div key={group.id} className="pt-2">
        <button
          onClick={() => toggleGroup(group)}
          aria-expanded={open}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
            groupActive && !open
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
          }`}
        >
          <span className="flex items-center space-x-3">
            <GroupIcon className="w-5 h-5" />
            <span className="font-medium">{group.label}</span>
          </span>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {open && (
          <div className="mt-2 ml-3 pl-3 border-l border-slate-800 space-y-2">
            {group.items.map(renderMenuButton)}
          </div>
        )}
      </div>
    );
  };

  return (
    <HelpProvider audience="admin" navigateToDocs={() => setActiveTab('help')} openPdfFile={studioOpenPdf}>
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 text-white flex flex-col z-40">
        <div className="p-6 border-b border-slate-800 flex-shrink-0">
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <img
                src="/logo_tag_hunter.png"
                alt="Tag Hunter"
                className="h-12 w-auto object-contain max-w-full"
              />
              <AdminNotificationsList onNavigate={handleNotificationNavigate} />
            </div>
            <h1 className="text-lg font-bold">Admin Dashboard</h1>
          </div>
        </div>

        <nav className="p-4 space-y-2 flex-1 overflow-y-auto">
          {mainMenuItems.map(renderMenuButton)}
          {navGroups.map(renderCollapsibleGroup)}
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
                <p className="text-sm font-medium truncate">{user?.email}</p>
                <p className="text-xs text-slate-400">Administrator</p>
              </div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      <main className="ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {allMenuItems.find((item) => item.id === activeTab)?.label}
            </h2>
            <p className="text-slate-600">
              {activeTab === 'home' ? "Welcome back! Here's what's happening today." : ''}
            </p>
          </div>

          {activeTab === 'clients' && (
            selectedClientId ? (
              <ClientDetailView
                clientId={selectedClientId}
                onBack={() => setSelectedClientId(null)}
              />
            ) : (
              <ClientsView onViewClient={(id) => setSelectedClientId(id)} />
            )
          )}

          {activeTab === 'scenarios' && <ScenariosView />}

          {activeTab === 'catalog' && <ScenarioCatalogView />}

          {activeTab === 'patterns' && <PatternsView />}

          {activeTab === 'cards' && <CardsListView />}

          {activeTab === 'team-names' && <TeamNamesView />}

          {activeTab === 'report-layouts' && <ReportLayoutsView />}

          {activeTab === 'media' && <MediaView />}

          {activeTab === 'devices' && <DevicesView />}

          {activeTab === 'releases' && <ReleasesView />}

          {activeTab === 'testers' && <TestersView />}

          {activeTab === 'recent-errors' && <RecentErrorsView />}

          {activeTab === 'statistics' && <StatisticsView />}

          {activeTab === 'activity-history' && <ActivityHistoryView />}

          {activeTab === 'admin-users' && <AdminUsersView />}

          {activeTab === 'logs' && <LogsView />}

          {activeTab === 'api-docs' && <ApiDocsView onNavigate={setActiveTab} />}

          {activeTab === 'help' && (
            <div className="h-[calc(100vh-220px)] overflow-hidden rounded-xl border border-slate-200 bg-white">
              <DocsShell />
            </div>
          )}

          {activeTab === 'settings' && <SettingsView />}

          {activeTab === 'game-types' && <GameTypesView />}

          {activeTab === 'translations' && <AdminTranslationsView />}

          {activeTab === 'home' && (
          <>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
            </div>
          ) : (
            <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                  Active
                </span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats?.clients || 0}</h3>
              <p className="text-sm text-slate-600">Total Clients</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-emerald-100 rounded-lg">
                  <Film className="w-6 h-6 text-emerald-600" />
                </div>
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
                  Live
                </span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats?.scenarios || 0}</h3>
              <p className="text-sm text-slate-600">Scenarios</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <Image className="w-6 h-6 text-amber-600" />
                </div>
                <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-1 rounded-full">
                  Storage
                </span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats?.storage.formatted || '0B'}</h3>
              <p className="text-sm text-slate-600">Media Files</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-rose-100 rounded-lg">
                  <Activity className="w-6 h-6 text-rose-600" />
                </div>
                {stats?.api_requests.percent_change !== undefined && (
                  <span className={`text-xs font-semibold ${
                    stats.api_requests.percent_change >= 0 ? 'text-green-600 bg-green-100' : 'text-red-600 bg-red-100'
                  } px-2 py-1 rounded-full`}>
                    {stats.api_requests.percent_change >= 0 ? '+' : ''}{stats.api_requests.percent_change}%
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">{stats?.api_requests.total.toLocaleString() || 0}</h3>
              <p className="text-sm text-slate-600">API Requests</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-900">Recent Activity</h3>
                <button
                  onClick={() => setActiveTab('activity-history')}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1 transition-colors"
                >
                  <span>Show History</span>
                  <Clock className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4">
                {activities.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No recent activity</p>
                ) : (
                  activities.map((item, i) => {
                    const IconComponent = item.icon === 'Users' ? Users :
                                        item.icon === 'Film' ? Film :
                                        item.icon === 'Image' ? Image :
                                        Activity;
                    return (
                      <div key={i} className="flex items-center space-x-4 pb-4 border-b border-slate-100 last:border-0">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                          <IconComponent className="w-5 h-5 text-slate-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {item.title}
                          </p>
                          <p className="text-xs text-slate-500">{item.detail}</p>
                        </div>
                        <span className="text-xs text-slate-500">{formatTimeAgo(item.time)}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setActiveTab('clients')}
                  className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all text-left"
                >
                  <Users className="w-6 h-6 text-slate-900 mb-2" />
                  <p className="text-sm font-medium text-slate-900">Manage Clients</p>
                  <p className="text-xs text-slate-500">View all clients</p>
                </button>
                <button
                  onClick={() => setActiveTab('scenarios')}
                  className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all text-left"
                >
                  <Film className="w-6 h-6 text-slate-900 mb-2" />
                  <p className="text-sm font-medium text-slate-900">Add Scenario</p>
                  <p className="text-xs text-slate-500">Create new scenario</p>
                </button>
                <button
                  onClick={() => setActiveTab('media')}
                  className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all text-left"
                >
                  <Image className="w-6 h-6 text-slate-900 mb-2" />
                  <p className="text-sm font-medium text-slate-900">Upload Media</p>
                  <p className="text-xs text-slate-500">Add media files</p>
                </button>
                <button
                  onClick={() => setActiveTab('statistics')}
                  className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all text-left"
                >
                  <TrendingUp className="w-6 h-6 text-slate-900 mb-2" />
                  <p className="text-sm font-medium text-slate-900">View Statistics</p>
                  <p className="text-xs text-slate-500">Analytics dashboard</p>
                </button>
              </div>
            </div>
          </div>
          </>
          )}
          </>
          )}
        </div>
      </main>
    </div>
    </HelpProvider>
  );
}
