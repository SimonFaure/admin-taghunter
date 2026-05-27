/**
 * Routes section — 5 fixed presets, operator opts in to which ones are
 * available at launch. At least one must be enabled (validator enforces).
 */

import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

type RouteKey = 'default' | 'first_half' | 'last_half' | 'odd' | 'even';

const ROUTES: ReadonlyArray<{ key: RouteKey; label: string; help: string }> = [
  { key: 'default', label: 'Default', help: 'All checkpoints in order (1..N).' },
  { key: 'first_half', label: 'First half', help: 'Checkpoints 1..N/2.' },
  { key: 'last_half', label: 'Last half', help: 'Checkpoints N/2+1..N.' },
  { key: 'odd', label: 'Odd', help: 'Odd-numbered checkpoints (1, 3, 5, ...).' },
  { key: 'even', label: 'Even', help: 'Even-numbered checkpoints (2, 4, 6, ...).' },
];

export function RoutesSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const routes = (meta.routes ?? {}) as Record<RouteKey, { enabled?: boolean } | undefined>;

  function setEnabled(key: RouteKey, enabled: boolean) {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          routes: { ...routes, [key]: { enabled } },
        }) as typeof m,
    );
  }

  return (
    <CollapsibleSection title="Routes (parcours)">
      <p className="text-xs text-gray-500 mb-3">
        Operators pick one of the enabled routes at launch time.
      </p>
      <div className="space-y-2">
        {ROUTES.map((r) => (
          <label key={r.key} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!routes[r.key]?.enabled}
              onChange={(ev) => setEnabled(r.key, ev.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-gray-900">{r.label}</span>
              <span className="text-gray-500"> — {r.help}</span>
            </span>
          </label>
        ))}
      </div>
    </CollapsibleSection>
  );
}
