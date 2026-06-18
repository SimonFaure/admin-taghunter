/**
 * Pattern section — picks the default tracks pattern (checkpoint → station/balise
 * assignments) this scenario uses. Stored as `scenario_default_pattern` (the
 * pattern's uniqid). Renamed from legacy `game_default_pattern`.
 *
 * The selected pattern's per-checkpoint station correspondences are surfaced
 * inline in the Checkpoints section below (see useTracksPatternStations).
 */

import { useEffect, useState } from 'react';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { db } from '../../../../creator-ported/lib/db';

interface TracksPatternOption {
  pattern_uniqid: string;
  name: string;
  status?: string | null;
}

export function PatternSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const value = (meta.scenario_default_pattern as string | null | undefined) ?? '';
  const [patterns, setPatterns] = useState<TracksPatternOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await db
        .from('patterns')
        .select('pattern_uniqid, name, status')
        .eq('game_type', 'tracks');
      if (!cancelled && Array.isArray(data)) {
        setPatterns((data as TracksPatternOption[]).filter((p) => !!p.pattern_uniqid));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function setValue(v: string) {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          scenario_default_pattern: v === '' ? null : v,
        }) as typeof m,
    );
  }

  // A saved uniqid that's no longer in the list still shows as selected.
  const knownSelected = patterns.some((p) => p.pattern_uniqid === value);

  return (
    <CollapsibleSection title="Default pattern">
      <label className="block">
        <span className="text-xs font-medium text-gray-700 mb-1 block">
          Default tracks pattern (checkpoint → station mapping)
        </span>
        <select
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
        >
          <option value="">— None —</option>
          {patterns.map((p) => (
            <option key={p.pattern_uniqid} value={p.pattern_uniqid}>
              {p.name}
              {p.status && p.status !== 'published' ? ` (${p.status})` : ''}
            </option>
          ))}
          {value && !knownSelected && (
            <option value={value}>{value} (not found)</option>
          )}
        </select>
        <span className="text-xs text-gray-500 block mt-1">
          Assigns each checkpoint to a station/balise. Create tracks patterns in the Patterns page.
          The mapping is shown per checkpoint below. Overridable at launch.
        </span>
      </label>
    </CollapsibleSection>
  );
}
