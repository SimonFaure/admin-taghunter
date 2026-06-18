/**
 * Display options section — scenario-locked toggles (not overridable at launch).
 *
 *   - display_score: show score during play
 *
 * The "auto-reset after animation" toggle was removed (the runtime keeps its
 * 5s auto-reset default), and "clues page on team return" moved to the
 * playground launch modal as a per-launch option (see GameConfig.cluesPage).
 */

import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

export function DisplayOptionsSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const displayScore = meta.display_score !== false;

  function setDisplayScore(v: boolean) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), display_score: v }) as typeof m);
  }

  return (
    <CollapsibleSection title="Display options">
      <div className="space-y-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={displayScore}
            onChange={(ev) => setDisplayScore(ev.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-gray-900">Display score during play</span>
            <span className="block text-gray-500 text-xs">
              Show the running score in the HUD throughout the game.
            </span>
          </span>
        </label>
      </div>
    </CollapsibleSection>
  );
}
