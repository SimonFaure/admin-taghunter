import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { Mail, User, Building, Calendar, Crown, CheckCircle, XCircle } from 'lucide-react';

export function MyAccountView() {
  const { user } = useSecureAuth();

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Account Information</h3>

        <div className="space-y-4">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">Name</p>
              <p className="text-base text-slate-900">{user?.name || 'Not set'}</p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-3 bg-emerald-100 rounded-lg">
              <Mail className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">Email</p>
              <p className="text-base text-slate-900">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <Building className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">Client ID</p>
              <p className="text-base text-slate-900 font-mono">{user?.client_id}</p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className={`p-3 rounded-lg ${user?.license_type === 'premium' ? 'bg-purple-100' : 'bg-sky-100'}`}>
              <Crown className={`w-5 h-5 ${user?.license_type === 'premium' ? 'text-purple-600' : 'text-sky-600'}`} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">License Type</p>
              <p className={`text-base font-semibold ${user?.license_type === 'premium' ? 'text-purple-600' : 'text-sky-600'}`}>
                {user?.license_type === 'premium' ? 'Premium' : 'Access'}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className={`p-3 rounded-lg ${user?.billing_up_to_date ? 'bg-green-100' : 'bg-red-100'}`}>
              {user?.billing_up_to_date ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">Payment Status</p>
              <p className={`text-base font-semibold ${user?.billing_up_to_date ? 'text-green-600' : 'text-red-600'}`}>
                {user?.billing_up_to_date ? 'Up to Date' : 'Payment Required'}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="p-3 bg-rose-100 rounded-lg">
              <Calendar className="w-5 h-5 text-rose-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">Member Since</p>
              <p className="text-base text-slate-900">Active</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Security</h3>
        <p className="text-sm text-slate-600 mb-4">
          Your account is secured with one-time password authentication.
        </p>
        <button className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all">
          Update Security Settings
        </button>
      </div>
    </div>
  );
}
