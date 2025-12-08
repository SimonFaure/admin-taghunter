import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { secureAuth } from '../lib/secureAuth';

interface AuthUser {
  client_id: string;
  email: string;
  name?: string;
  token: string;
}

interface SecureAuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  isAuthenticated: boolean;
}

const SecureAuthContext = createContext<SecureAuthContextType | undefined>(undefined);

export function SecureAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = secureAuth.getStoredToken();

    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const result = await secureAuth.validateToken(token);

      if (result.valid && result.client_id) {
        setUser({
          client_id: result.client_id,
          email: result.email || '',
          name: result.name,
          token,
        });
      } else {
        secureAuth.clearToken();
        setUser(null);
      }
    } catch (error) {
      secureAuth.clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, code: string) => {
    try {
      const result = await secureAuth.verifyCode(email, code);

      if (result.error) {
        return { success: false, error: result.error };
      }

      if (result.data) {
        setUser({
          client_id: result.data.client_id,
          email: result.data.email,
          name: result.data.name,
          token: result.data.token,
        });
        return { success: true };
      }

      return { success: false, error: 'Invalid response from server' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      };
    }
  };

  const logout = async () => {
    await secureAuth.logout();
    setUser(null);
  };

  const refreshToken = async () => {
    try {
      const result = await secureAuth.refreshToken();

      if (result.success && result.data) {
        if (user) {
          setUser({
            ...user,
            token: result.data.token,
          });
        }
      } else {
        await logout();
      }
    } catch (error) {
      await logout();
    }
  };

  useEffect(() => {
    if (!user) return;

    const expiry = secureAuth.getTokenExpiry();
    if (!expiry) return;

    const refreshThreshold = 5 * 60 * 1000;
    const timeUntilExpiry = expiry.getTime() - Date.now();

    if (timeUntilExpiry <= refreshThreshold) {
      refreshToken();
      return;
    }

    const timeout = setTimeout(() => {
      refreshToken();
    }, timeUntilExpiry - refreshThreshold);

    return () => clearTimeout(timeout);
  }, [user]);

  return (
    <SecureAuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshToken,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </SecureAuthContext.Provider>
  );
}

export function useSecureAuth() {
  const context = useContext(SecureAuthContext);
  if (context === undefined) {
    throw new Error('useSecureAuth must be used within a SecureAuthProvider');
  }
  return context;
}
