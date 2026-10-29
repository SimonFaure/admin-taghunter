/**
 * Common media slot manifest - shared by every game type.
 *
 * Body adapters concatenate this with their type-specific slot list:
 *   mediaSlots: [...commonMediaSlots, ...mysteryMediaSlots]
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import type { MediaSlot } from '../types';
import { SUPPORTED_LANGS } from '../i18n/types';

/**
 * Field key for a `.vtt` subtitle track on the per-scenario intro video.
 * One slot per supported language. The .vtt files travel through the
 * existing `medias.sounds` bucket (no dedicated subtitle kind today) so
 * the playground sync picks them up alongside other scenario assets.
 */
export const scenarioVideoSubtitleKey = (lang: string) => `scenario_video_subtitle_${lang}`;

export const scenarioVideoSubtitleFields = SUPPORTED_LANGS.map(scenarioVideoSubtitleKey);

const scenarioVideoSubtitleSlots: readonly MediaSlot[] = SUPPORTED_LANGS.map((lang) => ({
  key: scenarioVideoSubtitleKey(lang),
  kind: 'sound',
  required: false,
  scope: 'common',
  label: `Intro video subtitle (${lang})`,
  acceptMime: ['text/vtt', 'text/plain'],
})) as readonly MediaSlot[];

/**
 * The cover visual comes in two versions: `game_visual` is the French one
 * (and the fallback), `game_visual_intl` the one shown to every licensee whose
 * account language is not French. Both live in `medias.images`, so the
 * playground receives them in `game_media_images` with no server change.
 * Resolved by getGameVisualUrl (studio), ScenarioLanguages::gameVisual (PHP)
 * and pickGameVisual (playground).
 */
export const GAME_VISUAL_INTL_KEY = 'game_visual_intl';

/**
 * Legacy per-language versions (`game_visual_<lang>`, one per language) from
 * before the single "other languages" version. No longer shown anywhere; still
 * declared so a save keeps them and the editor can list them for removal.
 */
export const gameVisualLangKey = (lang: string) => `game_visual_${lang}`;

export const gameVisualLangFields = [GAME_VISUAL_INTL_KEY, ...SUPPORTED_LANGS.map(gameVisualLangKey)];

const gameVisualLangSlots: readonly MediaSlot[] = [
  { key: GAME_VISUAL_INTL_KEY, kind: 'image', required: false, scope: 'common', label: 'Game cover visual (other languages)' },
  ...SUPPORTED_LANGS.map((lang) => ({
    key: gameVisualLangKey(lang),
    kind: 'image',
    required: false,
    scope: 'common',
    label: `Game cover visual (${lang}, legacy)`,
  })),
] as readonly MediaSlot[];

export const commonMediaSlots: readonly MediaSlot[] = [
  // Cover / background
  { key: 'background_image', kind: 'image', required: 'error', scope: 'common', label: 'Background image' },
  { key: 'game_visual', kind: 'image', required: 'error', scope: 'common', label: 'Game cover visual' },
  ...gameVisualLangSlots,

  // End-of-game
  { key: 'final_image_sound', kind: 'sound', required: false, scope: 'common', label: 'Final image sound' },

  // Scenario video - uploaded via PHP `scenario_files.php?action=upload_video`,
  // stored on disk at /media/<uniqid>/, picked up by playground sync's
  // scandir-based manifest. `medias.video` (singular) carries the full
  // /media/<uniqid>/... path for ScenarioDetailView compatibility; the adapter
  // strips it to a bare filename when hydrating `gameMeta.scenario_video`.
  {
    key: 'scenario_video',
    kind: 'video',
    required: false,
    scope: 'common',
    label: 'Scenario video',
    acceptMime: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
  },

  // Per-language subtitle tracks for the intro video - see comment above
  // `scenarioVideoSubtitleSlots`. Appended last so they don't interrupt
  // the existing slot ordering used by the editor UI.
  ...scenarioVideoSubtitleSlots,
];