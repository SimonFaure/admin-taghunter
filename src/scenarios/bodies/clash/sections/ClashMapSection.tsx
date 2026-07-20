/**
 * Clash map & dashboard section (V2) - the territory map image plus the
 * optional dashboard chrome frames (ranking, territory-name, gauge, event,
 * timer, separator). Frames fall back to default styling when unset.
 *
 * Territory anchors (banner + name/gauge) and custom map text are placed in the
 * Layout editor (button in the save bar), which writes scenarios.scenario_layout.
 *
 * Design: project_clash_game_type_design (V2).
 */

import { useTranslation } from 'react-i18next';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { clashMediaSlots, clashFrameSlots } from '../mediaSlots';

const MAP_SLOT = clashMediaSlots.find((s) => s.key === 'map_image')!;

export function ClashMapSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;

  function setField(key: string, value: unknown) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: value }) as typeof m);
  }

  return (
    <CollapsibleSection title={t('editorClash:map.title')}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AssetUploadField
          slot={MAP_SLOT}
          value={String(meta.map_image ?? '')}
          onChange={(filename) => setField('map_image', filename)}
        />
      </div>

      <p className="text-xs text-gray-500 mt-3">
        {t('editorClash:map.positionHint')}
      </p>

      <div className="mt-4">
        <span className="text-xs font-medium text-gray-700 mb-1 block">
          {t('editorClash:map.framesLabel')}
        </span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {clashFrameSlots.map((slot) => (
            <AssetUploadField
              key={slot.key}
              slot={slot}
              value={String(meta[slot.key] ?? '')}
              onChange={(filename) => setField(slot.key, filename)}
            />
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}
