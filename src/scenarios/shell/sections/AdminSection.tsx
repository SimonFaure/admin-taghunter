/**
 * Admin section — scenario_version, game_public, auto_reset, delay_auto_reset,
 * pdf_title, team_title.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useScenarioEditor } from '../useScenarioEditor';
import { CollapsibleSection } from '../components/CollapsibleSection';

export function AdminSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const setKey = (k: string, v: unknown) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [k]: v }) as typeof m);

  return (
    <CollapsibleSection title="Admin / metadata">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">Scenario version</span>
          <input
            type="text"
            value={String(meta.scenario_version ?? '')}
            onChange={(e) => setKey('scenario_version', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">Audience (game_public)</span>
          <select
            value={String(meta.game_public ?? 'kids')}
            onChange={(e) => setKey('game_public', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="kids">Kids</option>
            <option value="adults">Adults</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">PDF title</span>
          <input
            type="text"
            value={String(meta.pdf_title ?? '')}
            onChange={(e) => setKey('pdf_title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">Team title</span>
          <input
            type="text"
            value={String(meta.team_title ?? '')}
            onChange={(e) => setKey('team_title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </label>
        <label className="flex items-center gap-2 mt-2">
          <input
            type="checkbox"
            checked={Boolean(meta.auto_reset)}
            onChange={(e) => setKey('auto_reset', e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Auto-reset after game ends</span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">Auto-reset delay (s)</span>
          <input
            type="text"
            value={String(meta.delay_auto_reset ?? '')}
            onChange={(e) => setKey('delay_auto_reset', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </label>
      </div>
    </CollapsibleSection>
  );
}