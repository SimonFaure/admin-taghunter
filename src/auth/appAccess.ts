import type { AuthUser } from './AuthContext';

// Per-app surface visibility for the studio CLIENT portal
// (project_client_app_section). Each Client App the admin enables unlocks a set
// of portal surfaces; a surface shows when at least one enabling app is on.
//
//   Playground -> Edit scenarios (all types), Patterns, Cards, Devices,
//                 App download, Tutorial videos, Statistics, Settings.
//   GO / Drop  -> Scenarios (GO only), QR codes, GO leaderboards.
//
// Home / Account / Help are universal chrome (never app-gated).
export interface AppAccess {
  playground: boolean;
  go: boolean;
  drop: boolean;
  // The scenarios page renders in GO-only mode (only GO scenarios + trimmed
  // controls) when the client has GO/Drop but NOT Playground. This replaces the
  // old standalone `go_client_only` flag.
  scenariosGoOnly: boolean;
}

export function getAppAccess(user: AuthUser | null | undefined): AppAccess {
  // Default Playground to ON when the flag is absent (older token, admin, or a
  // transitional payload) so a normal client is never accidentally stripped.
  // GO/Drop default OFF - they're opt-in products.
  const playground = user?.playground_enabled !== false;
  const go = !!user?.go_enabled;
  const drop = !!user?.drop_enabled;
  return { playground, go, drop, scenariosGoOnly: !playground && (go || drop) };
}
