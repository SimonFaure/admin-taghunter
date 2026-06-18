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

export const clashMediaSlots: readonly MediaSlot[] = [
  { key: 'map_image', kind: 'image', required: 'error', scope: 'type', label: 'Territory map' },
  { key: 'neutral_seal', kind: 'image', required: 'warning', scope: 'type', label: 'Neutral seal' },
] as const;

/** Flat top-level image fields partitioned into medias.images on save. */
export const clashImageFields = [
  'background_image',
  'game_visual',
  'map_image',
  'neutral_seal',
] as const;

/** Clash has no type-specific top-level sound fields in v1. */
export const clashSoundFields: readonly string[] = [];
