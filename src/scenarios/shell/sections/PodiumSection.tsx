/**
 * Podium section — top_1/3/10 image+sound.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { AssetUploadField } from '../components/AssetUploadField';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { useScenarioEditor } from '../useScenarioEditor';
import { commonMediaSlots } from '../commonMediaSlots';

const PODIUM_KEYS = [
  'top_1_image',
  'top_3_image',
  'top_10_image',
  'top_1_sound',
  'top_3_sound',
  'top_10_sound',
] as const;

export function PodiumSection() {
  const editor = useScenarioEditor();
  const slots = commonMediaSlots.filter((s) => (PODIUM_KEYS as readonly string[]).includes(s.key));

  return (
    <CollapsibleSection title="Podium & end-of-game">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {slots.map((slot) => (
          <AssetUploadField
            key={slot.key}
            slot={slot}
            value={String((editor.gameMeta as Record<string, unknown>)[slot.key] ?? '')}
            onChange={(filename) =>
              editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [slot.key]: filename }) as typeof m)
            }
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}
