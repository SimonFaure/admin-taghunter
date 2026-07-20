/**
 * Feedback images section - full-screen cue images shown at scoring time:
 * `wrong_order_image` on an itinerary wrong-order break and
 * `missing_checkpoint_image` on a run that reached no checkpoints. Ported from
 * the legacy maximus "Images" group (wrong_order_image / absent_image).
 */

import { useTranslation } from 'react-i18next';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { tracksMediaSlots } from '../mediaSlots';

const KEYS = ['wrong_order_image', 'missing_checkpoint_image'] as const;

export function FeedbackImagesSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const slots = tracksMediaSlots.filter((s) => (KEYS as readonly string[]).includes(s.key));
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title={t('editorTracks:feedbackImages.sectionTitle')}>
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
