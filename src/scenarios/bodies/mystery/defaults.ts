/**
 * Default Mystery gameMeta factory — used when a brand-new scenario is
 * created. Mirrors the initial state in MysteryConfig.tsx:119-187.
 *
 * Slice 3C: translatable string fields default to empty `Localized<string>`
 * maps (`{}`); the editor's `setLocalized` helper inserts an entry at the
 * current language on first edit.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 + 3 sections)
 */

import type { MysteryGameMeta } from '../../../types/scenario-data';

const DEFAULT_GAUGE_FILLING =
  'linear-gradient(90deg, rgba(0,106,255,1) 0%, rgba(0,178,254,1) 35%, rgba(0,255,220,0.6741290266106443) 100%)';

export function defaultMysteryGameMeta(): MysteryGameMeta {
  return {
    title: {},
    description: {},
    story: {},
    background_image: '',
    game_visual: '',
    game_instructions_image: '',
    game_instructions_button_image: '',
    game_instructions_button_hover_image: '',
    game_refresh_button_image: '',
    game_refresh_button_hover_image: '',
    levels_gauge_image: '',
    levels_gauge_image_with_content: '',
    levels_gauge_player_icon_image: '',
    levels_gauge_level_icon_image: '',
    time_background_image: '',
    score_background_image: '',
    enigmas_header_image: '',
    steps_container_image: '',
    top_1_image: '',
    top_3_image: '',
    top_10_image: '',
    game_public: 'kids',
    number_of_enigmas: '12',
    overscore_steps: '6',
    score_full_game: '100',
    animation_image_duration: '1',
    animation_enigma_duration: '1',
    animation_message_duration: '2',
    default_time: '60',
    gauge_filling: DEFAULT_GAUGE_FILLING,
    level_font_color: '#000000',
    scenario_version: '1.0',
    default_time_malus: '1',
    font: 'Arial',
    font_color: '#000000',
    enigma_success: '',
    enigma_error: '',
    enigma_no_answer: '',
    top_1_sound: '',
    top_3_sound: '',
    top_10_sound: '',
    final_image_sound: '',
    levels: {},
    enigmas: [],
    overscores: [],
    points_units: '',
    team_title: '',
    pdf_title: '',
    auto_reset: false,
    delay_auto_reset: '0',
    text_player_starts: {},
    text_card_not_empty: {},
    text_team_starts_card_not_empty: {},
    text_card_not_corresponding: {},
    text_team_ended: {},
    text_all_team_ended: {},
    text_scenario_ended: {},
    text_team_reached_new_level: {},
    text_card_empty: {},
    text_late_malus: {},
    text_team_enters_top_ranking: {},
    text_team_enters_podium: {},
    text_team_first_place: {},
    text_following_top_podium: {},
    text_if_error: {},
    text_is_card_empty: {},
    message_display_time: '2',
    animation_display_time: '1',
    custom_fonts: [],
  };
}
