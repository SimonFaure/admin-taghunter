import { useAuth } from '../contexts/AuthContext';
import { LogOut, User as UserIcon, Film, CreditCard, Settings, TrendingUp } from 'lucide-react';
import { useState } from 'react';

export function ClientDashboard() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('account');

  const menuItems = [
    { id: 'account', label: 'My Account', icon: UserIcon },
    { id: 'scenarios', label: 'My Scenarios', icon: Film },
    { id: 'cards', label: 'My Cards', icon: CreditCard },
    { id: 'config', label: 'Game Config', icon: Settings },
    { id: 'statistics', label: 'Statistics', icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 h-full w-64 bg-slate-900 text-white">
        <div className="p-6 border-b border-slate-800">
          <div className="flex flex-col space-y-4">
            <img
              src="/logo_tag_hunter.png"
              alt="Tag Hunter"
              className="h-12 w-auto"
            />
            <h1 className="text-lg font-bold">Client Portal</h1>
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
                <p className="text-sm font-medium truncate">{user?.name || user?.email}</p>
                <p className="text-xs text-slate-400">{user?.company || 'Client'}</p>
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
          </div>

          {activeTab === 'account' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-6">Account Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <p className="text-slate-900">{user?.email}</p>
                </div>
                {user?.name && (
                  <div>
                    <label className="text-sm font-medium text-slate-700">Name</label>
                    <p className="text-slate-900">{user.name}</p>
                  </div>
                )}
                {user?.company && (
                  <div>
                    <label className="text-sm font-medium text-slate-700">Company</label>
                    <p className="text-slate-900">{user.company}</p>
                  </div>
                )}
                {user?.phone && (
                  <div>
                    <label className="text-sm font-medium text-slate-700">Phone</label>
                    <p className="text-slate-900">{user.phone}</p>
                  </div>
                )}
                {user?.license_type && (
                  <div>
                    <label className="text-sm font-medium text-slate-700">License Type</label>
                    <p className="text-slate-900 capitalize">{user.license_type}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'scenarios' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">My Scenarios</h3>
              <p className="text-slate-600">Your scenarios will appear here.</p>
            </div>
          )}

          {activeTab === 'cards' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">My Cards</h3>
              <p className="text-slate-600">Your game cards will appear here.</p>
            </div>
          )}

          {activeTab === 'config' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Game Configuration</h3>
              <p className="text-slate-600">Configure your game settings here.</p>
            </div>
          )}

          {activeTab === 'statistics' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Statistics</h3>
              <p className="text-slate-600">Your game statistics will appear here.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
