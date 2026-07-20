/**
 * Frame section - time_background_image, score_background_image,
 * enigmas_header_image, steps_container_image, plus the game-level
 * both-answers / no-answer enigma-outcome images.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 * + mystery-both-answers-no-answer-malus-images.md
 */

import { useTranslation } from 'react-i18next';
import { AssetUploadField } from '../../../shell/components/AssetUploadField';
import { CollapsibleSection } from '../../../shell/components/CollapsibleSection';
import { useScenarioEditor } from '../../../shell/useScenarioEditor';
import { mysteryMediaSlots } from '../mediaSlots';

const KEYS = [
  'time_background_image',
  'score_background_image',
  'enigmas_header_image',
  'steps_container_image',
  'both_answers_image',
  'no_answer_image',
] as const;

export function FrameSection() {
  const { t } = useTranslation();
  const editor = useScenarioEditor();
  const slots = mysteryMediaSlots.filter((s) => (KEYS as readonly string[]).includes(s.key));
  const meta = editor.gameMeta as Record<string, unknown>;

  return (
    <CollapsibleSection title={t('editorMystery:frame.title')}>
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
