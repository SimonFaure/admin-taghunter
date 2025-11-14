import { useAuth } from '../contexts/AuthContext';
import { LogOut, Home, Users, Tag, Settings, BarChart3, Package, FileText } from 'lucide-react';
import { useState } from 'react';
import { ClientsView } from './ClientsView';
import { ClientDetailView } from './ClientDetailView';
import LogsView from './LogsView';

export function Dashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const menuItems = [
    { id: 'home', label: 'Dashboard', icon: Home },
    { id: 'tags', label: 'Tags', icon: Tag },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'clients', label: 'Clients', icon: Users },
    { id: 'logs', label: 'API Logs', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 text-white">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-slate-800 rounded-lg">
              <Tag className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold">Admin Taghunter</h1>
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

          {activeTab === 'logs' && <LogsView />}

          {activeTab === 'home' && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Tag className="w-6 h-6 text-blue-600" />
                </div>
                <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  +12.5%
                </span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">1,234</h3>
              <p className="text-sm text-slate-600">Total Tags</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-emerald-100 rounded-lg">
                  <Package className="w-6 h-6 text-emerald-600" />
                </div>
                <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  +8.2%
                </span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">567</h3>
              <p className="text-sm text-slate-600">Products</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <Users className="w-6 h-6 text-amber-600" />
                </div>
                <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  +15.3%
                </span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">89</h3>
              <p className="text-sm text-slate-600">Clients</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-rose-100 rounded-lg">
                  <BarChart3 className="w-6 h-6 text-rose-600" />
                </div>
                <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  +23.1%
                </span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">4,567</h3>
              <p className="text-sm text-slate-600">Total Scans</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Recent Activity</h3>
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center space-x-4 pb-4 border-b border-slate-100 last:border-0">
                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                      <Tag className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        Tag scanned successfully
                      </p>
                      <p className="text-xs text-slate-500">Product ID: #TAG{1000 + i}</p>
                    </div>
                    <span className="text-xs text-slate-500">{i}h ago</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-4">
                <button className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all text-left">
                  <Tag className="w-6 h-6 text-slate-900 mb-2" />
                  <p className="text-sm font-medium text-slate-900">Create Tag</p>
                  <p className="text-xs text-slate-500">Generate new tag</p>
                </button>
                <button className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all text-left">
                  <Package className="w-6 h-6 text-slate-900 mb-2" />
                  <p className="text-sm font-medium text-slate-900">Add Product</p>
                  <p className="text-xs text-slate-500">New product entry</p>
                </button>
                <button className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all text-left">
                  <BarChart3 className="w-6 h-6 text-slate-900 mb-2" />
                  <p className="text-sm font-medium text-slate-900">View Reports</p>
                  <p className="text-xs text-slate-500">Analytics data</p>
                </button>
                <button
                  onClick={() => setActiveTab('clients')}
                  className="p-4 bg-slate-50 hover:bg-slate-100 rounded-lg transition-all text-left"
                >
                  <Users className="w-6 h-6 text-slate-900 mb-2" />
                  <p className="text-sm font-medium text-slate-900">Manage Clients</p>
                  <p className="text-xs text-slate-500">Client management</p>
                </button>
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      </main>
    </div>
  );
}
