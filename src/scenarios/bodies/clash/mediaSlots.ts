/**
 * Clash type-specific media slots + the flat top-level image/sound field
 * lists used by the adapter to partition gameMeta into the medias column.
 *
 * Clan seals and per-combination / per-territory images are NESTED arrays
 * (handled in adapter.ts like tagquest quests), not flat slots.
 *
 * Design: project_clash_game_type_design (grill-me decision record).
 */

import type { MediaSlot } from '../../types';

/** Optional dashboard chrome frames - default styling is used when unset. */
export const clashFrameSlots: readonly MediaSlot[] = [
  { key: 'frame_ranking', kind: 'image', required: false, scope: 'type', label: 'Ranking frame', labelKey: 'clash_frame_ranking' },
  { key: 'frame_territory_name', kind: 'image', required: false, scope: 'type', label: 'Territory-name frame', labelKey: 'clash_frame_territory_name' },
  { key: 'frame_gauge', kind: 'image', required: false, scope: 'type', label: 'Territory gauge frame', labelKey: 'clash_frame_gauge' },
  { key: 'frame_event', kind: 'image', required: false, scope: 'type', label: 'Event banner frame', labelKey: 'clash_frame_event' },
  { key: 'frame_timer', kind: 'image', required: false, scope: 'type', label: 'Timer frame', labelKey: 'clash_frame_timer' },
  { key: 'frame_separator', kind: 'image', required: false, scope: 'type', label: 'Event separator bar', labelKey: 'clash_frame_separator' },
] as const;

/**
 * "The Purge" media - both optional, NO publish gate and NO built-in fallback:
 * when purge_image is unset the purge feature is unavailable at launch in the
 * playground. Design: project_clash_purge_feature.
 */
export const clashPurgeSlots: readonly MediaSlot[] = [
  { key: 'purge_image', kind: 'image', required: false, scope: 'type', label: 'Purge image', labelKey: 'clash_purge_image' },
  { key: 'purge_sound', kind: 'sound', required: false, scope: 'type', label: 'Purge sound', labelKey: 'clash_purge_sound' },
] as const;

export const clashMediaSlots: readonly MediaSlot[] = [
  { key: 'map_image', kind: 'image', required: 'error', scope: 'type', label: 'Territory map', labelKey: 'clash_map_image' },
  ...clashFrameSlots,
  ...clashPurgeSlots,
] as const;

/** Flat top-level image fields partitioned into medias.images on save. */
export const clashImageFields = [
  'background_image',
  'game_visual',
  'map_image',
  'frame_ranking',
  'frame_territory_name',
  'frame_gauge',
  'frame_event',
  'frame_timer',
  'frame_separator',
  'purge_image',
] as const;

/** Flat top-level sound fields partitioned into medias.sounds on save. */
export const clashSoundFields: readonly string[] = ['purge_sound'];
