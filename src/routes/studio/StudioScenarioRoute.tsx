import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ScenarioCreator } from '../../creator-ported/components/ScenarioCreator';
import { db } from '../../creator-ported/lib/db';
import { useAuth } from '../../auth/AuthContext';
import { ScenarioEditorShell } from '../../scenarios/shell/ScenarioEditorShell';
import { getAdapter } from '../../scenarios/registry';
import '../../scenarios/bootstrap';

interface ScenarioRow {
  id: string;
  uniqid: string;
  game_type: 'mystery' | 'tagquest' | 'tracks' | string;
  title?: string;
  scenario_type?: string;
}

export function StudioScenarioRoute() {
  const { uniqid = '' } = useParams();
  const navigate = useNavigate();
  const { userType } = useAuth();
  const isAdmin = userType === 'admin';

  const isNew = uniqid === 'new';
  const [scenario, setScenario] = useState<ScenarioRow | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: e } = await db
          .from('scenarios')
          .select('id, uniqid, game_type, title, scenario_type')
          .eq('uniqid', uniqid)
          .maybeSingle();
        if (cancelled) return;
        if (e || !data) {
          setError(e?.message || 'Scenario not found');
        } else {
          // Product scenarios are read-only for clients. Backend already rejects
          // saves; this redirect keeps the user out of an editor they can't save.
          if (!isAdmin && (data as ScenarioRow).scenario_type === 'product') {
            navigate(`/my/scenarios/${uniqid}`, { replace: true });
            return;
          }
          setScenario(data as ScenarioRow);
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
  }, [isNew, uniqid, isAdmin, navigate]);

  // Admins land on Dashboard with the Scenarios tab pre-selected (Dashboard
   // reads `location.state.tab`); clients have a dedicated list route.
   const backToList = () =>
     isAdmin
       ? navigate('/admin', { state: { tab: 'scenarios' } })
       : navigate('/my/scenarios');
  const openLayoutEditor = (scenarioUniqid: string) =>
    // Remember we came from the editor so the layout editor's Back returns here
    // rather than to the role home (StudioLayoutRoute reads location.state.from).
    navigate(`/studio/layouts/${scenarioUniqid}`, {
      state: { from: `/studio/scenarios/${scenarioUniqid}` },
    });

  if (isNew) {
    return (
      <ScenarioCreator
        onBack={backToList}
        onSave={(scenarioUniqid: string) => {
          // ScenarioCreator now passes uniqid (not DB id); navigate directly into
          // the editor so the user continues authoring without a detour.
          navigate(`/studio/scenarios/${scenarioUniqid}`, { replace: true });
        }}
        isAdmin={isAdmin}
      />
    );
  }

  if (loading) {
    return (
      <div className="p-6 text-slate-300">Loading scenario…</div>
    );
  }

  if (error || !scenario) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-red-400">{error || 'Scenario not found'}</p>
        <button
          type="button"
          onClick={backToList}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600"
        >
          Back
        </button>
      </div>
    );
  }

  const scenarioId = String(scenario.id);

  // New-shell path — adapters are registered via bootstrap.ts (Slice 2B+).
  // Mystery + Tagquest both route through <ScenarioEditorShell>; tracks (and
  // any future type) falls through to the not-available branch until an
  // adapter is registered for it.
  const adapter = getAdapter(scenario.game_type);
  if (adapter) {
    return (
      <ScenarioEditorShell
        scenarioId={scenarioId}
        adapter={adapter}
        onBack={backToList}
        onOpenLayoutEditor={() => openLayoutEditor(scenario.uniqid)}
      />
    );
  }

  return (
    <div className="p-6 space-y-3">
      <p className="text-slate-200">
        Editor for <code className="rounded bg-slate-800 px-1">{scenario.game_type}</code> scenarios is not available yet.
      </p>
      <button
        type="button"
        onClick={backToList}
        className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600"
      >
        Back
      </button>
    </div>
  );
}
