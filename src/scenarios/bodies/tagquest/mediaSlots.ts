/**
 * Tagquest type-specific media slots — the image+sound fields that exist
 * ONLY on tagquest scenarios. Concatenated with `commonMediaSlots` to form
 * the full manifest passed to the adapter.
 *
 * The HUD frames now live inside a single transparent template PNG (default
 * shipped with the app, or `custom_template` per-scenario). Only the malus /
 * late-malus icons remain as per-scenario images.
 */

import type { MediaSlot } from '../../types';
import { scenarioVideoSubtitleFields } from '../../shell/commonMediaSlots';

export const tagquestMediaSlots: readonly MediaSlot[] = [
  // Tagquest-only images
  { key: 'malus_image', kind: 'image', required: false, scope: 'type', label: 'Malus icon' },
  { key: 'late_malus_image', kind: 'image', required: false, scope: 'type', label: 'Late malus icon' },
  { key: 'custom_template', kind: 'image', required: false, scope: 'type', label: 'Custom template' },

  // Tagquest-only sounds
  { key: 'success_sound', kind: 'sound', required: false, scope: 'type', label: 'Success sound' },
  { key: 'cheating_sound', kind: 'sound', required: false, scope: 'type', label: 'Cheating sound' },
  { key: 'malus_sound', kind: 'sound', required: false, scope: 'type', label: 'Malus sound' },
  { key: 'late_malus_sound', kind: 'sound', required: false, scope: 'type', label: 'Late malus sound' },
] as const;

/**
 * Top-level tagquest image fields — used by the adapter when partitioning
 * gameMeta into the medias column (images vs sounds).
 */
export const tagquestImageFields = [
  'background_image',
  'game_visual',
  'malus_image',
  'late_malus_image',
  'custom_template',
  'top_1_image',
  'top_3_image',
  'top_10_image',
] as const;

export const tagquestSoundFields = [
  'top_1_sound',
  'top_3_sound',
  'top_10_sound',
  'final_image_sound',
  'success_sound',
  'cheating_sound',
  'malus_sound',
  'late_malus_sound',
  ...scenarioVideoSubtitleFields,
];
