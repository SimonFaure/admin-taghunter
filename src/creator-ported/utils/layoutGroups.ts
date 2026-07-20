export interface GroupItemDef {
  id: string;
  name: string;
  type: 'image' | 'text' | 'scenario_text';
  previewText?: string;
  parentId?: string;
}

export interface GroupDef {
  id: string;
  name: string;
  mainImageId: string;
  items: GroupItemDef[];
  questIndex?: number;
  /**
   * Sidebar render kind - drives the visual "Text elements" separator that
   * sits above the first `'text_category'` group. The legacy
   * Checkpoints / HUD frames groups are implicitly `'standard'` (undefined).
   * `'text_category'` groups also stay clickable when empty (no items yet)
   * because their header doubles as the category typography editor anchor.
   *
   * Plan: tracks-text-elements-categories.md
   */
  kind?: 'text_category';
  /** For text_category groups: the category's id (matches
   *  `gm.text_categories[i].id`), or undefined for Uncategorized. */
  categoryId?: string;
}

const STATIC_GROUPS: GroupDef[] = [
  {
    id: 'template',
    name: 'Template',
    mainImageId: 'tagquest_template',
    items: [
      { id: 'background_image', name: 'Background', type: 'image' },
      { id: 'tagquest_template', name: 'Tagquest Template (overlay)', type: 'image' },
    ],
  },
  {
    id: 'top_row',
    name: 'Top Row',
    mainImageId: 'timer',
    items: [
      { id: 'timer', name: 'Timer', type: 'text', previewText: '00:25:02' },
      { id: 'team_name_text', name: 'Team Name', type: 'text', previewText: 'TEAM 1' },
      { id: 'score', name: 'Score', type: 'text', previewText: '1500' },
    ],
  },
  {
    id: 'quest_animation',
    name: 'Quest Animation (pieces grid)',
    mainImageId: 'animation_quest_image',
    items: [
      { id: 'animation_quest_image', name: 'Quest Pieces Grid', type: 'image' },
    ],
  },
  {
    id: 'malus',
    name: 'Malus',
    mainImageId: 'malus_icon',
    items: [
      { id: 'malus_icon', name: 'Malus Icon', type: 'image' },
      { id: 'malus_multiplicator', name: 'Malus Multiplicator', type: 'text', previewText: 'x2' },
      { id: 'malus_points', name: 'Malus Points', type: 'text', previewText: '-50' },
    ],
  },
  {
    id: 'late_malus',
    name: 'Late Malus',
    mainImageId: 'late_malus_icon',
    items: [
      { id: 'late_malus_icon', name: 'Late Malus Icon', type: 'image' },
      { id: 'late_malus_multiplicator', name: 'Late Malus Multiplicator', type: 'text', previewText: 'x1' },
      { id: 'late_malus_points', name: 'Late Malus Points', type: 'text', previewText: '-30' },
    ],
  },
  {
    id: 'combos',
    name: 'Combos',
    mainImageId: 'combo_6_title',
    items: [
      { id: 'combo_6_title', name: 'Combo 6 Title', type: 'text', previewText: 'COMBO 6' },
      { id: 'combo_6_multiplicator', name: 'Combo 6 Multiplicator', type: 'text', previewText: 'x3' },
      { id: 'combo_6_points', name: 'Combo 6 Points', type: 'text', previewText: '+300' },
      { id: 'combo_4_title', name: 'Combo 4 Title', type: 'text', previewText: 'COMBO 4' },
      { id: 'combo_4_multiplicator', name: 'Combo 4 Multiplicator', type: 'text', previewText: 'x2' },
      { id: 'combo_4_points', name: 'Combo 4 Points', type: 'text', previewText: '+200' },
      { id: 'combo_2_title', name: 'Combo 2 Title', type: 'text', previewText: 'COMBO 2' },
      { id: 'combo_2_multiplicator', name: 'Combo 2 Multiplicator', type: 'text', previewText: 'x1' },
      { id: 'combo_2_points', name: 'Combo 2 Points', type: 'text', previewText: '+100' },
    ],
  },
];

export function buildGroups(numQuests: number): GroupDef[] {
  const groups: GroupDef[] = [...STATIC_GROUPS];
  for (let i = 1; i <= numQuests; i++) {
    groups.push({
      id: `quest_${i}`,
      name: `Quest ${i}`,
      mainImageId: `quest_${i}_icon`,
      questIndex: i,
      items: [
        { id: `quest_${i}_icon`, name: `Quest ${i} Icon`, type: 'image' },
        { id: `quest_${i}_multiplicator`, name: `Quest ${i} Multiplicator`, type: 'text', previewText: 'x1' },
        { id: `quest_${i}_points`, name: `Quest ${i} Points`, type: 'text', previewText: '+100' },
      ],
    });
  }
  return groups;
}

/**
 * Tracks HUD frame elements - the four background frames for the in-game HUD.
 * Ids match `gameMeta.*_background_image` (also mirrored to medias.images).
 */
export const TRACKS_HUD_ITEMS: GroupItemDef[] = [
  { id: 'team_name_background_image', name: 'Team name frame', type: 'image' },
  { id: 'timer_background_image', name: 'Timer frame', type: 'image' },
  { id: 'score_background_image', name: 'Score frame', type: 'image' },
  { id: 'time_background_image', name: 'Time frame', type: 'image' },
];

/**
 * Mock preview text overlaid on the HUD frames in the layout editor so the
 * designer can see how the live values sit on each frame. Render-only - never
 * persisted to the layout.
 */
export const TRACKS_HUD_MOCK_TEXT: Record<string, string> = {
  team_name_background_image: 'TEAM 1',
  timer_background_image: '00:25:02',
  score_background_image: '1500',
};

/**
 * Tracks groups: Checkpoints + HUD frames, then one group per text-element
 * category (in author-defined order from `gm.text_categories[]`) + an
 * Uncategorized bucket. `mainImageId` is intentionally left empty: tracks
 * groups have no "move the whole group" semantics (unlike tagquest quests).
 *
 * Categorised groups always render even when empty so the author can edit
 * the category's typography from its header. Uncategorized is skipped when
 * empty (it has no typography to edit).
 *
 * Plan: tracks-text-elements-categories.md
 */
export interface TracksGroupsCategoryInput {
  /** `id` matches `gm.text_categories[i].id`. */
  id: string;
  name: string;
}

export function buildTracksGroups(
  checkpointCount: number,
  textCategories: readonly TracksGroupsCategoryInput[] = [],
  /** Items keyed by category id; uncategorized items go under the empty-string key. */
  textItemsByCategory: ReadonlyMap<string, GroupItemDef[]> = new Map(),
): GroupDef[] {
  const checkpointItems: GroupItemDef[] = [];
  for (let i = 1; i <= checkpointCount; i++) {
    checkpointItems.push({ id: `checkpoint_${i}`, name: `Checkpoint ${i}`, type: 'image' });
  }
  const groups: GroupDef[] = [
    { id: 'tracks_checkpoints', name: 'Checkpoints', mainImageId: '', items: checkpointItems },
    { id: 'tracks_hud', name: 'HUD frames', mainImageId: '', items: TRACKS_HUD_ITEMS },
  ];
  for (const cat of textCategories) {
    groups.push({
      id: `tracks_text_cat_${cat.id}`,
      name: cat.name || '(unnamed)',
      mainImageId: '',
      items: textItemsByCategory.get(cat.id) ?? [],
      kind: 'text_category',
      categoryId: cat.id,
    });
  }
  const uncategorizedItems = textItemsByCategory.get('') ?? [];
  if (uncategorizedItems.length > 0) {
    groups.push({
      id: 'tracks_text_cat_uncategorized',
      name: 'Uncategorized',
      mainImageId: '',
      items: uncategorizedItems,
      kind: 'text_category',
      // categoryId left undefined → uncategorized
    });
  }
  return groups;
}

/**
 * Clash groups: one "Territories" group holding THREE move-only markers per
 * territory - the banner, the name/gauge cluster and the purge-image anchor -
 * plus a text-category group per category (translatable map labels), mirroring
 * tracks but without the HUD-frames group. No "main image" group semantics.
 */
export function buildClashGroups(
  territoryCount: number,
  textCategories: readonly TracksGroupsCategoryInput[] = [],
  textItemsByCategory: ReadonlyMap<string, GroupItemDef[]> = new Map(),
  /** Authored territory display labels (index-aligned); falls back to "Territory N". */
  territoryNames: readonly string[] = [],
): GroupDef[] {
  const territoryItems: GroupItemDef[] = [];
  for (let i = 1; i <= territoryCount; i++) {
    const base = territoryNames[i - 1] || `Territory ${i}`;
    territoryItems.push({ id: `territory_${i}_banner`, name: `${base} · banner`, type: 'image' });
    territoryItems.push({ id: `territory_${i}_label`, name: `${base} · name/gauge`, type: 'image' });
    territoryItems.push({ id: `territory_${i}_purge`, name: `${base} · purge`, type: 'image' });
  }
  const groups: GroupDef[] = [
    { id: 'clash_territories', name: 'Territories', mainImageId: '', items: territoryItems },
    { id: 'clash_hud', name: 'Timer', mainImageId: '', items: [{ id: 'clash_timer', name: 'Timer', type: 'image' }] },
  ];
  for (const cat of textCategories) {
    groups.push({
      id: `clash_text_cat_${cat.id}`,
      name: cat.name || '(unnamed)',
      mainImageId: '',
      items: textItemsByCategory.get(cat.id) ?? [],
      kind: 'text_category',
      categoryId: cat.id,
    });
  }
  const uncategorizedItems = textItemsByCategory.get('') ?? [];
  if (uncategorizedItems.length > 0) {
    groups.push({
      id: 'clash_text_cat_uncategorized',
      name: 'Uncategorized',
      mainImageId: '',
      items: uncategorizedItems,
      kind: 'text_category',
    });
  }
  return groups;
}

export function getGroupForElement(elementId: string, groups: GroupDef[]): GroupDef | undefined {
  return groups.find(g => g.items.some(item => item.id === elementId));
}

export function getMainImageOfGroup(elementId: string, groups: GroupDef[]): string | undefined {
  const group = getGroupForElement(elementId, groups);
  return group?.mainImageId;
}

export function isQuestGroup(group: GroupDef): boolean {
  return group.questIndex !== undefined;
}

export function getQuestIndexFromElementId(elementId: string): number | null {
  const m = elementId.match(/^quest_(\d+)_/);
  return m ? parseInt(m[1], 10) : null;
}

export function getQuestItemRole(elementId: string): string | null {
  const m = elementId.match(/^quest_\d+_(.+)$/);
  return m ? m[1] : null;
}

export function getCounterpartId(elementId: string, targetQuestIndex: number): string | null {
  const m = elementId.match(/^quest_\d+_(.+)$/);
  if (m) return `quest_${targetQuestIndex}_${m[1]}`;
  return null;
}
