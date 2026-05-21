/**
 * Levels section — gated by capabilities.hasLevels (mystery + tagquest).
 *
 * Slice 3B: `name` and `description` are `Localized<string>`; `points` stays
 * a plain numeric-looking string. Per-row form mixes a localized input + a
 * plain input.
 *
 * Mystery 'level' = enigma difficulty band; Tagquest 'level' = team
 * progression milestone. Same data shape; section copy is neutral.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import { Plus, Trash2 } from 'lucide-react';
import { useScenarioEditor } from '../useScenarioEditor';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { getLocalized, setLocalized } from '../../i18n/getLocalized';
import type { Lang, Localized } from '../../i18n/types';

interface Level {
  name: Localized<string> | string;
  points: string;
  description: Localized<string> | string;
}

export function LevelsSection() {
  const editor = useScenarioEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;

  if (!editor.adapter.capabilities.hasLevels) return null;

  const levels = ((editor.gameMeta as Record<string, unknown>).levels ?? {}) as Record<string, Level>;
  const keys = Object.keys(levels);

  function setLevels(next: Record<string, Level>) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), levels: next }) as typeof m);
  }

  function addLevel() {
    const nextKey = String(keys.length + 1);
    setLevels({ ...levels, [nextKey]: { name: {}, points: '', description: {} } });
  }

  function removeLevel(k: string) {
    const next = { ...levels };
    delete next[k];
    setLevels(next);
  }

  function updateLevel(k: string, patch: Partial<Level>) {
    setLevels({ ...levels, [k]: { ...levels[k], ...patch } });
  }

  return (
    <CollapsibleSection
      title="Levels"
      headerExtra={
        <button
          onClick={addLevel}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add level
        </button>
      }
    >
      {keys.length === 0 ? (
        <p className="text-sm text-gray-500">No levels yet.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => {
            const lvl = levels[k] ?? { name: {}, points: '', description: {} };
            return (
              <div key={k} className="grid grid-cols-12 gap-2 items-start border border-gray-100 rounded-md p-2">
                <div className="col-span-1 text-sm font-medium text-gray-500 pt-2">#{k}</div>
                <input
                  placeholder="Name"
                  value={getLocalized(lvl.name as never, lang, defaultLang)}
                  onChange={(e) =>
                    updateLevel(k, { name: setLocalized(lvl.name as never, lang, e.target.value, defaultLang) })
                  }
                  className="col-span-4 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
                <input
                  placeholder="Points"
                  value={lvl.points ?? ''}
                  onChange={(e) => updateLevel(k, { points: e.target.value })}
                  className="col-span-2 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
                <input
                  placeholder="Description"
                  value={getLocalized(lvl.description as never, lang, defaultLang)}
                  onChange={(e) =>
                    updateLevel(k, {
                      description: setLocalized(lvl.description as never, lang, e.target.value, defaultLang),
                    })
                  }
                  className="col-span-4 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
                <button
                  onClick={() => removeLevel(k)}
                  className="col-span-1 p-1.5 hover:bg-red-50 rounded text-red-500"
                  aria-label="Remove level"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
