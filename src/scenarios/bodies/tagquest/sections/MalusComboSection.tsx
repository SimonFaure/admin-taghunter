/**
 * Malus / combo section — malus_points, late_malus_points, combo_2/4/6_quests.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

const KEYS = ['malus_points', 'late_malus_points', 'combo_2_quests', 'combo_4_quests', 'combo_6_quests'] as const;

export function MalusComboSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title="Malus & combo">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <label key={key} className="block">
            <span className="text-xs font-medium text-gray-700 mb-1 block">{prettyKey(key)}</span>
            <input
              type="text"
              value={String(meta[key] ?? '')}
              onChange={(e) =>
                editor.setGameMeta(
                  (m) => ({ ...(m as Record<string, unknown>), [key]: e.target.value }) as typeof m,
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}

function prettyKey(k: string): string {
  return k.replace(/_/g, ' ');
}