/**
 * Display options section — scenario-locked toggles (not overridable at launch).
 *
 *   - display_score:    show score during play
 *   - clues_page:       auto-trigger the "all-checkpoints" page on team return,
 *                       with per-element visibility (title/text/image)
 *   - auto_reset:       countdown then auto-return to map at end of animation
 *                       (5s hardcoded in playground)
 */

import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';

interface CluesPage {
  enabled: boolean;
  show_title: boolean;
  show_text: boolean;
  show_image: boolean;
}

const DEFAULT_CLUES_PAGE: CluesPage = {
  enabled: false,
  show_title: true,
  show_text: true,
  show_image: true,
};

export function DisplayOptionsSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const displayScore = meta.display_score !== false;
  const autoReset = meta.auto_reset !== false;
  const clues = (meta.clues_page as CluesPage | undefined) ?? DEFAULT_CLUES_PAGE;

  function setDisplayScore(v: boolean) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), display_score: v }) as typeof m);
  }

  function setAutoReset(v: boolean) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), auto_reset: v }) as typeof m);
  }

  function setCluesField<K extends keyof CluesPage>(key: K, value: CluesPage[K]) {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          clues_page: { ...clues, [key]: value },
        }) as typeof m,
    );
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

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoReset}
            onChange={(ev) => setAutoReset(ev.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-gray-900">Auto-reset after animation</span>
            <span className="block text-gray-500 text-xs">
              5-second countdown back to the map at the end of each checkpoint
              animation. When off, the operator presses Enter to reset.
            </span>
          </span>
        </label>

        <div className="border-t border-gray-200 pt-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={clues.enabled}
              onChange={(ev) => setCluesField('enabled', ev.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-gray-900">Clues page on team return</span>
              <span className="block text-gray-500 text-xs">
                On the second bip after the team returns, show the map with all
                checkpoints revealed (no per-checkpoint animation).
              </span>
            </span>
          </label>

          {clues.enabled && (
            <div className="ml-6 mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={clues.show_title}
                  onChange={(ev) => setCluesField('show_title', ev.target.checked)}
                />
                <span>Show checkpoint titles on the clues page</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={clues.show_text}
                  onChange={(ev) => setCluesField('show_text', ev.target.checked)}
                />
                <span>Show checkpoint descriptions on the clues page</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={clues.show_image}
                  onChange={(ev) => setCluesField('show_image', ev.target.checked)}
                />
                <span>Show checkpoint images on the clues page</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
