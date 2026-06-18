/**
 * Pattern section — picks the default tagquest pattern (each quest's 4 piece
 * images → station/balise assignments) this scenario uses. Stored as
 * `scenario_default_pattern` (the pattern's uniqid).
 *
 * The selected pattern's per-image station correspondences are surfaced next to
 * each quest's image fields in the Quests section below
 * (see useTagquestPatternStations).
 */

import { useEffect, useState } from 'react';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { db } from '../../../../creator-ported/lib/db';

interface TagquestPatternOption {
  pattern_uniqid: string;
  name: string;
  status?: string | null;
}

export function PatternSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const value = (meta.scenario_default_pattern as string | null | undefined) ?? '';
  const [patterns, setPatterns] = useState<TagquestPatternOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await db
        .from('patterns')
        .select('pattern_uniqid, name, status')
        .eq('game_type', 'tagquest');
      if (!cancelled && Array.isArray(data)) {
        setPatterns((data as TagquestPatternOption[]).filter((p) => !!p.pattern_uniqid));
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

  const knownSelected = patterns.some((p) => p.pattern_uniqid === value);

  return (
    <CollapsibleSection title="Default pattern">
      <label className="block">
        <span className="text-xs font-medium text-gray-700 mb-1 block">
          Default tagquest pattern (quest images → station mapping)
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
          Assigns each quest's four piece images to stations/balises. Create tagquest patterns in the
          Patterns page. The mapping is shown next to each image below. Overridable at launch.
        </span>
      </label>
    </CollapsibleSection>
  );
}
