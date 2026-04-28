import { useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SecureLoginForm } from '../components/SecureLoginForm';
import { useAuth } from './AuthContext';

type LocationState = { from?: { pathname: string } } | null;

export function LoginPage() {
  const { isAuthenticated, userType, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state as LocationState)?.from?.pathname;

  useEffect(() => {
    if (loading || !isAuthenticated) return;
    const target =
      from && from !== '/login'
        ? from
        : userType === 'admin'
          ? '/admin'
          : '/my/scenarios';
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

  return <SecureLoginForm />;
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
  return <Navigate to={userType === 'admin' ? '/admin' : '/my/scenarios'} replace />;
}
