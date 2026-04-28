export interface GroupItemDef {
  id: string;
  name: string;
  type: 'image' | 'text';
  previewText?: string;
  parentId?: string;
}

export interface GroupDef {
  id: string;
  name: string;
  mainImageId: string;
  items: GroupItemDef[];
  questIndex?: number;
}

const STATIC_GROUPS: GroupDef[] = [
  {
    id: 'quest_animation',
    name: 'Quest Animation',
    mainImageId: 'animation_quest_image',
    items: [
      { id: 'animation_quest_image', name: 'Quest Main Image', type: 'image' },
      { id: 'animation_quest_name', name: 'Quest Name Text', type: 'text', previewText: 'Quest Name' },
    ],
  },
  {
    id: 'timer',
    name: 'Timer',
    mainImageId: 'timer_container_image',
    items: [
      { id: 'timer_container_image', name: 'Timer Container', type: 'image' },
      { id: 'timer_text', name: 'Timer Text', type: 'text', previewText: '00:25:02' },
    ],
  },
  {
    id: 'malus',
    name: 'Malus',
    mainImageId: 'malus_image',
    items: [
      { id: 'malus_image', name: 'Malus Container', type: 'image' },
      { id: 'malus_icon_image', name: 'Malus Image', type: 'image', parentId: 'malus_image' },
      { id: 'malus_text', name: 'Malus Text', type: 'text', previewText: 'MALUS' },
      { id: 'malus_points', name: 'Malus Points', type: 'text', previewText: '-50' },
      { id: 'malus_multiplicator', name: 'Malus Multiplicator', type: 'text', previewText: 'x2' },
    ],
  },
  {
    id: 'late_malus',
    name: 'Late Malus',
    mainImageId: 'late_malus_container_image',
    items: [
      { id: 'late_malus_container_image', name: 'Late Malus Container', type: 'image' },
      { id: 'late_malus_icon_image', name: 'Late Malus Image', type: 'image', parentId: 'late_malus_container_image' },
      { id: 'malus_late_text', name: 'Malus Late Text', type: 'text', previewText: 'MALUS LATE' },
      { id: 'late_malus_points', name: 'Late Malus Points', type: 'text', previewText: '-30' },
      { id: 'late_malus_multiplicator', name: 'Late Malus Multiplicator', type: 'text', previewText: 'x1' },
    ],
  },
  {
    id: 'combos',
    name: 'Combos',
    mainImageId: 'combo_image',
    items: [
      { id: 'combo_image', name: 'Combos Container', type: 'image' },
      { id: 'combos_title', name: 'Combos Title', type: 'text', previewText: 'POINTS COMBOS' },
      { id: 'combo_6_title', name: 'Combo 6 Title', type: 'text', previewText: 'COMBO 6' },
      { id: 'combo_6_points', name: 'Combo 6 Points', type: 'text', previewText: '+300' },
      { id: 'combo_6_multiplicator', name: 'Combo 6 Multiplicator', type: 'text', previewText: 'x3' },
      { id: 'combo_4_title', name: 'Combo 4 Title', type: 'text', previewText: 'COMBO 4' },
      { id: 'combo_4_points', name: 'Combo 4 Points', type: 'text', previewText: '+200' },
      { id: 'combo_4_multiplicator', name: 'Combo 4 Multiplicator', type: 'text', previewText: 'x2' },
      { id: 'combo_2_title', name: 'Combo 2 Title', type: 'text', previewText: 'COMBO 2' },
      { id: 'combo_2_points', name: 'Combo 2 Points', type: 'text', previewText: '+100' },
      { id: 'combo_2_multiplicator', name: 'Combo 2 Multiplicator', type: 'text', previewText: 'x1' },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    mainImageId: 'team_name_container_image',
    items: [
      { id: 'team_name_container_image', name: 'Team Name Container', type: 'image' },
      { id: 'team_name_text', name: 'Team Name Text', type: 'text', previewText: 'TEAM 1' },
    ],
  },
  {
    id: 'score',
    name: 'Score',
    mainImageId: 'score_image',
    items: [
      { id: 'score_image', name: 'Score Image', type: 'image' },
      { id: 'score_title', name: 'Score Title', type: 'text', previewText: 'SCORE', parentId: 'score_image' },
      { id: 'score_points_text', name: 'Score Points', type: 'text', previewText: '1500', parentId: 'score_image' },
    ],
  },
];

export function buildGroups(numQuests: number): GroupDef[] {
  const groups: GroupDef[] = [...STATIC_GROUPS];
  for (let i = 1; i <= numQuests; i++) {
    groups.push({
      id: `quest_${i}`,
      name: `Quest ${i}`,
      mainImageId: `placement_${i}`,
      questIndex: i,
      items: [
        { id: `placement_${i}`, name: `Placement ${i}`, type: 'image' },
        { id: `quest_${i}_image`, name: `Quest ${i} Main Image`, type: 'image' },
        { id: `quest_${i}_name`, name: `Quest ${i} Name`, type: 'text', previewText: `Quest ${i}` },
        { id: `quest_${i}_points`, name: `Quest ${i} Points`, type: 'text', previewText: '+100' },
        { id: `quest_${i}_multiplicator`, name: `Quest ${i} Multiplicator`, type: 'text', previewText: 'x1' },
      ],
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
  const m = elementId.match(/^(?:placement_|quest_)(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function getQuestItemRole(elementId: string): string | null {
  if (/^placement_\d+$/.test(elementId)) return 'main';
  const m = elementId.match(/^quest_\d+_(.+)$/);
  return m ? m[1] : null;
}

export function getCounterpartId(elementId: string, targetQuestIndex: number): string | null {
  if (/^placement_\d+$/.test(elementId)) return `placement_${targetQuestIndex}`;
  const m = elementId.match(/^quest_\d+_(.+)$/);
  if (m) return `quest_${targetQuestIndex}_${m[1]}`;
  return null;
}
