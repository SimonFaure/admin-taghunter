/**
 * Checkpoints section - per-checkpoint editor.
 *
 * Each row: title (Localized), description (Localized), points, and image
 * picker (only shown when `checkpoints_unique_image` is false). Order =
 * checkpoint number. Positions are NOT edited here - they're placed
 * visually in the LayoutEditor and saved back to game_meta.checkpoints[].position.
 */

import { Plus, Trash2, ChevronUp, ChevronDown, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { getLocalized, setLocalized } from '../../../i18n/getLocalized';
import type { Lang } from '../../../i18n/types';
import type { Checkpoint } from '../../../../types/scenario-data';
import type { MediaSlot } from '../../../types';
import { tracksMediaSlots } from '../mediaSlots';
import { useTracksPatternStations } from '../useTracksPatternStations';

function newCheckpoint(): Checkpoint {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: {},
    description: {},
    image: '',
    position: { top: 50, left: 50 },
    points: 1,
  };
}

export function CheckpointsSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;
  const meta = editor.gameMeta as Record<string, unknown>;
  const checkpoints = (meta.checkpoints ?? []) as Checkpoint[];
  const commonMode = !!meta.checkpoints_unique_image;
  const commonSlot = tracksMediaSlots.find((s) => s.key === 'checkpoints_unique_image_id');

  // Per-checkpoint station correspondences from the selected default pattern.
  // Index i maps to checkpoint at position i (see useTracksPatternStations).
  const patternUniqid = (meta.scenario_default_pattern as string | null | undefined) ?? null;
  const patternStations = useTracksPatternStations(patternUniqid);

  function setCheckpoints(next: Checkpoint[]) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), checkpoints: next }) as typeof m);
  }

  function setIconMode(next: 'per_checkpoint' | 'common') {
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), checkpoints_unique_image: next === 'common' }) as typeof m,
    );
  }

  function setCommonImage(filename: string) {
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), checkpoints_unique_image_id: filename }) as typeof m,
    );
  }

  function addCheckpoint() {
    setCheckpoints([...checkpoints, newCheckpoint()]);
  }

  function removeCheckpoint(idx: number) {
    setCheckpoints(checkpoints.filter((_, i) => i !== idx));
  }

  function updateCheckpoint(idx: number, patch: Partial<Checkpoint>) {
    setCheckpoints(checkpoints.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function moveCheckpoint(idx: number, direction: -1 | 1) {
    const target = idx + direction;
    if (target < 0 || target >= checkpoints.length) return;
    const next = [...checkpoints];
    [next[idx], next[target]] = [next[target], next[idx]];
    setCheckpoints(next);
  }

  return (
    <CollapsibleSection
      title={t('editorTracks:checkpoints.sectionTitle', { count: checkpoints.length })}
      headerExtra={
        <button
          onClick={addCheckpoint}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> {t('editorTracks:checkpoints.addCheckpoint')}
        </button>
      }
    >
      <div className="mb-4 space-y-3 border-b border-gray-200 pb-4">
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="checkpoint-icons-mode"
              checked={!commonMode}
              onChange={() => setIconMode('per_checkpoint')}
            />
            {t('editorTracks:checkpoints.perCheckpoint')}
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="checkpoint-icons-mode"
              checked={commonMode}
              onChange={() => setIconMode('common')}
            />
            {t('editorTracks:checkpoints.common')}
          </label>
        </div>

        {commonMode && commonSlot && (
          <AssetUploadField
            slot={commonSlot}
            value={String(meta.checkpoints_unique_image_id ?? '')}
            onChange={setCommonImage}
          />
        )}
      </div>

      {checkpoints.length === 0 ? (
        <p className="text-sm text-gray-500">{t('editorTracks:checkpoints.none')}</p>
      ) : (
        <div className="space-y-4">
          {checkpoints.map((c, i) => {
            const imageSlot: MediaSlot = {
              key: `checkpoint_${i}_image`,
              kind: 'image',
              required: false,
              scope: 'type',
              label: t('editorTracks:checkpoints.checkpointImage'),
            };
            return (
              <div key={c.id ?? i} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900">{t('editorTracks:checkpoints.checkpointN', { number: i + 1 })}</h3>
                    {patternUniqid && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-gray-500">
                        <MapPin className="w-3 h-3 flex-shrink-0 text-gray-400" />
                        {patternStations[i] && patternStations[i].stationId != null ? (
                          <>
                            <span className="font-mono text-gray-600">#{patternStations[i].stationId}</span>
                            <span className="truncate">
                              {patternStations[i].stationName ?? t('editorTracks:checkpoints.unknownStation')}
                            </span>
                          </>
                        ) : (
                          <span className="italic text-gray-400">{t('editorTracks:checkpoints.noStationAssigned')}</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveCheckpoint(i, -1)}
                      disabled={i === 0}
                      className="p-1.5 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-30"
                      aria-label={t('editorTracks:checkpoints.moveUp')}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveCheckpoint(i, 1)}
                      disabled={i === checkpoints.length - 1}
                      className="p-1.5 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-30"
                      aria-label={t('editorTracks:checkpoints.moveDown')}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeCheckpoint(i)}
                      className="p-1.5 hover:bg-red-50 rounded text-red-500"
                      aria-label={t('editorTracks:checkpoints.removeCheckpoint')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">
                        {t('editorTracks:checkpoints.titleLabel', { lang })}
                      </span>
                      <input
                        value={getLocalized(c.title as never, lang, defaultLang)}
                        onChange={(ev) =>
                          updateCheckpoint(i, {
                            title: setLocalized(c.title as never, lang, ev.target.value, defaultLang),
                          })
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">
                        {t('editorTracks:checkpoints.descriptionLabel', { lang })}
                      </span>
                      <textarea
                        rows={3}
                        value={getLocalized(c.description as never, lang, defaultLang)}
                        onChange={(ev) =>
                          updateCheckpoint(i, {
                            description: setLocalized(
                              c.description as never,
                              lang,
                              ev.target.value,
                              defaultLang,
                            ),
                          })
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white resize-y"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-gray-700 mb-1 block">{t('editorTracks:checkpoints.points')}</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={c.points ?? 1}
                        onChange={(ev) =>
                          updateCheckpoint(i, { points: Number(ev.target.value) })
                        }
                        className="w-32 px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
                      />
                    </label>
                  </div>

                  {!commonMode && (
                    <div>
                      <AssetUploadField
                        slot={imageSlot}
                        value={c.image ?? ''}
                        onChange={(filename) => updateCheckpoint(i, { image: filename })}
                        previewSize="lg"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
