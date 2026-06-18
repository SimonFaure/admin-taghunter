/**
 * Enigma timing section — enigma sound slots (success / error / no_answer).
 * (animation_enigma_duration moved to the shared Timing section.)
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { mysteryMediaSlots } from '../mediaSlots';

const SOUND_KEYS = ['enigma_success', 'enigma_error', 'enigma_no_answer'] as const;

export function EnigmaTimingSection() {
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  const soundSlots = mysteryMediaSlots.filter((s) => (SOUND_KEYS as readonly string[]).includes(s.key));

  return (
    <CollapsibleSection title="Enigma sounds">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
