/**
 * Default Clash gameMeta factory (V2) - seeded, editable skeleton: 2 clans + 8
 * territories, each one variable-size balise set (5/4/4/3/3/2/2/1 = 24 balises)
 * worth pts/min ∝ balise count. No combinations, no pattern - balises are
 * authored inline on the territory (overridable at launch).
 *
 * Design: project_clash_game_type_design (V2).
 */

import type { ClashGameMeta, ClashTerritory } from '../../../types/scenario-data';

function territory(id: string, points: string, balises: number[]): ClashTerritory {
  return { id, name: {}, points, balises };
}

/** The spec skeleton: T1 balises 1-5 (5 pts) … T8 balise 24 (1 pt). */
export function defaultClashTerritories(): ClashTerritory[] {
  return [
    territory('territory_1', '5', [1, 2, 3, 4, 5]),
    territory('territory_2', '4', [6, 7, 8, 9]),
    territory('territory_3', '4', [10, 11, 12, 13]),
    territory('territory_4', '3', [14, 15, 16]),
    territory('territory_5', '3', [17, 18, 19]),
    territory('territory_6', '2', [20, 21]),
    territory('territory_7', '2', [22, 23]),
    territory('territory_8', '1', [24]),
  ];
}

export function defaultClashGameMeta(): ClashGameMeta {
  return {
    title: {},
    description: {},
    story: {},
    background_image: '',
    game_visual: '',
    map_image: '',
    clans: [
      { id: 'clan_1', name: {}, color: '#c0392b', banner: '', logo: '', score_card: '' },
      { id: 'clan_2', name: {}, color: '#2980b9', banner: '', logo: '', score_card: '' },
    ],
    territories: defaultClashTerritories(),
    frame_ranking: '',
    frame_territory_name: '',
    frame_gauge: '',
    frame_event: '',
    frame_timer: '',
    frame_separator: '',
    purge_image: '',
    purge_sound: '',
    text_elements: [],
    text_categories: [],
    game_public: 'ado_adultes',
    default_time: '60',
    scenario_version: '1.0',
    font: 'Arial',
    font_color: '#000000',
    level_font_color: '#000000',
    auto_reset: false,
    delay_auto_reset: '0',
    custom_fonts: [],
    // Translatable in-game text strings (shared shell TextStringsSection).
    text_player_starts: {},
    text_card_not_empty: {},
    text_scenario_ended: {},
    message_display_time: '2',
    animation_display_time: '1',
  };
}
