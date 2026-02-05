interface ApiResponse<T> {
  data?: T;
  error?: string;
  success?: boolean;
  message?: string;
}

interface TokenData {
  token: string;
  expires_at: string;
  client_id: string;
  email: string;
  name?: string;
}

interface ValidationData {
  valid: boolean;
  client_id?: string;
  email?: string;
  name?: string;
  expires_at?: string;
  error?: string;
}

const API_BASE_URL = '/backend/api';
const TOKEN_STORAGE_KEY = 'auth_token';
const TOKEN_EXPIRY_KEY = 'auth_token_expiry';

async function secureFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const token = secureAuth.getStoredToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['X-Auth-Token'] = token;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers,
    });

    const result = await response.json();

    if (!response.ok) {
      return { error: result.error || 'Request failed', success: false };
    }

    return result;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Network error',
      success: false,
    };
  }
}

export const secureAuth = {
  async requestCode(email: string, type: 'otp' | 'magic_link' = 'otp'): Promise<ApiResponse<{ expires_in: number }>> {
    return secureFetch<{ expires_in: number }>('/secure_auth.php?action=request-code', {
      method: 'POST',
      body: JSON.stringify({ email, type }),
    });
  },

  async verifyCode(email: string, code: string, rememberMe: boolean = false): Promise<ApiResponse<TokenData>> {
    const result = await secureFetch<TokenData>('/secure_auth.php?action=verify-code', {
      method: 'POST',
      body: JSON.stringify({ email, code, remember_me: rememberMe }),
    });

    if (result.success && result.data) {
      this.storeToken(result.data.token, result.data.expires_at);
    }

    return result;
  },

  async validateToken(token?: string): Promise<ApiResponse<ValidationData>> {
    const tokenToValidate = token || this.getStoredToken();

    if (!tokenToValidate) {
      return {
        error: 'No token provided',
        success: false,
      };
    }

    return secureFetch<ValidationData>('/secure_auth.php?action=validate', {
      method: 'POST',
      body: JSON.stringify({ token: tokenToValidate }),
    });
  },

  async logout(): Promise<ApiResponse<void>> {
    const token = this.getStoredToken();

    if (token) {
      await secureFetch<void>('/secure_auth.php?action=logout', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
    }

    this.clearToken();
    return { success: true };
  },

  async refreshToken(): Promise<ApiResponse<{ token: string; expires_at: string }>> {
    const token = this.getStoredToken();

    if (!token) {
      return {
        error: 'No token to refresh',
        success: false,
      };
    }

    const result = await secureFetch<{ token: string; expires_at: string }>(
      '/secure_auth.php?action=refresh',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      }
    );

    if (result.success && result.data) {
      this.storeToken(result.data.token, result.data.expires_at);
    }

    return result;
  },

  storeToken(token: string, expiresAt: string): void {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiresAt);
  },

  getStoredToken(): string | null {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);

    if (!token || !expiry) {
      return null;
    }

    if (new Date(expiry) <= new Date()) {
      this.clearToken();
      return null;
    }

    return token;
  },

  clearToken(): void {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  },

  isTokenValid(): boolean {
    return this.getStoredToken() !== null;
  },

  getTokenExpiry(): Date | null {
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    return expiry ? new Date(expiry) : null;
  },
};
