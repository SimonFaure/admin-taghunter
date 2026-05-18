/**
 * Overscores section — gated by capabilities.hasOverscores (mystery only).
 *
 * Slice 3B: `name_overscore_step` is `Localized<string>`; the other three
 * fields stay scalar.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import { Plus, Trash2 } from 'lucide-react';
import { useScenarioEditor } from '../useScenarioEditor';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { getLocalized, setLocalized } from '../../i18n/getLocalized';
import type { Lang, Localized } from '../../i18n/types';

interface Overscore {
  overscore_step: string;
  overscore_score: string;
  name_overscore_step: Localized<string> | string;
  image_overscore_step: string;
}

export function OverscoresSection() {
  const editor = useScenarioEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;

  if (!editor.adapter.capabilities.hasOverscores) return null;

  const overscores = ((editor.gameMeta as Record<string, unknown>).overscores ?? []) as Overscore[];

  function setOverscores(next: Overscore[]) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), overscores: next }) as typeof m);
  }

  function addOverscore() {
    setOverscores([
      ...overscores,
      { overscore_step: '', overscore_score: '', name_overscore_step: {}, image_overscore_step: '' },
    ]);
  }

  function removeOverscore(i: number) {
    setOverscores(overscores.filter((_, idx) => idx !== i));
  }

  function updateOverscore(i: number, patch: Partial<Overscore>) {
    setOverscores(overscores.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  return (
    <CollapsibleSection
      title="Overscores"
      headerExtra={
        <button
          onClick={addOverscore}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add overscore
        </button>
      }
    >
      {overscores.length === 0 ? (
        <p className="text-sm text-gray-500">No overscores yet.</p>
      ) : (
        <div className="space-y-2">
          {overscores.map((o, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start border border-gray-100 rounded-md p-2">
              <input
                placeholder="Step"
                value={o.overscore_step}
                onChange={(e) => updateOverscore(i, { overscore_step: e.target.value })}
                className="col-span-2 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
              <input
                placeholder="Score"
                value={o.overscore_score}
                onChange={(e) => updateOverscore(i, { overscore_score: e.target.value })}
                className="col-span-2 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
              <input
                placeholder="Name"
                value={getLocalized(o.name_overscore_step as never, lang, defaultLang)}
                onChange={(e) =>
                  updateOverscore(i, {
                    name_overscore_step: setLocalized(o.name_overscore_step as never, lang, e.target.value, defaultLang),
                  })
                }
                className="col-span-4 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
              <input
                placeholder="Image filename"
                value={o.image_overscore_step}
                onChange={(e) => updateOverscore(i, { image_overscore_step: e.target.value })}
                className="col-span-3 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
              />
              <button
                onClick={() => removeOverscore(i)}
                className="col-span-1 p-1.5 hover:bg-red-50 rounded text-red-500"
                aria-label="Remove overscore"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}