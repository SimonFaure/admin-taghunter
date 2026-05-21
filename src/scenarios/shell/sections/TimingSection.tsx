/**
 * Timing section — animation_*, message_display_time, default_time, default_time_malus.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useScenarioEditor } from '../useScenarioEditor';
import { CollapsibleSection } from '../components/CollapsibleSection';

const TIMING_KEYS = [
  'default_time',
  'default_time_malus',
  'animation_image_duration',
  'animation_message_duration',
  'message_display_time',
  'animation_display_time',
] as const;

export function TimingSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title="Timing">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {TIMING_KEYS.map((key) => (
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