import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { Film, CreditCard, TrendingUp, Settings } from 'lucide-react';

export function ClientHomeView() {
  const { user } = useSecureAuth();

  return (
    <div>
      <div className="mb-8">
        <h3 className="text-xl font-semibold text-slate-900 mb-2">
          Welcome back, {user?.name || 'Client'}!
        </h3>
        <p className="text-slate-600">
          Here's an overview of your Tag Hunter account.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Film className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-1">0</h3>
          <p className="text-sm text-slate-600">Active Scenarios</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-100 rounded-lg">
              <CreditCard className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-1">0</h3>
          <p className="text-sm text-slate-600">Total Cards</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-1">0</h3>
          <p className="text-sm text-slate-600">Games Played</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-rose-100 rounded-lg">
              <Settings className="w-6 h-6 text-rose-600" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-slate-900 mb-1">Ready</h3>
          <p className="text-sm text-slate-600">Config Status</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <Film className="w-6 h-6 text-slate-900 mb-2" />
            <p className="text-sm font-medium text-slate-900">View Scenarios</p>
            <p className="text-xs text-slate-500">Browse your game scenarios</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <CreditCard className="w-6 h-6 text-slate-900 mb-2" />
            <p className="text-sm font-medium text-slate-900">Manage Cards</p>
            <p className="text-xs text-slate-500">View and organize cards</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <Settings className="w-6 h-6 text-slate-900 mb-2" />
            <p className="text-sm font-medium text-slate-900">Game Config</p>
            <p className="text-xs text-slate-500">Adjust game settings</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <TrendingUp className="w-6 h-6 text-slate-900 mb-2" />
            <p className="text-sm font-medium text-slate-900">View Stats</p>
            <p className="text-xs text-slate-500">Check your performance</p>
          </div>
        </div>
      </div>
    </div>
  );
}
