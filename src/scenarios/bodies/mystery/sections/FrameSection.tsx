/**
 * Frame section - time_background_image, score_background_image,
 * team_name_background_image, enigmas_header_image, steps_container_image, plus
 * the game-level both-answers / no-answer enigma-outcome images, and the
 * geometry of the coloured result sub-frame drawn on every enigma tile.
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
  'team_name_background_image',
  'enigmas_header_image',
  'steps_container_image',
  'both_answers_image',
  'no_answer_image',
] as const;

// Geometry of the coloured plate ("sous-cadre") the board draws on each enigma
// tile to show its result. Blank keeps the built-in look:
//   status_frame_scale      - % of the tile the plate covers. Frame images with
//                             irregular or transparent edges left the full-size
//                             plate sticking out (retour #85); shrink it here.
//   status_frame_radius     - corner rounding, % of the tile. Blank = the
//                             historical 12 px / 4 px.
//   status_frame_over_image - how much of the tint is repeated OVER the artwork,
//                             % of the plate colour. Needed because a picture
//                             exported on an opaque background hides a plate
//                             drawn only behind it - a wrong answer read white
//                             instead of red (retour #83). 0 disables it.
const STATUS_FRAME_FIELDS = [
  { key: 'status_frame_scale', labelKey: 'editorMystery:frame.statusFrameScale', placeholder: '100' },
  { key: 'status_frame_radius', labelKey: 'editorMystery:frame.statusFrameRadius', placeholder: 'auto' },
  { key: 'status_frame_over_image', labelKey: 'editorMystery:frame.statusFrameOver', placeholder: '60' },
] as const;

// `enigma_underlay_scale` - the size of the square cell the main enigma image
// sits on - is NOT here. It is a geometry value, so it lives in the in-game
// layout editor's "Image" mode where it is dragged on the real board
// (MysteryIngameLayoutModal); typing it blind into this form was the complaint.

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

      <div className="mt-4">
        <span className="text-xs font-medium text-gray-700 mb-1 block">
          {t('editorMystery:frame.statusFrame')}
        </span>
        <p className="text-[11px] text-gray-500 mb-2">{t('editorMystery:frame.statusFrameHint')}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {STATUS_FRAME_FIELDS.map(({ key, labelKey, placeholder }) => (
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
