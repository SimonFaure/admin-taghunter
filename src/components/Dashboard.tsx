import { useAuth } from '../contexts/AuthContext';
import { LogOut, Home, Users, Settings, FileText, Code, Film, TrendingUp, Image, Shield, Activity, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ClientsView } from './ClientsView';
import { ClientDetailView } from './ClientDetailView';
import LogsView from './LogsView';
import ApiDocsView from './ApiDocsView';
import { NotificationsList } from './NotificationsList';
import { ScenariosView } from './ScenariosView';
import { StatisticsView } from './StatisticsView';
import { SettingsView } from './SettingsView';
import { MediaView } from './MediaView';
import { AdminUsersView } from './AdminUsersView';
import { dashboardApi, DashboardStats, DashboardActivity } from '../lib/api';

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<DashboardActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const handleNotificationClick = (clientId: string) => {
    setSelectedClientId(clientId);
    setActiveTab('clients');
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

  const menuItems = [
    { id: 'home', label: 'Dashboard', icon: Home },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'scenarios', label: 'Scenarios', icon: Film },
    { id: 'media', label: 'Media', icon: Image },
    { id: 'statistics', label: 'Statistics', icon: TrendingUp },
    { id: 'admin-users', label: 'Admin Users', icon: Shield },
    { id: 'logs', label: 'API Logs', icon: FileText },
    { id: 'api-docs', label: 'API Docs', icon: Code },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 text-white">
        <div className="p-6 border-b border-slate-800">
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <img
                src="/logo_tag_hunter.png"
                alt="Tag Hunter"
                className="h-12 w-auto object-contain max-w-full"
              />
              <NotificationsList onNotificationClick={handleNotificationClick} />
            </div>
            <h1 className="text-lg font-bold">Admin Dashboard</h1>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
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
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800">
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
              {menuItems.find((item) => item.id === activeTab)?.label}
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

          {activeTab === 'media' && <MediaView />}

          {activeTab === 'statistics' && <StatisticsView />}

          {activeTab === 'admin-users' && <AdminUsersView />}

          {activeTab === 'logs' && <LogsView />}

          {activeTab === 'api-docs' && <ApiDocsView />}

          {activeTab === 'settings' && <SettingsView />}

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
              <h3 className="text-lg font-bold text-slate-900 mb-4">Recent Activity</h3>
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
  );
}
