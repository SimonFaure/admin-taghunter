import { authFetch } from '../../lib/authFetch';
import type { AppAccess } from '../../auth/appAccess';
import type { ClientScenario } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

/**
 * GO-only portal: the scenario ids the client actually holds, i.e. its GO/Spot
 * grant rows. `client_scenarios.php?action=list` returns every published
 * product for a premium licence, but GO/Spot are granted by hand only
 * (project_premium_client_grant_blind_spot). Returns null outside GO-only mode,
 * where everything the list returns is held.
 */
export async function fetchGrantedScenarioIds(access: AppAccess): Promise<Set<number> | null> {
  if (!access.scenariosGoOnly) return null;
  const actions = [...(access.go ? ['list_go'] : []), ...(access.spot ? ['list_spot'] : [])];
  const ids = new Set<number>();
  await Promise.all(
    actions.map(async (action) => {
      const res = await authFetch(`${API_BASE_URL}/client_scenarios.php?action=${action}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(body?.data)) return;
      for (const g of body.data as { scenario_id: number | string }[]) ids.add(Number(g.scenario_id));
    }),
  );
  return ids;
}

/** GO-only portal: the scenario runs in at least one of the client's apps. */
export function isPlayableInApps(s: ClientScenario, access: AppAccess): boolean {
  return (access.go && s.adaptable_go === true) || (access.spot && s.adaptable_spot === true);
}

/** Held = the client's own custom scenario, or a granted product. */
export function isHeldScenario(s: ClientScenario, grantedIds: Set<number> | null): boolean {
  return !grantedIds || s.scenario_type !== 'product' || grantedIds.has(Number(s.id));
}
