/**
 * "The Purge" section - the purge marker image + the game-wide purge sound.
 *
 * Both fields are OPTIONAL with no publish gate, but there is deliberately no
 * built-in fallback image: a scenario without a purge image has the purge
 * feature disabled in the playground launch modal. The image doubles as the
 * on-map target marker (positioned per territory in the Layout editor) and the
 * ranking-panel purge token.
 *
 * Design: project_clash_purge_feature (grill-me decision record).
 */

import { useTranslation } from 'react-i18next';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { clashPurgeSlots } from '../mediaSlots';

export function ClashPurgeSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;

  function setField(key: string, value: unknown) {
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: value }) as typeof m);
  }

  return (
    <CollapsibleSection title={t('editorClash:purge.title')}>
      <p className="text-xs text-gray-500 mb-3">
        {t('editorClash:purge.hint')}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {clashPurgeSlots.map((slot) => (
          <AssetUploadField
            key={slot.key}
            slot={slot}
            value={String(meta[slot.key] ?? '')}
            onChange={(filename) => setField(slot.key, filename)}
          />
        ))}
      </div>
      <p className="text-xs text-amber-600 mt-3">
        {t('editorClash:purge.warning')}
      </p>
    </CollapsibleSection>
  );
}
