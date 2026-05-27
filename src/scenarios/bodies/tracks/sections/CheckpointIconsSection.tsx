/**
 * Checkpoint icons section — mode toggle (per-checkpoint vs common) +
 * common-icon picker (only shown when mode=common) + on-map size percentage.
 *
 * Legacy fields: `checkpoints_unique_image` (boolean 0/1),
 * `checkpoints_unique_image_id` (media id), `checkpoint_image_width_percentage`.
 */

import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { tracksMediaSlots } from '../mediaSlots';

export function CheckpointIconsSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const mode: 'per_checkpoint' | 'common' = meta.checkpoints_unique_image ? 'common' : 'per_checkpoint';
  const commonSlot = tracksMediaSlots.find((s) => s.key === 'checkpoints_unique_image_id');

  function setMode(next: 'per_checkpoint' | 'common') {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          checkpoints_unique_image: next === 'common',
        }) as typeof m,
    );
  }

  function setCommonImage(filename: string) {
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), checkpoints_unique_image_id: filename }) as typeof m,
    );
  }

  function setSizePercent(value: string) {
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), checkpoint_image_width_percentage: value }) as typeof m,
    );
  }

  return (
    <CollapsibleSection title="Checkpoint icons">
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="checkpoint-icons-mode"
              checked={mode === 'per_checkpoint'}
              onChange={() => setMode('per_checkpoint')}
            />
            Per checkpoint (each has its own icon)
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="checkpoint-icons-mode"
              checked={mode === 'common'}
              onChange={() => setMode('common')}
            />
            Common (all checkpoints share one icon)
          </label>
        </div>

        {mode === 'common' && commonSlot && (
          <AssetUploadField
            slot={commonSlot}
            value={String(meta.checkpoints_unique_image_id ?? '')}
            onChange={setCommonImage}
          />
        )}

        <label className="block">
          <span className="text-xs font-medium text-gray-700 mb-1 block">
            Icon size on map (% of map width)
          </span>
          <input
            type="number"
            min={1}
            max={20}
            step={0.5}
            value={String(meta.checkpoint_image_width_percentage ?? '3')}
            onChange={(ev) => setSizePercent(ev.target.value)}
            className="w-32 px-2 py-1.5 border border-gray-300 rounded-md text-sm bg-white"
          />
        </label>
      </div>
    </CollapsibleSection>
  );
}
