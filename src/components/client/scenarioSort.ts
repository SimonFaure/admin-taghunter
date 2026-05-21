import type { ClientScenario } from './types';

// "Recent" is a proxy: updated_at first, falling back to created_at, then granted_at.
// True "recently launched" would need a dedicated last_used_at column updated by
// launched_games.php — see the plan's open question on this.
export function recencyKey(s: ClientScenario): string {
  return s.updated_at || s.created_at || s.granted_at || '';
}
