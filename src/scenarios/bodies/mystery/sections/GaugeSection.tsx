/**
 * Gauge section — levels_gauge_* image slots + the gauge_filling CSS gradient
 * string.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { mysteryMediaSlots } from '../mediaSlots';

const KEYS = [
  'levels_gauge_image',
  'levels_gauge_image_with_content',
  'levels_gauge_player_icon_image',
  'levels_gauge_level_icon_image',
] as const;

export function GaugeSection() {
  const editor = useScenarioEditor();
  const slots = mysteryMediaSlots.filter((s) => (KEYS as readonly string[]).includes(s.key));
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title="Levels gauge">
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
      <label className="block mt-4">
        <span className="text-xs font-medium text-gray-700 mb-1 block">Gauge filling (CSS gradient)</span>
        <textarea
          value={String(meta.gauge_filling ?? '')}
          onChange={(e) =>
            editor.setGameMeta(
              (m) => ({ ...(m as Record<string, unknown>), gauge_filling: e.target.value }) as typeof m,
            )
          }
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-xs font-mono"
        />
      </label>
    </CollapsibleSection>
  );
}
