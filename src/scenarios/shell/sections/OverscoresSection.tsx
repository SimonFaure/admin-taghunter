/**
 * Overscores section — gated by capabilities.hasOverscores (mystery only).
 *
 * Each overscore is a labeled card with an AssetUploadField for the step
 * image (thumbnail when set, drop-zone when not).
 *
 * Slice 3B: `name_overscore_step` is `Localized<string>`; the other three
 * fields stay scalar.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import { Plus, Trash2 } from 'lucide-react';
import { useScenarioEditor } from '../useScenarioEditor';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { AssetUploadField } from '../components/AssetUploadField';
import { getLocalized, setLocalized } from '../../i18n/getLocalized';
import type { Lang, Localized } from '../../i18n/types';
import type { MediaSlot } from '../../types';

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
        <div className="space-y-4">
          {overscores.map((o, i) => {
            const imageSlot: MediaSlot = {
              key: `overscore_${i}_image_overscore_step`,
              kind: 'image',
              required: false,
              scope: 'type',
              label: 'Overscore image',
            };
            return (
              <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Overscore {o.overscore_step || i + 1}
                  </h3>
                  <button
                    onClick={() => removeOverscore(i)}
                    className="p-1.5 hover:bg-red-50 rounded text-red-500"
                    aria-label="Remove overscore"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <label className="md:col-span-2 block">
                    <span className="text-xs font-medium text-gray-700 mb-1 block">Step</span>
                    <input
                      value={o.overscore_step}
                      onChange={(e) => updateOverscore(i, { overscore_step: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                    />
                  </label>

                  <label className="md:col-span-2 block">
                    <span className="text-xs font-medium text-gray-700 mb-1 block">Score</span>
                    <input
                      value={o.overscore_score}
                      onChange={(e) => updateOverscore(i, { overscore_score: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                    />
                  </label>

                  <label className="md:col-span-8 block">
                    <span className="text-xs font-medium text-gray-700 mb-1 block">
                      Name ({lang})
                    </span>
                    <input
                      value={getLocalized(o.name_overscore_step as never, lang, defaultLang)}
                      onChange={(e) =>
                        updateOverscore(i, {
                          name_overscore_step: setLocalized(
                            o.name_overscore_step as never,
                            lang,
                            e.target.value,
                            defaultLang,
                          ),
                        })
                      }
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                    />
                  </label>

                  <div className="md:col-span-6">
                    <AssetUploadField
                      slot={imageSlot}
                      value={o.image_overscore_step ?? ''}
                      onChange={(filename) => updateOverscore(i, { image_overscore_step: filename })}
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
