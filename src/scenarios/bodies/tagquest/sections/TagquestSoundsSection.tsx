/**
 * Tagquest sounds section - cheating_sound, malus_sound, late_malus_sound
 * (plus the shared final_image_sound slot). Each is played by one identified
 * event in the playground; the former global success_sound had none and was
 * retired.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useTranslation } from 'react-i18next';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { tagquestMediaSlots } from '../mediaSlots';

export function TagquestSoundsSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const soundSlots = tagquestMediaSlots.filter((s) => s.kind === 'sound');
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title={t('editorTagquest:sounds.sectionTitle')}>
      <p className="mb-3 text-xs text-gray-500">{t('editorTagquest:sounds.hint')}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {soundSlots.map((slot) => (
          <div key={slot.key}>
            <AssetUploadField
              slot={slot}
              value={String(meta[slot.key] ?? '')}
              onChange={(filename) =>
                editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [slot.key]: filename }) as typeof m)
              }
            />
            {/* Each slot says which event fires it - same reasoning as the UI
                text strings (#6): an author can't guess a trigger. */}
            <p className="mt-1 text-xs text-gray-500">
              {t(`editorTagquest:sounds.triggers.${slot.key}`, { defaultValue: '' })}
            </p>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}