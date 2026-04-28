// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { type GroupDef, getQuestIndexFromElementId, getCounterpartId, getQuestItemRole } from './layoutGroups';

interface BaseElement {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hidden?: boolean;
}

export function clampQuestInnerElement<T extends BaseElement>(
  element: T,
  elements: T[]
): T {
  const questIdx = getQuestIndexFromElementId(element.id);
  if (questIdx === null) return element;
  const role = getQuestItemRole(element.id);
  if (role === 'main' || role === null) return element;

  const placement = elements.find(el => el.id === `placement_${questIdx}`);
  if (!placement) return element;

  const clampedX = Math.max(placement.x, Math.min(placement.x + placement.width - element.width, element.x));
  const clampedY = Math.max(placement.y, Math.min(placement.y + placement.height - element.height, element.y));
  const clampedWidth = Math.min(element.width, placement.width);
  const clampedHeight = Math.min(element.height, placement.height);

  if (clampedX === element.x && clampedY === element.y && clampedWidth === element.width && clampedHeight === element.height) {
    return element;
  }
  return { ...element, x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight };
}

function isQuest1Element(elementId: string): boolean {
  const idx = getQuestIndexFromElementId(elementId);
  return idx === 1;
}

function getAllQuestGroups(groups: GroupDef[]): GroupDef[] {
  return groups.filter(g => g.questIndex !== undefined);
}

export function syncQuestElementMove<T extends BaseElement>(
  elements: T[],
  updatedId: string,
  newX: number,
  newY: number,
  groups: GroupDef[]
): T[] {
  if (!isQuest1Element(updatedId)) {
    return elements.map(el => el.id === updatedId ? { ...el, x: newX, y: newY } : el);
  }

  const questGroups = getAllQuestGroups(groups);
  if (questGroups.length <= 1) {
    return elements.map(el => el.id === updatedId ? { ...el, x: newX, y: newY } : el);
  }

  const placement1 = elements.find(el => el.id === 'placement_1');
  if (!placement1) {
    return elements.map(el => el.id === updatedId ? { ...el, x: newX, y: newY } : el);
  }

  const isMainImage = updatedId === 'placement_1';
  const offsetX = newX - placement1.x;
  const offsetY = newY - placement1.y;

  const relOffsetX = newX - (isMainImage ? placement1.x : placement1.x);
  const relOffsetY = newY - (isMainImage ? placement1.y : placement1.y);

  return elements.map(el => {
    if (el.id === updatedId) return { ...el, x: newX, y: newY };

    const elQuestIdx = getQuestIndexFromElementId(el.id);
    if (elQuestIdx === null || elQuestIdx === 1) return el;

    const counterpart1Id = getCounterpartId(el.id, 1);
    if (!counterpart1Id) return el;

    if (isMainImage) {
      if (el.id === `placement_${elQuestIdx}`) {
        return el;
      }
      return el;
    }

    const placementN = elements.find(p => p.id === `placement_${elQuestIdx}`);
    if (!placementN) return el;

    const counterpartId = getCounterpartId(updatedId, elQuestIdx);
    if (!counterpartId || el.id !== counterpartId) return el;

    return { ...el, x: placementN.x + relOffsetX, y: placementN.y + relOffsetY };
  });
}

export function syncQuestElementResize<T extends BaseElement>(
  elements: T[],
  updatedId: string,
  newX: number,
  newY: number,
  newWidth: number,
  newHeight: number,
  groups: GroupDef[]
): T[] {
  if (!isQuest1Element(updatedId)) {
    return elements.map(el => el.id === updatedId ? { ...el, x: newX, y: newY, width: newWidth, height: newHeight } : el);
  }

  const questGroups = getAllQuestGroups(groups);
  if (questGroups.length <= 1) {
    return elements.map(el => el.id === updatedId ? { ...el, x: newX, y: newY, width: newWidth, height: newHeight } : el);
  }

  const placement1 = elements.find(el => el.id === 'placement_1');
  if (!placement1) {
    return elements.map(el => el.id === updatedId ? { ...el, x: newX, y: newY, width: newWidth, height: newHeight } : el);
  }

  const isMainImage = updatedId === 'placement_1';

  const relOffsetX = newX - placement1.x;
  const relOffsetY = newY - placement1.y;

  return elements.map(el => {
    if (el.id === updatedId) return { ...el, x: newX, y: newY, width: newWidth, height: newHeight };

    const elQuestIdx = getQuestIndexFromElementId(el.id);
    if (elQuestIdx === null || elQuestIdx === 1) return el;

    if (isMainImage) {
      if (el.id === `placement_${elQuestIdx}`) {
        return { ...el, width: newWidth, height: newHeight };
      }
      return el;
    }

    const placementN = elements.find(p => p.id === `placement_${elQuestIdx}`);
    if (!placementN) return el;

    const counterpartId = getCounterpartId(updatedId, elQuestIdx);
    if (!counterpartId || el.id !== counterpartId) return el;

    return { ...el, x: placementN.x + relOffsetX, y: placementN.y + relOffsetY, width: newWidth, height: newHeight };
  });
}

export function syncQuestElementFontSize<T extends BaseElement & { fontSize?: number }>(
  elements: T[],
  updatedId: string,
  fontSize: number,
  groups: GroupDef[]
): T[] {
  if (!isQuest1Element(updatedId)) {
    return elements.map(el => el.id === updatedId ? { ...el, fontSize } : el);
  }

  const questGroups = getAllQuestGroups(groups);
  if (questGroups.length <= 1) {
    return elements.map(el => el.id === updatedId ? { ...el, fontSize } : el);
  }

  const role = updatedId.replace(/^quest_1_/, '');

  return elements.map(el => {
    if (el.id === updatedId) return { ...el, fontSize };
    const elQuestIdx = getQuestIndexFromElementId(el.id);
    if (elQuestIdx === null || elQuestIdx === 1) return el;
    if (el.id === `quest_${elQuestIdx}_${role}`) return { ...el, fontSize };
    return el;
  });
}

export function syncQuestElementFontFamily<T extends BaseElement & { fontFamily?: string }>(
  elements: T[],
  updatedId: string,
  fontFamily: string,
  groups: GroupDef[]
): T[] {
  if (!isQuest1Element(updatedId)) {
    return elements.map(el => el.id === updatedId ? { ...el, fontFamily } : el);
  }

  const questGroups = getAllQuestGroups(groups);
  if (questGroups.length <= 1) {
    return elements.map(el => el.id === updatedId ? { ...el, fontFamily } : el);
  }

  const role = updatedId.replace(/^quest_1_/, '');

  return elements.map(el => {
    if (el.id === updatedId) return { ...el, fontFamily };
    const elQuestIdx = getQuestIndexFromElementId(el.id);
    if (elQuestIdx === null || elQuestIdx === 1) return el;
    if (el.id === `quest_${elQuestIdx}_${role}`) return { ...el, fontFamily };
    return el;
  });
}

export function syncQuestElementColor<T extends BaseElement & { color?: string }>(
  elements: T[],
  updatedId: string,
  color: string,
  groups: GroupDef[]
): T[] {
  if (!isQuest1Element(updatedId)) {
    return elements.map(el => el.id === updatedId ? { ...el, color } : el);
  }

  const questGroups = getAllQuestGroups(groups);
  if (questGroups.length <= 1) {
    return elements.map(el => el.id === updatedId ? { ...el, color } : el);
  }

  const role = updatedId.replace(/^quest_1_/, '');

  return elements.map(el => {
    if (el.id === updatedId) return { ...el, color };
    const elQuestIdx = getQuestIndexFromElementId(el.id);
    if (elQuestIdx === null || elQuestIdx === 1) return el;
    if (el.id === `quest_${elQuestIdx}_${role}`) return { ...el, color };
    return el;
  });
}

export function alignQuestMainImagesVertically<T extends BaseElement>(
  elements: T[],
  numQuests: number
): T[] {
  const placement1 = elements.find(el => el.id === 'placement_1');
  if (!placement1) return elements;
  const refX = placement1.x;
  return elements.map(el => {
    if (/^placement_\d+$/.test(el.id)) {
      return { ...el, x: refX };
    }
    return el;
  });
}

export function buildQuestGroupElements<T extends BaseElement>(
  quest1Elements: T[],
  numQuests: number,
  availableItemIds: string[],
  makeTextElement: (id: string, name: string, previewText: string, x: number, y: number) => T,
  makeImageElement: (id: string, x: number, y: number, width: number, height: number) => T
): T[] {
  const placement1 = quest1Elements.find(el => el.id === 'placement_1');
  if (!placement1) return [];

  const newElements: T[] = [];

  for (let n = 2; n <= numQuests; n++) {
    const placementId = `placement_${n}`;
    if (availableItemIds.includes(placementId)) {
      const existsAlready = quest1Elements.find(el => el.id === placementId);
      if (!existsAlready) {
        const newX = placement1.x;
        const newY = placement1.y + (n - 1) * (placement1.height + 1);
        newElements.push(makeImageElement(placementId, newX, newY, placement1.width, placement1.height));

        const pointsEl = quest1Elements.find(el => el.id === 'quest_1_points');
        if (pointsEl && availableItemIds.includes(`quest_${n}_points`)) {
          const offX = pointsEl.x - placement1.x;
          const offY = pointsEl.y - placement1.y;
          newElements.push({ ...pointsEl, id: `quest_${n}_points`, name: `Quest ${n} Points`, x: newX + offX, y: newY + offY } as T);
        }

        const multEl = quest1Elements.find(el => el.id === 'quest_1_multiplicator');
        if (multEl && availableItemIds.includes(`quest_${n}_multiplicator`)) {
          const offX = multEl.x - placement1.x;
          const offY = multEl.y - placement1.y;
          newElements.push({ ...multEl, id: `quest_${n}_multiplicator`, name: `Quest ${n} Multiplicator`, x: newX + offX, y: newY + offY } as T);
        }
      }
    }
  }

  return newElements;
}
