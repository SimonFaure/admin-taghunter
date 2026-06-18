/**
 * Default Clash gameMeta factory — the fixed v1 skeleton: 2 clans + 4
 * territory slots (large/medium/medium/small) holding 8 combinations over
 * 24 balises. Ids are deterministic so the Clash PATTERN's station
 * assignments and per-clan launch overrides keep stable references.
 *
 * Design: project_clash_game_type_design (grill-me decision record).
 */

import type { ClashGameMeta, ClashCombination, ClashTerritory } from '../../../types/scenario-data';

function emptyCombination(id: string): ClashCombination {
  return { id, name: {}, piece_1: '', piece_2: '', piece_3: '', main: '' };
}

function territory(
  id: string,
  size: ClashTerritory['size'],
  points: string,
  comboIds: string[],
): ClashTerritory {
  return {
    id,
    name: {},
    size,
    points,
    complete_image: '',
    combinations: comboIds.map(emptyCombination),
  };
}

/** Fixed skeleton: combos 1-3 → large, 4-5 / 6-7 → medium, 8 → small. */
export function defaultClashTerritories(): ClashTerritory[] {
  return [
    territory('territory_large', 'large', '4', ['combo_1', 'combo_2', 'combo_3']),
    territory('territory_medium_a', 'medium', '2', ['combo_4', 'combo_5']),
    territory('territory_medium_b', 'medium', '2', ['combo_6', 'combo_7']),
    territory('territory_small', 'small', '1', ['combo_8']),
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
    neutral_seal: '',
    clans: [
      { id: 'clan_1', name: {}, color: '#c0392b', seal: '' },
      { id: 'clan_2', name: {}, color: '#2980b9', seal: '' },
    ],
    territories: defaultClashTerritories(),
    scenario_default_pattern: null,
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
