import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { authFetch } from '../lib/authFetch';
import type { AppAccess } from '../auth/appAccess';
import { fetchGrantedScenarioIds, isHeldScenario, isPlayableInApps } from '../components/client/heldScenarios';
import { recencyKey } from '../components/client/scenarioSort';
import type { ClientScenario } from '../components/client/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

// Scenario data shared by the licensee sidebar (badges) and the home page, so
// both read the same numbers from one load. Rules are the ones the home page
// and MyScenariosView already apply: in GO-only mode only the granted scenarios
// playable in the licensee's apps are theirs.
export interface LicenseeData {
  loading: boolean;
  error: string | null;
  /** Every scenario in the account's scope, newest first. */
  scenarios: ClientScenario[];
  /** The scenarios the licensee holds (what "Mes scénarios" lists). */
  held: ClientScenario[];
  /** Held Tag Hunter products. */
  products: ClientScenario[];
  /** Held custom scenarios (the licensee's own). */
  customs: ClientScenario[];
  /** Product rows of the catalog (scenarios.php?action=catalog); null until loaded. */
  catalogCount: number | null;
  /** Reload when the last load is older than `maxAgeMs`. */
  refreshIfStale: (maxAgeMs: number) => void;
}

const LicenseeDataContext = createContext<LicenseeData | null>(null);

export function useLicenseeData(): LicenseeData {
  const ctx = useContext(LicenseeDataContext);
  if (!ctx) throw new Error('useLicenseeData must be used inside LicenseeDataProvider');
  return ctx;
}

export function LicenseeDataProvider({ access, children }: { access: AppAccess; children: ReactNode }) {
  const hasScenarios = access.playground || access.go || access.spot;
  const [scenarios, setScenarios] = useState<ClientScenario[]>([]);
  const [grantedIds, setGrantedIds] = useState<Set<number> | null>(null);
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(hasScenarios);
  const [error, setError] = useState<string | null>(null);
  const loadedAt = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!hasScenarios || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      const [listRes, catalogRes, granted] = await Promise.all([
        authFetch(`${API_BASE_URL}/client_scenarios.php?action=list`),
        authFetch(`${API_BASE_URL}/scenarios.php?action=catalog`).catch(() => null),
        fetchGrantedScenarioIds(access),
      ]);
      const listBody = await listRes.json().catch(() => ({}));
      if (!listRes.ok) throw new Error(listBody?.error || `HTTP ${listRes.status}`);
      const list = ((listBody?.data as ClientScenario[]) || []).slice();
      list.sort((a, b) => recencyKey(b).localeCompare(recencyKey(a)));
      setScenarios(list);
      setGrantedIds(granted);
      if (catalogRes?.ok) {
        const catalogBody = await catalogRes.json().catch(() => null);
        if (Array.isArray(catalogBody?.scenarios)) setCatalogCount(catalogBody.scenarios.length);
      }
      loadedAt.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [hasScenarios, access.go, access.spot, access.scenariosGoOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const refreshIfStale = useCallback(
    (maxAgeMs: number) => {
      if (loadedAt.current && Date.now() - loadedAt.current > maxAgeMs) void load();
    },
    [load],
  );

  const value = useMemo<LicenseeData>(() => {
    const inScope = access.scenariosGoOnly ? scenarios.filter((s) => isPlayableInApps(s, access)) : scenarios;
    const held = inScope.filter((s) => isHeldScenario(s, grantedIds));
    return {
      loading,
      error,
      scenarios: inScope,
      held,
      products: held.filter((s) => s.scenario_type === 'product'),
      customs: held.filter((s) => s.scenario_type !== 'product'),
      catalogCount,
      refreshIfStale,
    };
  }, [scenarios, grantedIds, catalogCount, loading, error, refreshIfStale, access]);

  return <LicenseeDataContext.Provider value={value}>{children}</LicenseeDataContext.Provider>;
}
