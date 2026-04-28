import { useEffect, useState } from 'react';
import { Shield, Users } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface Client {
  id: number;
  email: string;
  name?: string | null;
  company?: string | null;
  license_type?: 'access' | 'premium';
}

interface ScenarioAdminControlsProps {
  scenarioId: string;
}

// Admin-only section mounted inside MysteryConfig / TagquestConfig. Exposes:
//   - Product-template toggle (scenario_type: 'custom' ↔ 'product')
//   - Client access grants (only meaningful when scenario is a product)
export function ScenarioAdminControls({ scenarioId }: ScenarioAdminControlsProps) {
  const [scenarioType, setScenarioType] = useState<'custom' | 'product' | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [grantedIds, setGrantedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'type' | 'grants' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [scRes, clRes, grantsRes] = await Promise.all([
          authFetch(`${API_BASE_URL}/query.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'scenarios',
              op: 'select',
              select: 'id, scenario_type, client_id',
              where: [['id', 'eq', Number(scenarioId)]],
              maybeSingle: true,
            }),
          }),
          authFetch(`${API_BASE_URL}/clients.php?action=list`),
          authFetch(`${API_BASE_URL}/query.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'client_scenarios',
              op: 'select',
              select: 'client_id',
              where: [['scenario_id', 'eq', Number(scenarioId)]],
            }),
          }),
        ]);

        const scBody = await scRes.json();
        const clBody = await clRes.json();
        const grBody = await grantsRes.json();
        if (cancelled) return;

        const currentType = (scBody?.data?.scenario_type ?? null) as 'custom' | 'product' | null;
        setScenarioType(currentType || 'custom');

        const fetched: Client[] = (clBody?.data as Client[]) || [];
        setClients(fetched);

        const grants: { client_id: number }[] = (grBody?.data as any[]) || [];
        setGrantedIds(new Set(grants.map((g) => Number(g.client_id))));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load admin controls');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  const toggleProduct = async (asProduct: boolean) => {
    const next: 'custom' | 'product' = asProduct ? 'product' : 'custom';
    setSaving('type');
    setError(null);
    try {
      const form = new FormData();
      form.append('id', scenarioId);
      form.append('scenario_type', next);
      // When flipping to product, clear client_id; to custom, leave as-is (admin decides elsewhere).
      const res = await authFetch(`${API_BASE_URL}/query.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'scenarios',
          op: 'update',
          values: asProduct ? { scenario_type: 'product', client_id: null } : { scenario_type: 'custom' },
          where: [['id', 'eq', Number(scenarioId)]],
        }),
      });
      const body = await res.json();
      if (!res.ok || body?.error) {
        throw new Error(body?.error?.message || body?.error || 'Failed to update scenario type');
      }
      setScenarioType(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(null);
    }
  };

  const toggleGrant = async (clientId: number, grant: boolean) => {
    setSaving('grants');
    setError(null);
    try {
      const action = grant ? 'add' : 'remove';
      const res = await authFetch(`${API_BASE_URL}/client_scenarios.php?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, scenario_id: Number(scenarioId) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `Failed to ${action} grant`);
      }
      setGrantedIds((prev) => {
        const next = new Set(prev);
        if (grant) next.add(clientId);
        else next.delete(clientId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grant update failed');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <div className="text-sm text-amber-900">Loading admin controls…</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-amber-900 font-semibold"
      >
        <Shield className="w-5 h-5" />
        Admin-only settings
        <span className="text-xs font-normal text-amber-700">(not visible to clients)</span>
      </button>

      {expanded && (
        <>
          {error && (
            <div className="rounded bg-red-50 border border-red-200 p-2 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={scenarioType === 'product'}
                disabled={saving === 'type'}
                onChange={(e) => toggleProduct(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm text-slate-900 font-medium">Publish as Taghunter product template</span>
            </label>
            <p className="ml-6 mt-1 text-xs text-slate-600">
              Products have <code>client_id = NULL</code>. Premium clients see all products; access clients need explicit grants below.
            </p>
          </div>

          {scenarioType === 'product' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                <Users className="w-4 h-4" />
                Which clients have access?
              </div>
              {clients.length === 0 ? (
                <p className="text-sm text-slate-500">No clients on file.</p>
              ) : (
                <ul className="max-h-64 overflow-auto divide-y divide-slate-200 rounded border border-slate-200 bg-white">
                  {clients.map((c) => {
                    const granted = grantedIds.has(c.id);
                    const premium = c.license_type === 'premium';
                    return (
                      <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={granted || premium}
                          disabled={premium || saving === 'grants'}
                          onChange={(e) => toggleGrant(c.id, e.target.checked)}
                          className="h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {c.name || c.email}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{c.email}</div>
                        </div>
                        {premium && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs">
                            premium (auto)
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
