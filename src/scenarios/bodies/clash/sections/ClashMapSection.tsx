/**
 * Clash map & pattern section — the territory map image, the neutral seal,
 * and the default Clash pattern (balise→combination station assignments,
 * picked from the clash patterns).
 *
 * Territory sigil anchors + custom map text are placed in the Layout editor
 * (button in the save bar), which writes to scenarios.scenario_layout.
 *
 * Design: project_clash_game_type_design (grill-me decision record).
 */

import { useEffect, useState } from 'react';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { db } from '../../../../creator-ported/lib/db';
import { clashMediaSlots } from '../mediaSlots';

interface ClashPatternOption {
  pattern_uniqid: string;
  name: string;
  status?: string | null;
}

export function ClashMapSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const patternValue = (meta.scenario_default_pattern as string | null | undefined) ?? '';
  const [patterns, setPatterns] = useState<ClashPatternOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await db
        .from('patterns')
        .select('pattern_uniqid, name, status')
        .eq('game_type', 'clash');
      if (!cancelled && Array.isArray(data)) {
        setPatterns(
          (data as ClashPatternOption[]).filter((p) => !!p.pattern_uniqid),
        );
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function setField(key: string, value: unknown) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: value }) as typeof m);
  }

  // A saved pattern uniqid that's no longer in the list still shows as selected.
  const knownSelected = patterns.some((p) => p.pattern_uniqid === patternValue);

  return (
    <CollapsibleSection title="Map & pattern">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {clashMediaSlots.map((slot) => (
          <AssetUploadField
            key={slot.key}
            slot={slot}
            value={String(meta[slot.key] ?? '')}
            onChange={(filename) => setField(slot.key, filename)}
          />
        ))}
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Position each territory's sigil and any custom map text in the Layout editor (button in the
        save bar) — positions are saved per scenario.
      </p>

      <label className="block mt-4">
        <span className="text-xs font-medium text-gray-700 mb-1 block">
          Default Clash pattern (balise → combination mapping)
        </span>
        <select
          value={patternValue}
          onChange={(e) => setField('scenario_default_pattern', e.target.value === '' ? null : e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
        >
          <option value="">— None —</option>
          {patterns.map((p) => (
            <option key={p.pattern_uniqid} value={p.pattern_uniqid}>
              {p.name}{p.status && p.status !== 'published' ? ` (${p.status})` : ''}
            </option>
          ))}
          {patternValue && !knownSelected && (
            <option value={patternValue}>{patternValue} (not found)</option>
          )}
        </select>
        <span className="text-xs text-gray-500 block mt-1">
          Assigns each of the 24 balise stations to one of the 8 combinations. Create clash patterns
          in the Patterns page. Overridable at launch.
        </span>
      </label>
    </CollapsibleSection>
  );
}
