/**
 * Mystery type-specific media slots — image+sound fields that exist ONLY on
 * mystery scenarios. Concatenated with `commonMediaSlots` to form the full
 * manifest passed to the adapter.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import type { MediaSlot } from '../../types';
import { scenarioVideoSubtitleFields } from '../../shell/commonMediaSlots';

export const mysteryMediaSlots: readonly MediaSlot[] = [
  // Mystery-only top-level images
  { key: 'game_instructions_image', kind: 'image', required: 'warning', scope: 'type', label: 'Game instructions image' },
  { key: 'game_instructions_button_image', kind: 'image', required: false, scope: 'type', label: 'Instructions button' },
  { key: 'game_instructions_button_hover_image', kind: 'image', required: false, scope: 'type', label: 'Instructions button (hover)' },
  { key: 'game_refresh_button_image', kind: 'image', required: false, scope: 'type', label: 'Refresh button' },
  { key: 'game_refresh_button_hover_image', kind: 'image', required: false, scope: 'type', label: 'Refresh button (hover)' },
  { key: 'time_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Time background' },
  { key: 'score_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Score background' },
  { key: 'enigmas_header_image', kind: 'image', required: 'warning', scope: 'type', label: 'Enigmas header' },
  { key: 'steps_container_image', kind: 'image', required: false, scope: 'type', label: 'Steps container' },

  // Mystery-only "level gauge" images — these go in `medias.levels` (not `medias.images`)
  { key: 'levels_gauge_image', kind: 'image', required: 'warning', scope: 'type', label: 'Levels gauge' },
  { key: 'levels_gauge_image_with_content', kind: 'image', required: 'warning', scope: 'type', label: 'Levels gauge w/ content' },
  { key: 'levels_gauge_player_icon_image', kind: 'image', required: false, scope: 'type', label: 'Player icon' },
  { key: 'levels_gauge_level_icon_image', kind: 'image', required: false, scope: 'type', label: 'Level icon' },

  // Mystery-only enigma sounds
  { key: 'enigma_success', kind: 'sound', required: false, scope: 'type', label: 'Enigma success sound' },
  { key: 'enigma_error', kind: 'sound', required: false, scope: 'type', label: 'Enigma error sound' },
  { key: 'enigma_no_answer', kind: 'sound', required: false, scope: 'type', label: 'Enigma no-answer sound' },
] as const;

/**
 * Mystery's top-level "general" image fields — written to `medias.images`.
 */
export const mysteryImageFields = [
  'background_image',
  'game_visual',
  'game_instructions_image',
  'game_instructions_button_image',
  'game_instructions_button_hover_image',
  'game_refresh_button_image',
  'game_refresh_button_hover_image',
  'time_background_image',
  'score_background_image',
  'enigmas_header_image',
  'steps_container_image',
  'top_1_image',
  'top_3_image',
  'top_10_image',
] as const;

/**
 * Mystery's level-gauge image fields — written to `medias.levels` (sic;
 * legacy naming overload of "levels" inside the medias column).
 */
export const mysteryLevelImageFields = [
  'levels_gauge_image',
  'levels_gauge_image_with_content',
  'levels_gauge_player_icon_image',
  'levels_gauge_level_icon_image',
] as const;

export const mysterySoundFields = [
  'enigma_success',
  'enigma_error',
  'enigma_no_answer',
  'top_1_sound',
  'top_3_sound',
  'top_10_sound',
  'final_image_sound',
  ...scenarioVideoSubtitleFields,
];
