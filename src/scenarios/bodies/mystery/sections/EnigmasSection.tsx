/**
 * Enigmas section — per-enigma editor: number, text, points, good answer image.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { Plus, Trash2 } from 'lucide-react';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { getLocalized, setLocalized } from '../../../i18n/getLocalized';
import type { Lang } from '../../../i18n/types';
import type { Enigma } from '../../../../types/scenario-data';

function emptyEnigma(): Enigma {
  return {
    number: '',
    // Stage 3: text is `Localized<string>`. New enigmas start with empty map.
    text: {},
    good_answer_image: '',
    good_answer_points: '',
    wrong_answer_points: '',
  };
}

export function EnigmasSection() {
  const editor = useScenarioEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;
  const enigmas = ((editor.gameMeta as Record<string, unknown>).enigmas ?? []) as Enigma[];

  function setEnigmas(next: Enigma[]) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), enigmas: next }) as typeof m);
  }

  function addEnigma() {
    setEnigmas([...enigmas, { ...emptyEnigma(), number: String(enigmas.length + 1) }]);
  }

  function removeEnigma(idx: number) {
    setEnigmas(enigmas.filter((_, i) => i !== idx));
  }

  function updateEnigma(idx: number, patch: Partial<Enigma>) {
    setEnigmas(enigmas.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  return (
    <CollapsibleSection
      title="Enigmas"
      headerExtra={
        <button
          onClick={addEnigma}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add enigma
        </button>
      }
    >
      {enigmas.length === 0 ? (
        <p className="text-sm text-gray-500">No enigmas yet.</p>
      ) : (
        <div className="space-y-3">
          {enigmas.map((e, i) => (
            <div key={i} className="border border-gray-100 rounded-md p-3">
              <div className="grid grid-cols-12 gap-2 items-start">
                <input
                  placeholder="#"
                  value={e.number}
                  onChange={(ev) => updateEnigma(i, { number: ev.target.value })}
                  className="col-span-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
                <input
                  placeholder="Question / text"
                  value={getLocalized(e.text as never, lang, defaultLang)}
                  onChange={(ev) =>
                    updateEnigma(i, {
                      text: setLocalized(e.text as never, lang, ev.target.value, defaultLang),
                    })
                  }
                  className="col-span-7 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
                <input
                  placeholder="Good pts"
                  value={e.good_answer_points}
                  onChange={(ev) => updateEnigma(i, { good_answer_points: ev.target.value })}
                  className="col-span-1 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
                <input
                  placeholder="Wrong pts"
                  value={e.wrong_answer_points}
                  onChange={(ev) => updateEnigma(i, { wrong_answer_points: ev.target.value })}
                  className="col-span-2 px-2 py-1.5 border border-gray-300 rounded-md text-sm"
                />
                <button
                  onClick={() => removeEnigma(i)}
                  className="col-span-1 p-1.5 hover:bg-red-50 rounded text-red-500 justify-self-end"
                  aria-label="Remove enigma"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <input
                placeholder="Good answer image filename"
                value={e.good_answer_image}
                onChange={(ev) => updateEnigma(i, { good_answer_image: ev.target.value })}
                className="w-full mt-2 px-2 py-1.5 border border-gray-200 rounded-md text-xs"
              />
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
