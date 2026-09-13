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

// Where the coloured fill starts and stops inside the gauge artwork. These used
// to be hard-coded px values derived from the stage height, which never lined up
// with an author's own gauge - visibly so on the left edge (retour #31). Blank
// keeps the historical value, so untouched scenarios don't move.
// The level icons + the player icon read the same numbers, so the whole gauge
// stays internally consistent when they are changed.
const FILL_FIELDS = [
  { key: 'gauge_fill_inset_left', labelKey: 'editorMystery:gauge.fillInsetLeft', placeholder: 'auto' },
  { key: 'gauge_fill_inset_right', labelKey: 'editorMystery:gauge.fillInsetRight', placeholder: 'auto' },
  { key: 'gauge_fill_inset_y', labelKey: 'editorMystery:gauge.fillInsetY', placeholder: 'auto' },
  { key: 'gauge_fill_radius', labelKey: 'editorMystery:gauge.fillRadius', placeholder: '6' },
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

      <div className="mt-4">
        <span className="text-xs font-medium text-gray-700 mb-1 block">
          {t('editorMystery:gauge.fillGeometry')}
        </span>
        <p className="text-[11px] text-gray-500 mb-2">{t('editorMystery:gauge.fillGeometryHint')}</p>
        {/* The same four values can be dragged on the real gauge in the in-game
            layout editor ("Jauge" tab) - typing them blind here is what retour
            #31 complained about. Both write the same game_meta fields. */}
        <p className="text-[11px] text-blue-600 mb-2">{t('editorMystery:gauge.fillGeometryLayoutHint')}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FILL_FIELDS.map(({ key, labelKey, placeholder }) => (
            <label key={key} className="block">
              <span className="text-xs font-medium text-gray-700 mb-1 block">{t(labelKey)}</span>
              <input
                type="text"
                inputMode="decimal"
                value={String(meta[key] ?? '')}
                placeholder={placeholder}
                onChange={(e) =>
                  editor.setGameMeta(
                    (m) => ({ ...(m as Record<string, unknown>), [key]: e.target.value }) as typeof m,
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </label>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}
