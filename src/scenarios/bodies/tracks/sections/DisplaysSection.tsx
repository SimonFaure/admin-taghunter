/**
 * Display modes section — full / map / simple. Operator picks one at launch.
 */

import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

type DisplayKey = 'full' | 'map' | 'simple';

const DISPLAYS: ReadonlyArray<{ key: DisplayKey; label: string; help: string }> = [
  { key: 'full', label: 'Full', help: 'Map + checkpoint title, description, and reveal image with animation.' },
  { key: 'map', label: 'Map', help: 'Map only; markers light up on hit. No title/description, no big reveal.' },
  { key: 'simple', label: 'Simple', help: 'Minimal HUD (team name + score + current checkpoint number), no map.' },
];

export function DisplaysSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const displays = (meta.displays ?? {}) as Record<DisplayKey, { enabled?: boolean } | undefined>;

  function setEnabled(key: DisplayKey, enabled: boolean) {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          displays: { ...displays, [key]: { enabled } },
        }) as typeof m,
    );
  }

  return (
    <CollapsibleSection title="Display modes">
      <p className="text-xs text-gray-500 mb-3">
        Operators pick one of the enabled display modes at launch time.
      </p>
      <div className="space-y-2">
        {DISPLAYS.map((d) => (
          <label key={d.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!displays[d.key]?.enabled}
              onChange={(ev) => setEnabled(d.key, ev.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-gray-900">{d.label}</span>
              <span className="text-gray-500"> — {d.help}</span>
            </span>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}
