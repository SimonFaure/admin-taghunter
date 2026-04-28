import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MysteryConfig } from '../../creator-ported/components/MysteryConfig';
import { TagquestConfig } from '../../creator-ported/components/TagquestConfig';
import { ScenarioCreator } from '../../creator-ported/components/ScenarioCreator';
import { supabase } from '../../creator-ported/lib/db';
import { useAuth } from '../../auth/AuthContext';

interface ScenarioRow {
  id: string;
  uniqid: string;
  game_type: 'mystery' | 'tagquest' | 'tracks' | string;
  title?: string;
}

export function StudioScenarioRoute() {
  const { uniqid = '' } = useParams();
  const navigate = useNavigate();
  const { userType } = useAuth();
  const isAdmin = userType === 'admin';
  // Admin list views (/admin/scenarios etc.) are still placeholders until Phase 3b
  // splits Dashboard into sub-routes. For now admins land back at the Dashboard home
  // and reclick the Scenarios tab. Clients have real list routes already.
  const roleHome = isAdmin ? '/admin' : '/my/scenarios';

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
        const { data, error: e } = await supabase
          .from('scenarios')
          .select('id, uniqid, game_type, title')
          .eq('uniqid', uniqid)
          .maybeSingle();
        if (cancelled) return;
        if (e || !data) {
          setError(e?.message || 'Scenario not found');
        } else {
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
  }, [isNew, uniqid]);

  const backToList = () => navigate(roleHome);
  const openLayoutEditor = (scenarioUniqid: string) =>
    navigate(`/studio/layouts/${scenarioUniqid}`);

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

  if (scenario.game_type === 'mystery') {
    return (
      <MysteryConfig
        scenarioId={scenarioId}
        onBack={backToList}
        onOpenLayoutEditor={() => openLayoutEditor(scenario.uniqid)}
      />
    );
  }

  if (scenario.game_type === 'tagquest') {
    return (
      <TagquestConfig
        scenarioId={scenarioId}
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
