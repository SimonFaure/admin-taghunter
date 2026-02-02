import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SecureAuthProvider, useSecureAuth } from './contexts/SecureAuthContext';
import { LoginForm } from './components/LoginForm';
import { SecureLoginForm } from './components/SecureLoginForm';
import { Dashboard } from './components/Dashboard';
import { ClientDashboard } from './components/ClientDashboard';
import { useState } from 'react';

function AppContent() {
  const { user: adminUser, loading: adminLoading } = useAuth();
  const { user: clientUser, loading: clientLoading } = useSecureAuth();
  const [loginMode, setLoginMode] = useState<'admin' | 'client'>('admin');

  if (adminLoading || clientLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  if (adminUser) {
    return <Dashboard />;
  }

  if (clientUser) {
    return <ClientDashboard />;
  }

  return loginMode === 'admin' ? (
    <LoginForm onSwitchToClient={() => setLoginMode('client')} />
  ) : (
    <SecureLoginForm onSwitchToAdmin={() => setLoginMode('admin')} />
  );
}

function App() {
  return (
    <AuthProvider>
      <SecureAuthProvider>
        <AppContent />
      </SecureAuthProvider>
    </AuthProvider>
  );
}

export default App;
