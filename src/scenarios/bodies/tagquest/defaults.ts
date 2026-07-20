/**
 * Default Tagquest gameMeta factory - used when a brand-new scenario is
 * created. Mirrors the initial state in TagquestConfig.tsx:122-190 but
 * returns a plain object for the canonical `data.game_meta` shape.
 *
 * Slice 3C: translatable string fields default to empty `Localized<string>`
 * maps (`{}`); the editor's `setLocalized` helper inserts an entry at the
 * current language on first edit.
 *
 * Plan: C:\Users\faure\.claude\plans\wiggly-baking-spring.md (Stage 2 + 3 sections)
 */

import type { TagquestGameMeta } from '../../../types/scenario-data';

export function defaultTagquestGameMeta(): TagquestGameMeta {
  return {
    title: {},
    description: {},
    story: {},
    background_image: '',
    game_visual: '',
    malus_image: '',
    late_malus_image: '',
    custom_template: '',
    use_default_template: true,
    game_public: 'kids',
    animation_image_duration: '1',
    animation_message_duration: '2',
    end_station: '60',
    default_time: '60',
    level_font_color: '#000000',
    scenario_version: '1.0',
    default_time_malus: '1',
    font: 'Arial',
    font_color: '#000000',
    final_image_sound: '',
    success_sound: '',
    cheating_sound: '',
    malus_sound: '',
    late_malus_sound: '',
    combo_2_quests: '0',
    combo_4_quests: '0',
    combo_6_quests: '0',
    malus_points: '0',
    malus_station_number: '0',
    late_malus_points: '0',
    levels: {},
    quests: [],
    overscores: [],
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
    text_team_cheating: {},
    message_display_time: '2',
    animation_display_time: '1',
    custom_fonts: [],
  };
}
