/**
 * Tracks type-specific media slots — image + sound fields that exist ONLY on
 * tracks scenarios. Concatenated with `commonMediaSlots` to form the full
 * manifest passed to the adapter.
 *
 * Note: `top_*_image` / `top_*_sound` / `background_image` / `game_visual` /
 * `scenario_video` already live in `commonMediaSlots` and are NOT redeclared
 * here.
 *
 * Design plan: C:\Users\faure\.claude\plans\tracks-game-type-design.md
 */

import type { MediaSlot } from '../../types';
import { scenarioVideoSubtitleFields } from '../../shell/commonMediaSlots';

export const tracksMediaSlots: readonly MediaSlot[] = [
  // Map background
  { key: 'map_image', kind: 'image', required: 'error', scope: 'type', label: 'Map image' },

  // HUD frame backgrounds (positions/sizes live in scenarios.scenario_layout)
  { key: 'team_name_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Team name frame' },
  { key: 'timer_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Timer frame' },
  { key: 'score_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Score frame' },
  { key: 'time_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Time frame' },

  // Feedback cue images — shown full-screen at scoring time (legacy maximus)
  { key: 'wrong_order_image', kind: 'image', required: false, scope: 'type', label: 'Wrong order image' },
  { key: 'missing_checkpoint_image', kind: 'image', required: false, scope: 'type', label: 'Missing checkpoint image' },

  // Common checkpoint icon (used when checkpoints_unique_image=true)
  { key: 'checkpoints_unique_image_id', kind: 'image', required: false, scope: 'type', label: 'Common checkpoint icon' },

  // Per-scan sounds
  { key: 'checkpoint_success', kind: 'sound', required: false, scope: 'type', label: 'Checkpoint success sound' },
  { key: 'checkpoint_error', kind: 'sound', required: false, scope: 'type', label: 'Checkpoint error sound' },
  { key: 'checkpoint_no_answer', kind: 'sound', required: false, scope: 'type', label: 'Checkpoint no-answer sound' },
] as const;

/**
 * Tracks' top-level "general" image fields — written to `medias.images`.
 * Per-checkpoint images live inside `gameMeta.checkpoints[].image` and are
 * enumerated separately by the adapter.
 */
export const tracksImageFields = [
  'background_image',
  'game_visual',
  'map_image',
  'team_name_background_image',
  'timer_background_image',
  'score_background_image',
  'time_background_image',
  'wrong_order_image',
  'missing_checkpoint_image',
  'checkpoints_unique_image_id',
  'top_1_image',
  'top_3_image',
  'top_10_image',
] as const;

export const tracksSoundFields = [
  'checkpoint_success',
  'checkpoint_error',
  'checkpoint_no_answer',
  'top_1_sound',
  'top_3_sound',
  'top_10_sound',
  'final_image_sound',
  ...scenarioVideoSubtitleFields,
];
