/**
 * Tagquest sounds section — success_sound, cheating_sound, malus_sound,
 * late_malus_sound. Top-podium sounds live in the shell's PodiumSection.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { tagquestMediaSlots } from '../mediaSlots';

export function TagquestSoundsSection() {
  const editor = useScenarioEditor();
  const soundSlots = tagquestMediaSlots.filter((s) => s.kind === 'sound');
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title="Tagquest sounds">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {soundSlots.map((slot) => (
          <AssetUploadField
            key={slot.key}
            slot={slot}
            value={String(meta[slot.key] ?? '')}
            onChange={(filename) =>
              editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [slot.key]: filename }) as typeof m)
            }
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}