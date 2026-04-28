import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PatternEditor } from '../../creator-ported/components/PatternEditor';
import { supabase } from '../../creator-ported/lib/db';
import { useAuth } from '../../auth/AuthContext';

interface PatternRow {
  id: string;
  uniqid: string;
  name: string;
  game_type: string;
}

export function StudioPatternRoute() {
  const { uniqid = '' } = useParams();
  const navigate = useNavigate();
  const { userType } = useAuth();
  const roleHome = userType === 'admin' ? '/admin' : '/my/patterns';

  const [pattern, setPattern] = useState<PatternRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: e } = await supabase
          .from('patterns')
          .select('id, uniqid, name, game_type')
          .eq('uniqid', uniqid)
          .maybeSingle();
        if (cancelled) return;
        if (e || !data) {
          setError(e?.message || 'Pattern not found');
        } else {
          setPattern(data as PatternRow);
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

  if (loading) return <div className="p-6 text-slate-300">Loading pattern…</div>;

  if (error || !pattern) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-red-400">{error || 'Pattern not found'}</p>
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

  return (
    <PatternEditor
      patternId={String(pattern.id)}
      gameType={pattern.game_type}
      patternName={pattern.name}
      onBack={() => navigate(roleHome)}
    />
  );
}
