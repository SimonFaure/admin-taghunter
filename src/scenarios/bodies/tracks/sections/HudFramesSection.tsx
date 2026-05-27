/**
 * HUD frames section — background frames for the 4 in-play HUD elements
 * (team name, timer, score, time). Positions/sizes live in the layout editor
 * (scenarios.scenario_layout column), NOT here.
 */

import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { tracksMediaSlots } from '../mediaSlots';

const KEYS = [
  'team_name_background_image',
  'timer_background_image',
  'score_background_image',
  'time_background_image',
] as const;

export function HudFramesSection() {
  const editor = useScenarioEditor();
  const slots = tracksMediaSlots.filter((s) => (KEYS as readonly string[]).includes(s.key));
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title="HUD frames">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {slots.map((slot) => (
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
