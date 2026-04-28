// Compat shim — the canonical auth provider is src/auth/AuthContext.tsx.
// The legacy admin auth (Supabase/PHP dual-mode) has been retired; this adapter
// keeps the old `{ user, loading, signIn, signOut }` API working for a few
// remaining call sites until they migrate. Login via password-only `signIn`
// is no longer supported — callers must use the OTP flow via SecureLoginForm.
import { useAuth as useNewAuth, AuthProvider as NewAuthProvider } from '../auth/AuthContext';

export const AuthProvider = NewAuthProvider;

export function useAuth() {
  const { user, loading, logout } = useNewAuth();
  return {
    user,
    loading,
    signOut: logout,
    signIn: async (_email: string, _password: string) => ({
      error: new Error('Password-only signIn is no longer supported; use the OTP login flow'),
    }),
  };
}
