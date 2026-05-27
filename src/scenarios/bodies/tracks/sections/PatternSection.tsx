/**
 * Pattern section — references the theme bundle (ado_adultes / kids /
 * mini_kids) this scenario inherits visual defaults from. Renamed from
 * legacy `game_default_pattern`.
 *
 * Slice A surfaces this as a plain text input — replacing with a real
 * pattern picker (dropdown of available patterns for the game type) is a
 * follow-on once the existing `/my/patterns` view's data hook can be
 * reused here.
 */

import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

export function PatternSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const value = (meta.scenario_default_pattern as string | null | undefined) ?? '';

  function setValue(v: string) {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          scenario_default_pattern: v.trim() === '' ? null : v.trim(),
        }) as typeof m,
    );
  }

  return (
    <CollapsibleSection title="Default pattern">
      <label className="block">
        <span className="text-xs font-medium text-gray-700 mb-1 block">
          Pattern uniqid
        </span>
        <input
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          placeholder="e.g. 694526929fa99"
          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white font-mono"
        />
        <span className="text-xs text-gray-500 block mt-1">
          References the theme bundle (ado_adultes / kids / mini_kids) this
          scenario inherits visual defaults from.
        </span>
      </label>
    </CollapsibleSection>
  );
}
