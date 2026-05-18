import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { secureAuth } from '../lib/secureAuth';

const USER_STORAGE_KEY = 'auth_user';

function persistUser(user: AuthUser | null): void {
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

export type UserType = 'admin' | 'client';

export interface AuthUser {
  user_id: string;
  user_type: UserType;
  email: string;
  name?: string;
  token: string;
  client_id?: string;
  license_type?: 'access' | 'premium';
  billing_up_to_date?: boolean;
  created_at?: string;
  avatar_url?: string;
  company_logo_url?: string | null;
  company_logo_uses_avatar?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  userType: UserType | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    code: string,
    rememberMe?: boolean,
    directData?: any
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  updateUserAvatar: (avatarUrl: string) => void;
  updateCompanyLogo: (logoUrl: string | null) => void;
  updateLogoPreference: (useAvatar: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function buildUserFromPayload(payload: any, fallbackToken: string): AuthUser {
  const userId = payload.user_id || payload.client_id;
  const userType: UserType = payload.user_type || (payload.client_id ? 'client' : 'admin');
  return {
    user_id: userId,
    user_type: userType,
    email: payload.email || '',
    name: payload.name,
    token: payload.token || fallbackToken,
    client_id: payload.client_id || (userType === 'client' ? userId : undefined),
    license_type: payload.license_type,
    billing_up_to_date: payload.billing_up_to_date,
    created_at: payload.created_at,
    avatar_url: payload.avatar_url,
    company_logo_url: payload.company_logo_url ?? null,
    company_logo_uses_avatar:
      payload.company_logo_uses_avatar === undefined ? true : !!payload.company_logo_uses_avatar,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
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
      // secure_auth.php?action=validate returns a flat payload ({valid, user_id, ...})
      // rather than the {data: {...}} envelope used by verify-code. Treat as flat.
      const result = (await secureAuth.validateToken(token)) as any;
      if (result?.valid && result.user_id) {
        const built = buildUserFromPayload(result, token);
        persistUser(built);
        setUser(built);
      } else {
        secureAuth.clearToken();
        persistUser(null);
        setUser(null);
      }
    } catch {
      secureAuth.clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login: AuthContextType['login'] = async (email, code, rememberMe = false, directData) => {
    try {
      let payload: any;
      if (directData) {
        payload = directData;
      } else {
        const result = await secureAuth.verifyCode(email, code, rememberMe);
        if (result.error) return { success: false, error: result.error };
        if (!result.data) return { success: false, error: 'Invalid response from server' };
        payload = result.data;
      }
      const built = buildUserFromPayload(payload, secureAuth.getStoredToken() || '');
      persistUser(built);
      setUser(built);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Login failed',
      };
    }
  };

  const logout = async () => {
    await secureAuth.logout();
    persistUser(null);
    setUser(null);
  };

  const refreshToken = async () => {
    try {
      const result = await secureAuth.refreshToken();
      if (result.success && result.data && user) {
        setUser({ ...user, token: result.data.token });
      } else {
        await logout();
      }
    } catch {
      await logout();
    }
  };

  const updateUserAvatar = (avatarUrl: string) => {
    if (user) setUser({ ...user, avatar_url: avatarUrl });
  };

  const updateCompanyLogo = (logoUrl: string | null) => {
    if (user) setUser({ ...user, company_logo_url: logoUrl });
  };

  const updateLogoPreference = (useAvatar: boolean) => {
    if (user) setUser({ ...user, company_logo_uses_avatar: useAvatar });
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
    const timeout = setTimeout(() => refreshToken(), timeUntilExpiry - refreshThreshold);
    return () => clearTimeout(timeout);
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        userType: user?.user_type ?? null,
        token: user?.token ?? null,
        loading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshToken,
        updateUserAvatar,
        updateCompanyLogo,
        updateLogoPreference,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
