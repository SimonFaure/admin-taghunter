/**
 * Map section — the background map image checkpoints are positioned on top of.
 * Renamed from legacy `main_enigma_image`.
 */

import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { tracksMediaSlots } from '../mediaSlots';

export function MapSection() {
  const editor = useScenarioEditor();
  const slot = tracksMediaSlots.find((s) => s.key === 'map_image');
  if (!slot) return null;
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title="Map">
      <AssetUploadField
        slot={slot}
        value={String(meta.map_image ?? '')}
        onChange={(filename) =>
          editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), map_image: filename }) as typeof m)
        }
        previewSize="lg"
      />
    </CollapsibleSection>
  );
}
