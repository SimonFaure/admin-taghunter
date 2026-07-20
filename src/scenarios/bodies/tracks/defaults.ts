/**
 * Default Tracks gameMeta factory - used when a brand-new tracks scenario is
 * created.
 *
 * Translatable string fields default to empty `Localized<string>` maps (`{}`);
 * the editor's `setLocalized` helper inserts an entry at the current language
 * on first edit.
 *
 * Design plan: C:\Users\faure\.claude\plans\tracks-game-type-design.md
 */

import type { TracksGameMeta } from '../../../types/scenario-data';

export function defaultTracksGameMeta(): TracksGameMeta {
  return {
    title: {},
    description: {},
    story: {},

    // Common image + sound fields from BaseGameMetaSchema
    background_image: '',
    game_visual: '',
    final_image_sound: '',

    // Tracks-specific images
    map_image: '',
    team_name_background_image: '',
    timer_background_image: '',
    score_background_image: '',
    time_background_image: '',

    // Feedback cue images (full-screen; legacy maximus wrong_order/absent)
    wrong_order_image: '',
    missing_checkpoint_image: '',

    // Tracks-specific sounds
    checkpoint_success: '',
    checkpoint_error: '',
    checkpoint_no_answer: '',

    // Checkpoints array - operator adds rows in the editor
    checkpoints: [],

    // Checkpoint icon mode: false = per-checkpoint (each row has its own
    // image), true = common (single icon shared, stored in
    // `checkpoints_unique_image_id`).
    checkpoints_unique_image: false,
    checkpoints_unique_image_id: '',
    checkpoint_image_width_percentage: '3',

    // Routes - all five presets disabled by default except `default`. The
    // operator opts in to additional courses per scenario.
    routes: {
      default: { enabled: true },
      first_half: { enabled: false },
      last_half: { enabled: false },
      odd: { enabled: false },
      even: { enabled: false },
    },

    // Display modes - `map` enabled by default (legacy convention).
    displays: {
      full: { enabled: false },
      map: { enabled: true },
      simple: { enabled: false },
    },

    // Play modes - `free` enabled by default (legacy convention).
    play_modes: {
      itinerary: { enabled: false },
      free: { enabled: true },
    },

    // Score types - `percentage` enabled and pre-selected by default.
    score_types: {
      percentage: { enabled: true, default: true },
      points: { enabled: false, default: false },
    },

    // Display options
    display_score: true,
    clues_page: {
      enabled: false,
      show_title: true,
      show_text: true,
      show_image: true,
    },

    // Timer (string-numbers, matching mystery/tagquest convention)
    default_time: '60',
    default_time_malus: '1',

    // End-of-animation auto-reset (5s hardcoded in playground when enabled)
    auto_reset: true,
    delay_auto_reset: '5',

    // Audience tag - read by the storefront. Teens/adults bucket for tracks.
    game_public: 'ado_adultes',

    // Typography
    font: 'Arial',
    font_color: '#000000',
    scenario_version: '1.0',

    // Pattern inheritance
    scenario_default_pattern: null,

    // Author-uploaded custom font families (empty until operator uploads)
    custom_fonts: [],
  };
}
