/**
 * Gauge section - levels_gauge_* image slots + the gauge_filling CSS gradient.
 *
 * The gauge_filling editor is a visual `<GradientBuilder>` (color stops with
 * alpha + position sliders). It falls back to a raw-CSS textarea when the
 * incoming value can't be parsed.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useTranslation } from 'react-i18next';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { mysteryMediaSlots } from '../mediaSlots';
import { GradientBuilder } from './GradientBuilder';

const KEYS = [
  'levels_gauge_image',
  'levels_gauge_image_with_content',
  'levels_gauge_player_icon_image',
  'levels_gauge_level_icon_image',
] as const;

export function GaugeSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const slots = mysteryMediaSlots.filter((s) => (KEYS as readonly string[]).includes(s.key));
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title={t('editorMystery:gauge.title')}>
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
      <div className="mt-4">
        <span className="text-xs font-medium text-gray-700 mb-2 block">{t('editorMystery:gauge.gaugeFilling')}</span>
        <GradientBuilder
          value={String(meta.gauge_filling ?? '')}
          onChange={(next) =>
            editor.setGameMeta(
              (m) => ({ ...(m as Record<string, unknown>), gauge_filling: next }) as typeof m,
            )
          }
        />
      </div>
    </CollapsibleSection>
  );
}
