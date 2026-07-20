/**
 * Mystery type-specific media slots - image+sound fields that exist ONLY on
 * mystery scenarios. Concatenated with `commonMediaSlots` to form the full
 * manifest passed to the adapter.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 section)
 */

import type { MediaSlot } from '../../types';
import { scenarioVideoSubtitleFields } from '../../shell/commonMediaSlots';

export const mysteryMediaSlots: readonly MediaSlot[] = [
  // Mystery-only top-level images
  { key: 'game_instructions_image', kind: 'image', required: 'warning', scope: 'type', label: 'Game instructions image', labelKey: 'mystery_game_instructions_image' },
  { key: 'game_instructions_button_image', kind: 'image', required: false, scope: 'type', label: 'Instructions button', labelKey: 'mystery_game_instructions_button_image' },
  { key: 'game_instructions_button_hover_image', kind: 'image', required: false, scope: 'type', label: 'Instructions button (hover)', labelKey: 'mystery_game_instructions_button_hover_image' },
  { key: 'game_refresh_button_image', kind: 'image', required: false, scope: 'type', label: 'Refresh button', labelKey: 'mystery_game_refresh_button_image' },
  { key: 'game_refresh_button_hover_image', kind: 'image', required: false, scope: 'type', label: 'Refresh button (hover)', labelKey: 'mystery_game_refresh_button_hover_image' },
  { key: 'time_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Time background', labelKey: 'mystery_time_background_image' },
  { key: 'score_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Score background', labelKey: 'mystery_score_background_image' },
  { key: 'enigmas_header_image', kind: 'image', required: 'warning', scope: 'type', label: 'Enigmas header', labelKey: 'mystery_enigmas_header_image' },
  { key: 'steps_container_image', kind: 'image', required: false, scope: 'type', label: 'Steps container', labelKey: 'mystery_steps_container_image' },
  // Game-level images for the "both answers biped" / "no answer" enigma states.
  // Empty → playground falls back to the per-enigma good-answer image (color-tinted).
  { key: 'both_answers_image', kind: 'image', required: false, scope: 'type', label: 'Image both answers', labelKey: 'mystery_both_answers_image' },
  { key: 'no_answer_image', kind: 'image', required: false, scope: 'type', label: 'Image no answer', labelKey: 'mystery_no_answer_image' },

  // Mystery-only "level gauge" images - these go in `medias.levels` (not `medias.images`)
  { key: 'levels_gauge_image', kind: 'image', required: 'warning', scope: 'type', label: 'Levels gauge', labelKey: 'mystery_levels_gauge_image' },
  { key: 'levels_gauge_image_with_content', kind: 'image', required: 'warning', scope: 'type', label: 'Levels gauge w/ content', labelKey: 'mystery_levels_gauge_image_with_content' },
  { key: 'levels_gauge_player_icon_image', kind: 'image', required: false, scope: 'type', label: 'Player icon', labelKey: 'mystery_levels_gauge_player_icon_image' },
  { key: 'levels_gauge_level_icon_image', kind: 'image', required: false, scope: 'type', label: 'Level icon', labelKey: 'mystery_levels_gauge_level_icon_image' },

  // Mystery-only enigma sounds
  { key: 'enigma_success', kind: 'sound', required: false, scope: 'type', label: 'Enigma success sound', labelKey: 'mystery_enigma_success' },
  { key: 'enigma_error', kind: 'sound', required: false, scope: 'type', label: 'Enigma error sound', labelKey: 'mystery_enigma_error' },
  { key: 'enigma_no_answer', kind: 'sound', required: false, scope: 'type', label: 'Enigma no-answer sound', labelKey: 'mystery_enigma_no_answer' },
] as const;

/**
 * Mystery's top-level "general" image fields - written to `medias.images`.
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
  'both_answers_image',
  'no_answer_image',
] as const;

/**
 * Mystery's level-gauge image fields - written to `medias.levels` (sic;
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
  'final_image_sound',
  ...scenarioVideoSubtitleFields,
];
