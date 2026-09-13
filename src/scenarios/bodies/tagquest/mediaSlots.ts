/**
 * Tagquest type-specific media slots - the image+sound fields that exist
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
  { key: 'malus_image', kind: 'image', required: false, scope: 'type', label: 'Malus icon', labelKey: 'tagquest_malus_image' },
  { key: 'late_malus_image', kind: 'image', required: false, scope: 'type', label: 'Late malus icon', labelKey: 'tagquest_late_malus_image' },
  { key: 'custom_template', kind: 'image', required: false, scope: 'type', label: 'Custom template', labelKey: 'tagquest_custom_template' },

  // Tagquest-only sounds. Each one is played by an identified event in the
  // playground - see TagQuestGamePage (`playScenarioSound`). The former global
  // "success sound" was retired: it had no trigger of its own (quest completion
  // already plays the quest's own sound) and was silently never played.
  { key: 'cheating_sound', kind: 'sound', required: false, scope: 'type', label: 'Cheating sound', labelKey: 'tagquest_cheating_sound' },
  { key: 'malus_sound', kind: 'sound', required: false, scope: 'type', label: 'Malus sound', labelKey: 'tagquest_malus_sound' },
  { key: 'late_malus_sound', kind: 'sound', required: false, scope: 'type', label: 'Late malus sound', labelKey: 'tagquest_late_malus_sound' },
] as const;

/**
 * Top-level tagquest image fields - used by the adapter when partitioning
 * gameMeta into the medias column (images vs sounds).
 */
export const tagquestImageFields = [
  'background_image',
  'game_visual',
  'malus_image',
  'late_malus_image',
  'custom_template',
] as const;

export const tagquestSoundFields = [
  'final_image_sound',
  'cheating_sound',
  'malus_sound',
  'late_malus_sound',
  ...scenarioVideoSubtitleFields,
];
