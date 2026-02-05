import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { secureAuth } from '../lib/secureAuth';

interface AuthUser {
  client_id: string;
  email: string;
  name?: string;
  token: string;
  license_type?: 'access' | 'premium';
  billing_up_to_date?: boolean;
}

interface SecureAuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, code: string, rememberMe?: boolean, directData?: any) => Promise<{ success: boolean; error?: string }>;
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
          license_type: result.license_type,
          billing_up_to_date: result.billing_up_to_date,
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

  const login = async (email: string, code: string, rememberMe: boolean = false, directData?: any) => {
    try {
      let userData;

      if (directData) {
        userData = directData;
      } else {
        const result = await secureAuth.verifyCode(email, code, rememberMe);

        if (result.error) {
          return { success: false, error: result.error };
        }

        if (!result.data) {
          return { success: false, error: 'Invalid response from server' };
        }

        userData = result.data;
      }

      setUser({
        client_id: userData.user_id || userData.client_id,
        email: userData.email,
        name: userData.name,
        token: userData.token || secureAuth.getStoredToken() || '',
        license_type: userData.license_type,
        billing_up_to_date: userData.billing_up_to_date,
      });

      return { success: true };
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
