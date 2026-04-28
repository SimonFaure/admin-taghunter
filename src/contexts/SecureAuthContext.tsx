// Compat shim — the canonical auth provider is src/auth/AuthContext.tsx.
// This file keeps existing `useSecureAuth` / `SecureAuthProvider` imports working during the merge.
// Callers should migrate to `src/auth/AuthContext` over time; delete this shim when that's done.
export { AuthProvider as SecureAuthProvider, useAuth as useSecureAuth } from '../auth/AuthContext';
export type { AuthUser } from '../auth/AuthContext';
