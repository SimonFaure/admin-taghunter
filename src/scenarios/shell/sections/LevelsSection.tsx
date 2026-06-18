/**
 * Levels section — gated by capabilities.hasLevels (mystery + tagquest).
 *
 * Each level is a labeled row: name (translatable), points (scalar), and
 * description (translatable).
 *
 * Mystery 'level' = enigma difficulty band; Tagquest 'level' = team
 * progression milestone. Same data shape; section copy is neutral.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 3 section)
 */

import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('editorSections2');
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
      title={t('levels.title')}
      headerExtra={
        <button
          onClick={addLevel}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> {t('levels.addLevel')}
        </button>
      }
    >
      {keys.length === 0 ? (
        <p className="text-sm text-gray-500">{t('levels.empty')}</p>
      ) : (
        <div className="space-y-4">
          {keys.map((k) => {
            const lvl = levels[k] ?? { name: {}, points: '', description: {} };
            return (
              <div key={k} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">{t('levels.levelHeading', { key: k })}</h3>
                  <button
                    onClick={() => removeLevel(k)}
                    className="p-1.5 hover:bg-red-50 rounded text-red-500"
                    aria-label={t('levels.removeLevel')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <label className="md:col-span-7 block">
                    <span className="text-xs font-medium text-gray-700 mb-1 block">
                      {t('levels.name', { lang })}
                    </span>
                    <input
                      value={getLocalized(lvl.name as never, lang, defaultLang)}
                      onChange={(e) =>
                        updateLevel(k, {
                          name: setLocalized(lvl.name as never, lang, e.target.value, defaultLang),
                        })
                      }
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                    />
                  </label>

                  <label className="md:col-span-5 block">
                    <span className="text-xs font-medium text-gray-700 mb-1 block">{t('levels.points')}</span>
                    <input
                      value={lvl.points ?? ''}
                      onChange={(e) => updateLevel(k, { points: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                    />
                  </label>

                  <label className="md:col-span-12 block">
                    <span className="text-xs font-medium text-gray-700 mb-1 block">
                      {t('levels.description', { lang })}
                    </span>
                    <textarea
                      rows={2}
                      value={getLocalized(lvl.description as never, lang, defaultLang)}
                      onChange={(e) =>
                        updateLevel(k, {
                          description: setLocalized(
                            lvl.description as never,
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
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
