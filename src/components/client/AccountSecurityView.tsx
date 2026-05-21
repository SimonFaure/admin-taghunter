import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { useAuth } from '../../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

export function AccountSecurityView() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogoutEverywhere = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/secure_auth.php?action=logout-all`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success !== true) {
        setError(body?.error || 'Failed to revoke sessions');
        setSubmitting(false);
        return;
      }
      // Clear local auth state, then land on /login with a flash banner.
      // Don't show success on this page — by the time the network call
      // resolves the user is no longer authenticated and the page is
      // about to be replaced.
      await logout();
      navigate('/login', {
        replace: true,
        state: { flash: 'All sessions signed out — please sign in again.' },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to="/my/account"
        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Account
      </Link>

      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-slate-600" />
        <h1 className="text-2xl font-semibold text-slate-900">Security</h1>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-3">
        <h2 className="text-lg font-bold text-slate-900">Authentication</h2>
        <p className="text-sm text-slate-600">
          Your account is secured with one-time password authentication. There's no password to
          change — every sign-in is verified by email code.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Sign out everywhere</h2>
          <p className="text-sm text-slate-600 mt-1">
            Revokes every active session for your account, on every browser and device. You'll be
            signed out of this session too and will need to sign in again.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all text-sm font-medium"
          >
            Sign out everywhere
          </button>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-2 text-sm text-amber-900">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                This will sign you out of this browser too. Continue?
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleLogoutEverywhere}
                disabled={submitting}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  submitting
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-500'
                }`}
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing out…
                  </span>
                ) : (
                  'Yes, sign me out everywhere'
                )}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
