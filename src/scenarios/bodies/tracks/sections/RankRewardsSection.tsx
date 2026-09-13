/**
 * Rank rewards section - the full-screen image and the sound played at the end
 * of a run when the team lands in the top 1 / top 3 / top 10.
 *
 * These fields have always existed in the data (legacy `maximus` shipped them
 * and the ZIP importer carries them in) and the playground runtime has always
 * played them - but nothing in the editor showed them, so an imported scenario
 * could fire an applause the author could neither locate nor switch off
 * (retours point 94). Leaving a slot empty simply skips that reward.
 */

import { useTranslation } from 'react-i18next';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { tracksMediaSlots } from '../mediaSlots';

const KEYS = [
  'top_1_image',
  'top_1_sound',
  'top_3_image',
  'top_3_sound',
  'top_10_image',
  'top_10_sound',
] as const;

export function RankRewardsSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as Record<string, unknown>;
  // Ordered by KEYS (image + sound per tier), not by the mediaSlots order.
  const slots = KEYS.map((k) => tracksMediaSlots.find((s) => s.key === k)).filter(
    (s): s is (typeof tracksMediaSlots)[number] => !!s,
  );

  return (
    <CollapsibleSection title={t('editorTracks:rankRewards.sectionTitle')}>
      <p className="text-xs text-gray-500 mb-3">{t('editorTracks:rankRewards.hint')}</p>
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
