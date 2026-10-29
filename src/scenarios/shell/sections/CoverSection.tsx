/**
 * Cover section - two groups: images (background_image, game_visual and its
 * language versions, the tracks map) and the scenario video with its subtitles.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Film, Image as ImageIcon, type LucideIcon } from 'lucide-react';
import { AssetUploadField } from '../components/AssetUploadField';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { GameVisualLanguages } from '../components/GameVisualLanguages';
import { ScenarioVideoPlayer, ScenarioVideoSubtitles } from '../components/ScenarioVideoSubtitles';
import { useScenarioEditor } from '../useScenarioEditor';
import { commonMediaSlots } from '../commonMediaSlots';
import type { MediaSlot } from '../../types';

const COVER_KEYS = ['background_image', 'game_visual', 'scenario_video'] as const;

// Retours #49 - Clash never draws `background_image`: its full-bleed surface IS
// the territory map (`map_image`), and the only other place a scenario visual
// shows is the registration screen, which uses `game_visual`. The field was pure
// noise for the author, so it is not offered for this game type. Legacy values
// still travel through the adapter's media partition (see clashImageFields).
const CLASH_OMITTED_COVER_KEYS = new Set<string>(['background_image']);

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
  const isClash = editor.gameType === 'clash';
  const slots = commonMediaSlots.filter(
    (s) =>
      (COVER_KEYS as readonly string[]).includes(s.key) &&
      !(isClash && CLASH_OMITTED_COVER_KEYS.has(s.key)),
  );
  const isTracks = editor.gameType === 'tracks';
  const meta = editor.gameMeta as Record<string, unknown>;
  const tracksMapSlot: MediaSlot = { ...TRACKS_MAP_SLOT, label: t('cover.mapImage') };

  const imageSlots = slots.filter((s) => s.kind === 'image');
  const videoSlot = slots.find((s) => s.key === 'scenario_video');
  const setField = (key: string) => (filename: string) =>
    editor.setGameMeta((m) => ({ ...(m as Record<string, unknown>), [key]: filename }) as typeof m);

  return (
    <CollapsibleSection title={isTracks ? t('cover.sectionTitleTracks') : t('cover.sectionTitle')}>
      <GroupLabel icon={ImageIcon}>{t('cover.groupImages')}</GroupLabel>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {imageSlots.map((slot) => (
          <AssetUploadField
            key={slot.key}
            slot={slot}
            value={String(meta[slot.key] ?? '')}
            onChange={setField(slot.key)}
            previewSize="md"
          />
        ))}
      </div>

      <GameVisualLanguages />

      {isTracks && (
        <div className="mt-3">
          <AssetUploadField
            slot={tracksMapSlot}
            value={String(meta.map_image ?? '')}
            onChange={setField('map_image')}
            previewSize="lg"
          />
        </div>
      )}

      {videoSlot && (
        <>
          <GroupLabel icon={Film} className="mt-5 pt-4 border-t border-gray-100">
            {t('cover.groupVideo')}
          </GroupLabel>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            <AssetUploadField
              slot={videoSlot}
              value={String(meta[videoSlot.key] ?? '')}
              onChange={setField(videoSlot.key)}
              renderPreview={(video) => <ScenarioVideoPlayer video={video} />}
            />
            <ScenarioVideoSubtitles />
          </div>
        </>
      )}
    </CollapsibleSection>
  );
}

function GroupLabel({
  icon: Icon,
  className = '',
  children,
}: {
  icon: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`}>
      <Icon className="w-3.5 h-3.5" />
      {children}
    </div>
  );
}