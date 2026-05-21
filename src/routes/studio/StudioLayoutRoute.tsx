import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LayoutEditor } from '../../creator-ported/components/LayoutEditor';
import { db } from '../../creator-ported/lib/db';
import { useAuth } from '../../auth/AuthContext';

// /studio/layouts/:uniqid treats :uniqid as the *scenario* uniqid — LayoutEditor
// edits the layout attached to a given scenario (creator's original flow
// reached it from inside MysteryConfig/TagquestConfig for the current scenario).
// A future change could accept a standalone layout uniqid for default-layout editing.
export function StudioLayoutRoute() {
  const { uniqid = '' } = useParams();
  const navigate = useNavigate();
  const { userType } = useAuth();
  const roleHome = userType === 'admin' ? '/admin' : '/my/layouts';

  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: e } = await db
          .from('scenarios')
          .select('id')
          .eq('uniqid', uniqid)
          .maybeSingle();
        if (cancelled) return;
        if (e || !data) {
          setError(e?.message || 'Scenario not found for this layout');
        } else {
          setScenarioId(String((data as any).id));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uniqid]);

  if (loading) return <div className="p-6 text-slate-300">Loading layout…</div>;

  if (error || !scenarioId) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-red-400">{error || 'Layout not found'}</p>
        <button
          type="button"
          onClick={() => navigate(roleHome)}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600"
        >
          Back
        </button>
      </div>
    );
  }

  return <LayoutEditor scenarioId={scenarioId} onBack={() => navigate(roleHome)} />;
}
