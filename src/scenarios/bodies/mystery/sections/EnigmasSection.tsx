/**
 * Enigmas section — per-enigma editor.
 *
 * Layout: two columns inside each card. Left column = stacked text inputs
 * (number, question, good points, wrong points). Right column = image
 * upload field for the good-answer image. Each takes 50% of the width.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { Plus, Trash2 } from 'lucide-react';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { getLocalized, setLocalized } from '../../../i18n/getLocalized';
import type { Lang } from '../../../i18n/types';
import type { Enigma } from '../../../../types/scenario-data';
import type { MediaSlot } from '../../../types';

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
        <div className="space-y-4">
          {enigmas.map((e, i) => {
            const imageSlot: MediaSlot = {
              key: `enigma_${i}_good_answer_image`,
              kind: 'image',
              required: false,
              scope: 'type',
              label: 'Good answer image',
            };
            return (
              <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Enigma {e.number || i + 1}
                  </h3>
                  <button
                    onClick={() => removeEnigma(i)}
                    className="p-1.5 hover:bg-red-50 rounded text-red-500"
                    aria-label="Remove enigma"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: stacked inputs */}
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">Number</span>
                      <input
                        value={e.number}
                        onChange={(ev) => updateEnigma(i, { number: ev.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">
                        Question / text ({lang})
                      </span>
                      <input
                        value={getLocalized(e.text as never, lang, defaultLang)}
                        onChange={(ev) =>
                          updateEnigma(i, {
                            text: setLocalized(e.text as never, lang, ev.target.value, defaultLang),
                          })
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">
                        Good answer points
                      </span>
                      <input
                        value={e.good_answer_points}
                        onChange={(ev) => updateEnigma(i, { good_answer_points: ev.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">
                        Wrong answer points
                      </span>
                      <input
                        value={e.wrong_answer_points}
                        onChange={(ev) => updateEnigma(i, { wrong_answer_points: ev.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>
                  </div>

                  {/* Right: image upload */}
                  <div>
                    <AssetUploadField
                      slot={imageSlot}
                      value={e.good_answer_image ?? ''}
                      onChange={(filename) => updateEnigma(i, { good_answer_image: filename })}
                      previewSize="lg"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
