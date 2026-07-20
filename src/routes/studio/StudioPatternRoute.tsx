import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PatternEditor } from '../../creator-ported/components/PatternEditor';
import { GoPatternEditor } from '../../creator-ported/components/GoPatternEditor';
import { db } from '../../creator-ported/lib/db';
import { useAuth } from '../../auth/AuthContext';

interface PatternRow {
  id: string;
  pattern_uniqid: string;
  name: string;
  game_type: string;
  mode?: string | null;
  answer_count?: number | null;
}

export function StudioPatternRoute() {
  const { uniqid = '' } = useParams();
  const navigate = useNavigate();
  const { userType } = useAuth();
  const goToPatternsList = () => {
    if (userType === 'admin') {
      navigate('/admin', { state: { tab: 'patterns' } });
    } else {
      navigate('/my/patterns');
    }
  };

  const [pattern, setPattern] = useState<PatternRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: e } = await db
          .from('patterns')
          .select('id, pattern_uniqid, name, game_type, mode, answer_count')
          .eq('pattern_uniqid', uniqid)
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
          onClick={goToPatternsList}
          className="rounded bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600"
        >
          Back
        </button>
      </div>
    );
  }

  if (pattern.mode === 'go') {
    return (
      <GoPatternEditor
        patternId={String(pattern.id)}
        patternName={pattern.name}
        answerCount={pattern.answer_count === 4 ? 4 : 2}
        onBack={goToPatternsList}
      />
    );
  }

  return (
    <PatternEditor
      patternId={String(pattern.id)}
      gameType={pattern.game_type}
      patternName={pattern.name}
      onBack={goToPatternsList}
    />
  );
}
