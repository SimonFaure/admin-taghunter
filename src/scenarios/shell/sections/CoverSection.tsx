/**
 * Cover section — background_image, game_visual.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { AssetUploadField } from '../components/AssetUploadField';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { useScenarioEditor } from '../useScenarioEditor';
import { commonMediaSlots } from '../commonMediaSlots';

const COVER_KEYS = ['background_image', 'game_visual', 'scenario_video'] as const;

export function CoverSection() {
  const editor = useScenarioEditor();
  const slots = commonMediaSlots.filter((s) => (COVER_KEYS as readonly string[]).includes(s.key));

  return (
    <CollapsibleSection title="Cover & background">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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