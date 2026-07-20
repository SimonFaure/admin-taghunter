/**
 * Enigmas section - per-enigma editor.
 *
 * Layout: two columns inside each card. Left column = stacked text inputs
 * (number, question, good points, wrong points). Right column = image
 * upload field for the good-answer image. Each takes 50% of the width.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { Plus, Trash2, MapPin, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useGoEditor } from '../../../shell/components/GoEditorContext';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { getLocalized, setLocalized } from '../../../i18n/getLocalized';
import type { Lang } from '../../../i18n/types';
import type { Enigma } from '../../../../types/scenario-data';
import type { MediaSlot } from '../../../types';
import { useMysteryPatternStations, type SlotStation } from '../useMysteryPatternStations';

// GO short codes are typed by players on a phone, by hand, in any weather - so
// the alphabet excludes the easily-confused characters (I, L, O, 0, 1) and the
// code is short (3 chars). Codes must be unique within a scenario.
const GO_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateShortCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < 3; i++) {
      code += GO_CODE_ALPHABET[Math.floor(Math.random() * GO_CODE_ALPHABET.length)];
    }
    if (!taken.has(code)) return code;
  }
  return '';
}

function normalizeShortCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((ch) => GO_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, 6);
}

/** Shows the station/balise a given answer image is mapped to by the default pattern. */
function StationHint({ station }: { station?: SlotStation }) {
  const { t } = useTranslation();
  if (!station || station.stationId == null) return null;
  return (
    <span className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
      <MapPin className="w-3 h-3 flex-shrink-0 text-gray-400" />
      <span className="font-mono text-gray-600">#{station.stationId}</span>
      <span className="truncate">{station.stationName ?? t('editorMystery:enigmas.unknownStation')}</span>
    </span>
  );
}

function emptyEnigma(): Enigma {
  return {
    number: '',
    // Stage 3: text is `Localized<string>`. New enigmas start with empty map.
    text: {},
    good_answer_image: '',
    wrong_answer_image: '',
    good_answer_points: '',
    wrong_answer_points: '',
  };
}

export function EnigmasSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const { adaptableGo, answerCount } = useGoEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;
  const enigmas = ((editor.gameMeta as Record<string, unknown>).enigmas ?? []) as Enigma[];
  const patternUniqid =
    ((editor.gameMeta as Record<string, unknown>).scenario_default_pattern as
      | string
      | null
      | undefined) ?? null;
  const patternStations = useMysteryPatternStations(patternUniqid);

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

  // Codes currently in use across the scenario - used to keep generated codes
  // unique. Recomputed cheaply on each render.
  function takenCodes(exceptIdx?: number): Set<string> {
    const s = new Set<string>();
    enigmas.forEach((e, i) => {
      if (i !== exceptIdx && e.short_code) s.add(e.short_code);
    });
    return s;
  }

  function regenerateCode(idx: number) {
    updateEnigma(idx, { short_code: generateShortCode(takenCodes(idx)) });
  }

  function generateAllMissingCodes() {
    const taken = takenCodes();
    setEnigmas(
      enigmas.map((e) => {
        if (e.short_code) return e;
        const code = generateShortCode(taken);
        if (code) taken.add(code);
        return { ...e, short_code: code };
      }),
    );
  }

  return (
    <CollapsibleSection
      title={t('editorMystery:enigmas.title')}
      goRelevance="kept"
      headerExtra={
        <div className="flex items-center gap-2">
          {adaptableGo && (
            <button
              onClick={generateAllMissingCodes}
              className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> {t('editorMystery:enigmas.generateMissingCodes')}
            </button>
          )}
          <button
            onClick={addEnigma}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> {t('editorMystery:enigmas.addEnigma')}
          </button>
        </div>
      }
    >
      {enigmas.length === 0 ? (
        <p className="text-sm text-gray-500">{t('editorMystery:enigmas.empty')}</p>
      ) : (
        <div className="space-y-4">
          {enigmas.map((e, i) => {
            const imageSlot: MediaSlot = {
              key: `enigma_${i}_good_answer_image`,
              kind: 'image',
              required: false,
              scope: 'type',
              label: t('editorMystery:enigmas.goodAnswerImage'),
            };
            const wrongImageSlot: MediaSlot = {
              key: `enigma_${i}_wrong_answer_image`,
              kind: 'image',
              required: false,
              scope: 'type',
              label: t('editorMystery:enigmas.wrongAnswerImage'),
            };
            // Pattern rows are keyed by item_index, matched at runtime against
            // the enigma's `number`; fall back to position (1-based) when blank.
            const enigmaKey = Number(e.number) || i + 1;
            const stations = patternStations[enigmaKey];
            return (
              <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">
                    {t('editorMystery:enigmas.enigmaLabel', { number: e.number || i + 1 })}
                  </h3>
                  <button
                    onClick={() => removeEnigma(i)}
                    className="p-1.5 hover:bg-red-50 rounded text-red-500"
                    aria-label={t('editorMystery:enigmas.removeEnigma')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: stacked inputs */}
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">{t('editorMystery:enigmas.number')}</span>
                      <input
                        value={e.number}
                        onChange={(ev) => updateEnigma(i, { number: ev.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>

                    {adaptableGo && (
                      <label className="block">
                        <span className="text-xs font-medium text-gray-700 mb-1 block">
                          {t('editorMystery:enigmas.goShortCode')}
                        </span>
                        <div className="flex gap-2">
                          <input
                            value={e.short_code ?? ''}
                            onChange={(ev) =>
                              updateEnigma(i, { short_code: normalizeShortCode(ev.target.value) })
                            }
                            placeholder={t('editorMystery:enigmas.shortCodePlaceholder')}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white font-mono uppercase tracking-widest"
                          />
                          <button
                            type="button"
                            onClick={() => regenerateCode(i)}
                            title={t('editorMystery:enigmas.generateUniqueCode')}
                            className="px-2 py-1.5 border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </div>
                      </label>
                    )}

                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">
                        {t('editorMystery:enigmas.questionText', { lang })}
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
                        {t('editorMystery:enigmas.goodAnswerPoints')}
                      </span>
                      <input
                        value={e.good_answer_points}
                        onChange={(ev) => updateEnigma(i, { good_answer_points: ev.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">
                        {t('editorMystery:enigmas.wrongAnswerPoints')}
                      </span>
                      <input
                        value={e.wrong_answer_points}
                        onChange={(ev) => updateEnigma(i, { wrong_answer_points: ev.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>
                  </div>

                  {/* Right: good + wrong answer image uploads */}
                  <div className="space-y-3">
                    <div>
                      <AssetUploadField
                        slot={imageSlot}
                        value={e.good_answer_image ?? ''}
                        onChange={(filename) => updateEnigma(i, { good_answer_image: filename })}
                        previewSize="lg"
                      />
                      <StationHint station={stations?.good_answer_station} />
                    </div>
                    <div>
                      <AssetUploadField
                        slot={wrongImageSlot}
                        value={e.wrong_answer_image ?? ''}
                        onChange={(filename) => updateEnigma(i, { wrong_answer_image: filename })}
                        previewSize="lg"
                      />
                      <StationHint station={stations?.wrong_answer_station} />
                    </div>
                    {adaptableGo && answerCount === 4 && (
                      <>
                        <AssetUploadField
                          slot={{
                            key: `enigma_${i}_wrong_answer_image_2`,
                            kind: 'image',
                            required: false,
                            scope: 'type',
                            label: t('editorMystery:enigmas.wrongAnswerImage2'),
                          }}
                          value={e.wrong_answer_image_2 ?? ''}
                          onChange={(filename) => updateEnigma(i, { wrong_answer_image_2: filename })}
                          previewSize="lg"
                        />
                        <AssetUploadField
                          slot={{
                            key: `enigma_${i}_wrong_answer_image_3`,
                            kind: 'image',
                            required: false,
                            scope: 'type',
                            label: t('editorMystery:enigmas.wrongAnswerImage3'),
                          }}
                          value={e.wrong_answer_image_3 ?? ''}
                          onChange={(filename) => updateEnigma(i, { wrong_answer_image_3: filename })}
                          previewSize="lg"
                        />
                      </>
                    )}
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
