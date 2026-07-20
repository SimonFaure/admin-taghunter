// Compat shim - reads studio's canonical auth storage so ported editor
// components can keep calling `authService.*` unchanged. The real auth flow
// (login, OTP, refresh, logout) lives in src/auth/AuthContext.tsx + src/lib/secureAuth.ts.
// The class keeps the original public surface; dead methods are no-ops that
// return a sensible failure so legacy call sites don't crash.

const TOKEN_KEY = 'auth_token';
const EXPIRY_KEY = 'auth_token_expiry';
const USER_KEY = 'auth_user';

interface PersistedUser {
  user_id: string;
  user_type: 'admin' | 'client';
  email: string;
  name?: string;
  client_id?: string;
}

interface AuthToken {
  token: string;
  expires_at: number;
  email: string;
  client_id: string;
  is_admin: boolean;
  remember_me: boolean;
}

class AuthService {
  getToken(): AuthToken | null {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(EXPIRY_KEY);
    if (!token || !expiry) return null;

    const expiryMs = new Date(expiry).getTime();
    if (!Number.isFinite(expiryMs) || Date.now() >= expiryMs) {
      return null;
    }

    let user: PersistedUser | null = null;
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (raw) user = JSON.parse(raw);
    } catch {
      user = null;
    }

    return {
      token,
      expires_at: Math.floor(expiryMs / 1000),
      email: user?.email ?? '',
      client_id: user?.client_id ?? user?.user_id ?? '',
      is_admin: user?.user_type === 'admin',
      remember_me: false,
    };
  }

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.removeItem(USER_KEY);
  }

  logout(): void {
    this.clearToken();
  }

  getAuthHeaders(): HeadersInit {
    const t = this.getToken();
    // Use X-Auth-Token (what studio's backend expects) instead of Authorization:
    // some Apache setups silently strip the Authorization header before PHP sees it.
    return t ? { 'X-Auth-Token': t.token } : {};
  }

  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }

  getClientId(): string | null {
    return this.getToken()?.client_id || null;
  }

  getEmail(): string | null {
    return this.getToken()?.email || null;
  }

  // The logged-in client's UI language (fr/en/es), read from the persisted
  // auth_user blob. Seeds a new client-authored scenario's default_language.
  getClientLanguage(): string | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      if (!raw) return null;
      const u = JSON.parse(raw) as PersistedUser & { language?: string };
      return typeof u?.language === 'string' ? u.language : null;
    } catch {
      return null;
    }
  }

  isAdmin(): boolean {
    return this.getToken()?.is_admin ?? false;
  }

  // Methods below are kept for source compatibility with ported components,
  // but the real auth flow now lives in studio's AuthContext. These return
  // non-surprising values so ported code never crashes on them.
  async requestCode(_email: string) {
    return { success: false, error: 'requestCode is handled by the host app' };
  }

  async verifyCode(_email: string, _code: string, _rememberMe: boolean = false) {
    return { success: false, error: 'verifyCode is handled by the host app' };
  }

  async validateToken(): Promise<boolean> {
    return this.isAuthenticated();
  }

  saveToken(_t: AuthToken): void {
    // no-op: studio's AuthContext owns writes to localStorage
  }

  setLogoutCallback(_cb: () => void): void {
    // no-op: studio's router handles post-logout redirect
  }

  startTokenMonitoring(): void {
    // no-op: studio's AuthContext handles refresh timing
  }

  stopTokenMonitoring(): void {
    // no-op
  }
}

export const authService = new AuthService();
