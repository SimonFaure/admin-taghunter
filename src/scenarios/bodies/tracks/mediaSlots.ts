/**
 * Tracks type-specific media slots - image + sound fields that exist ONLY on
 * tracks scenarios. Concatenated with `commonMediaSlots` to form the full
 * manifest passed to the adapter.
 *
 * Note: `background_image` / `game_visual` / `scenario_video` already live in
 * `commonMediaSlots` and are NOT redeclared here.
 *
 * Design plan: C:\Users\faure\.claude\plans\tracks-game-type-design.md
 */

import type { MediaSlot } from '../../types';
import { scenarioVideoSubtitleFields } from '../../shell/commonMediaSlots';

export const tracksMediaSlots: readonly MediaSlot[] = [
  // Map background
  { key: 'map_image', kind: 'image', required: 'error', scope: 'type', label: 'Map image', labelKey: 'tracks_map_image' },

  // HUD frame backgrounds (positions/sizes live in scenarios.scenario_layout).
  // Three frames only - the tracks HUD draws team name / timer / score.
  // (`time_background_image` was a legacy duplicate of the timer frame that the
  // runtime never drew; dropped 2026-09-04, retours point 43.)
  { key: 'team_name_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Team name frame', labelKey: 'tracks_team_name_background_image' },
  { key: 'timer_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Timer frame', labelKey: 'tracks_timer_background_image' },
  { key: 'score_background_image', kind: 'image', required: 'warning', scope: 'type', label: 'Score frame', labelKey: 'tracks_score_background_image' },

  // Feedback cue images - shown full-screen at scoring time (legacy maximus)
  { key: 'wrong_order_image', kind: 'image', required: false, scope: 'type', label: 'Wrong order image', labelKey: 'tracks_wrong_order_image' },
  { key: 'missing_checkpoint_image', kind: 'image', required: false, scope: 'type', label: 'Missing checkpoint image', labelKey: 'tracks_missing_checkpoint_image' },

  // Common checkpoint icon (used when checkpoints_unique_image=true)
  { key: 'checkpoints_unique_image_id', kind: 'image', required: false, scope: 'type', label: 'Common checkpoint icon', labelKey: 'tracks_checkpoints_unique_image_id' },

  // Per-scan sounds
  { key: 'checkpoint_success', kind: 'sound', required: false, scope: 'type', label: 'Checkpoint success sound', labelKey: 'tracks_checkpoint_success' },
  { key: 'checkpoint_error', kind: 'sound', required: false, scope: 'type', label: 'Checkpoint error sound', labelKey: 'tracks_checkpoint_error' },
  { key: 'checkpoint_no_answer', kind: 'sound', required: false, scope: 'type', label: 'Checkpoint no-answer sound', labelKey: 'tracks_checkpoint_no_answer' },

  // Rank rewards - shown/played at the end of a run when the team lands in the
  // top 1 / 3 / 10. The runtime has always used these (legacy maximus assets
  // travel in on import); they became authorable 2026-09-07, retours point 94.
  { key: 'top_1_image', kind: 'image', required: false, scope: 'type', label: 'Top 1 image', labelKey: 'tracks_top_1_image' },
  { key: 'top_3_image', kind: 'image', required: false, scope: 'type', label: 'Top 3 image', labelKey: 'tracks_top_3_image' },
  { key: 'top_10_image', kind: 'image', required: false, scope: 'type', label: 'Top 10 image', labelKey: 'tracks_top_10_image' },
  { key: 'top_1_sound', kind: 'sound', required: false, scope: 'type', label: 'Top 1 sound', labelKey: 'tracks_top_1_sound' },
  { key: 'top_3_sound', kind: 'sound', required: false, scope: 'type', label: 'Top 3 sound', labelKey: 'tracks_top_3_sound' },
  { key: 'top_10_sound', kind: 'sound', required: false, scope: 'type', label: 'Top 10 sound', labelKey: 'tracks_top_10_sound' },
] as const;

/**
 * Tracks' top-level "general" image fields - written to `medias.images`.
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
