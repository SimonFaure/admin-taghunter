/**
 * Play modes section — Itinéraire (ordered) vs Libre (any order).
 */

import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

type PlayModeKey = 'itinerary' | 'free';

const PLAY_MODES: ReadonlyArray<{ key: PlayModeKey; label: string; help: string }> = [
  { key: 'itinerary', label: 'Itinerary', help: 'Teams must hit checkpoints in order.' },
  { key: 'free', label: 'Free', help: 'Any order counts.' },
];

export function PlayModesSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const playModes = (meta.play_modes ?? {}) as Record<PlayModeKey, { enabled?: boolean } | undefined>;

  function setEnabled(key: PlayModeKey, enabled: boolean) {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          play_modes: { ...playModes, [key]: { enabled } },
        }) as typeof m,
    );
  }

  return (
    <CollapsibleSection title="Play modes">
      <p className="text-xs text-gray-500 mb-3">
        Operators pick one of the enabled play modes at launch time.
      </p>
      <div className="space-y-2">
        {PLAY_MODES.map((p) => (
          <label key={p.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!playModes[p.key]?.enabled}
              onChange={(ev) => setEnabled(p.key, ev.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-gray-900">{p.label}</span>
              <span className="text-gray-500"> — {p.help}</span>
            </span>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}
