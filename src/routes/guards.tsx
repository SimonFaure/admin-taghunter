import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, UserType } from '../auth/AuthContext';

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white" />
    </div>
  );
}

export function RequireAuth() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}

export function RequireRole({ role }: { role: UserType }) {
  const { userType, loading } = useAuth();
  if (loading) return <Spinner />;
  if (userType !== role) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
