import { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';

// Renders children only when the current user is an admin. A thin client-side
// gate — server-side enforcement in query.php / scenarios.php is the real
// security boundary (see Phase 4a). This just hides UI that clients shouldn't see.
export function AdminOnlyPanel({ children }: { children: ReactNode }) {
  const { userType } = useAuth();
  if (userType !== 'admin') return null;
  return <>{children}</>;
}
