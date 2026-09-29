import { useEffect, useState } from 'react';
import { Shield, Users } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface ScenarioAdminControlsProps {
  scenarioId: string;
}

// Admin-only section mounted inside MysteryConfig / TagquestConfig. Exposes the
// product-template toggle (scenario_type: 'custom' ↔ 'product'). There is a
// single licence (premium): a PUBLISHED product reaches every client, so there
// is no per-client playground grant to manage here. GO / Spot access is granted
// by hand on the admin client page.
export function ScenarioAdminControls({ scenarioId }: ScenarioAdminControlsProps) {
  const [scenarioType, setScenarioType] = useState<'custom' | 'product' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const scRes = await authFetch(`${API_BASE_URL}/query.php`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'scenarios',
            op: 'select',
            select: 'id, scenario_type, client_id',
            where: [['id', 'eq', Number(scenarioId)]],
            maybeSingle: true,
          }),
        });
        const scBody = await scRes.json();
        if (cancelled) return;

        const currentType = (scBody?.data?.scenario_type ?? null) as 'custom' | 'product' | null;
        setScenarioType(currentType || 'custom');
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
    setSaving(true);
    setError(null);
    try {
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
      setSaving(false);
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
                disabled={saving}
                onChange={(e) => toggleProduct(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm text-slate-900 font-medium">Publish as Taghunter product template</span>
            </label>
            <p className="ml-6 mt-1 text-xs text-slate-600">
              Products have <code>client_id = NULL</code>. Once published, a product is available to every Taghunter client.
            </p>
          </div>

          {scenarioType === 'product' && (
            <div className="flex items-start gap-2 rounded border border-slate-200 bg-white p-3 text-sm text-slate-700">
              <Users className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>
                All clients get this scenario in the Playground as soon as it is published. Tag Hunter GO / Spot
                access is never automatic: grant it per client from the admin client page.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
