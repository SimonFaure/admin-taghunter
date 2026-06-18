/**
 * Overscores section — gated by capabilities.hasOverscores (mystery only).
 *
 * Layout mirrors EnigmasSection: each overscore is a labeled card with a
 * left column of stacked text inputs (step, score, name) and a right column
 * with a large image upload field.
 *
 * Slice 3B: `name_overscore_step` is `Localized<string>`; the other three
 * fields stay scalar.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('editorSections2');
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
      title={t('overscores.title')}
      headerExtra={
        <button
          onClick={addOverscore}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> {t('overscores.addOverscore')}
        </button>
      }
    >
      {overscores.length === 0 ? (
        <p className="text-sm text-gray-500">{t('overscores.empty')}</p>
      ) : (
        <div className="space-y-4">
          {overscores.map((o, i) => {
            const imageSlot: MediaSlot = {
              key: `overscore_${i}_image_overscore_step`,
              kind: 'image',
              required: false,
              scope: 'type',
              label: t('overscores.imageLabel'),
            };
            return (
              <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {t('overscores.overscoreHeading', { label: o.overscore_step || i + 1 })}
                  </h3>
                  <button
                    onClick={() => removeOverscore(i)}
                    className="p-1.5 hover:bg-red-50 rounded text-red-500"
                    aria-label={t('overscores.removeOverscore')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: stacked inputs */}
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">{t('overscores.step')}</span>
                      <input
                        value={o.overscore_step}
                        onChange={(e) => updateOverscore(i, { overscore_step: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">{t('overscores.score')}</span>
                      <input
                        value={o.overscore_score}
                        onChange={(e) => updateOverscore(i, { overscore_score: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">
                        {t('overscores.name', { lang })}
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
                  </div>

                  {/* Right: image upload */}
                  <div>
                    <AssetUploadField
                      slot={imageSlot}
                      value={o.image_overscore_step ?? ''}
                      onChange={(filename) => updateOverscore(i, { image_overscore_step: filename })}
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
