/**
 * Cover section - background_image, game_visual.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import { useTranslation } from 'react-i18next';
import { AssetUploadField } from '../components/AssetUploadField';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { useScenarioEditor } from '../useScenarioEditor';
import { commonMediaSlots } from '../commonMediaSlots';
import type { MediaSlot } from '../../types';

const COVER_KEYS = ['background_image', 'game_visual', 'scenario_video'] as const;

// Tracks places its checkpoints on top of a background map; the map field lives
// here alongside the cover/background so all the full-scene backdrops are in one
// place. `map_image` is part of the tracks adapter manifest (tracksMediaSlots),
// so uploads resolve correctly - this slot literal only drives the field UI.
const TRACKS_MAP_SLOT: MediaSlot = {
  key: 'map_image',
  kind: 'image',
  required: 'error',
  scope: 'type',
  label: 'Map image',
};

export function CoverSection() {
  const { t } = useTranslation('editorSections1');
  const editor = useScenarioEditor();
  const slots = commonMediaSlots.filter((s) => (COVER_KEYS as readonly string[]).includes(s.key));
  const isTracks = editor.gameType === 'tracks';
  const meta = editor.gameMeta as Record<string, unknown>;
  const tracksMapSlot: MediaSlot = { ...TRACKS_MAP_SLOT, label: t('cover.mapImage') };

  return (
    <CollapsibleSection title={isTracks ? t('cover.sectionTitleTracks') : t('cover.sectionTitle')}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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

      {isTracks && (
        <div className="mt-4">
          <AssetUploadField
            slot={tracksMapSlot}
            value={String(meta.map_image ?? '')}
            onChange={(filename) =>
              editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), map_image: filename }) as typeof m)
            }
            previewSize="lg"
          />
        </div>
      )}
    </CollapsibleSection>
  );
}