import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { phpAuthApi, User } from '../lib/api';
import { supabaseAuthApi, AdminUser } from '../lib/supabaseAuth';

interface AuthContextType {
  user: User | AdminUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const authMode = import.meta.env.VITE_AUTH_MODE || 'supabase';
const authApi = authMode === 'php' ? phpAuthApi : supabaseAuthApi;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();

    if (authMode === 'supabase') {
      const { data: { subscription } } = supabaseAuthApi.onAuthStateChange((user) => {
        setUser(user);
      });

      return () => {
        subscription?.unsubscribe();
      };
    }
  }, []);

  const checkAuthStatus = async () => {
    const { data, error } = await authApi.checkAuth();
    if (!error && data) {
      setUser(data.user);
    }
    setLoading(false);
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await authApi.login(email, password);
    if (!error && data) {
      setUser(data.user);
    }
    return { error };
  };

  const signOut = async () => {
    await authApi.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
