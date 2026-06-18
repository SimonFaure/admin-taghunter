/**
 * The fixed Clash territory skeleton (v1): 4 territories holding 8 combinations
 * — 1 large (3 combos), 2 medium (2 each), 1 small (1). Shared by the scenario
 * Territories section + the clash pattern editor/viewer so authors can see
 * which combination belongs to which territory.
 *
 * Design: project_clash_game_type_design.
 */

export const CLASH_COMBOS_PER_TERRITORY = [3, 2, 2, 1] as const;
export const CLASH_TERRITORY_SIZE_LABEL = ['Large', 'Medium', 'Medium', 'Small'] as const;

/** Map a 0-based global combination index to its territory (fixed skeleton). */
export function clashComboTerritory(comboIndex0: number): {
  territoryNumber: number;
  sizeLabel: string;
} {
  let acc = 0;
  for (let t = 0; t < CLASH_COMBOS_PER_TERRITORY.length; t++) {
    acc += CLASH_COMBOS_PER_TERRITORY[t];
    if (comboIndex0 < acc) {
      return { territoryNumber: t + 1, sizeLabel: CLASH_TERRITORY_SIZE_LABEL[t] };
    }
  }
  return { territoryNumber: 0, sizeLabel: '' };
}

/** The 1-based global combination numbers that compose territory `index0`. */
export function clashTerritoryComboNumbers(index0: number): number[] {
  const start = CLASH_COMBOS_PER_TERRITORY.slice(0, index0).reduce((a, b) => a + b, 0);
  const count = CLASH_COMBOS_PER_TERRITORY[index0] ?? 0;
  return Array.from({ length: count }, (_, k) => start + k + 1);
}
