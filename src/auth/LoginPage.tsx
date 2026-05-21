import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SecureLoginForm } from '../components/SecureLoginForm';
import { useAuth } from './AuthContext';

type LocationState = { from?: { pathname: string }; flash?: string } | null;

export function LoginPage() {
  const { isAuthenticated, userType, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as LocationState)?.from?.pathname;
  const flash = (location.state as LocationState)?.flash;

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    const target =
      from && from !== '/login'
        ? from
        : userType === 'admin'
          ? '/admin'
          : '/my/home';
    navigate(target, { replace: true });
  }, [loading, isAuthenticated, userType, from, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white" />
      </div>
    );
  }

  if (isAuthenticated) {
    // effect will navigate; render nothing transiently
    return null;
  }

  return (
    <>
      {flash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-lg shadow text-sm">
          {flash}
        </div>
      )}
      <SecureLoginForm />
    </>
  );
}

export function HomeRedirect() {
  const { isAuthenticated, userType, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={userType === 'admin' ? '/admin' : '/my/home'} replace />;
}
