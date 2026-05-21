// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Send, Maximize2, Minimize2, ChevronLeft, ChevronRight, LayoutGrid as Layout, Type, Image, Eye, EyeOff, ChevronDown, ChevronRight as ChevronRightSm, Layers, Download } from 'lucide-react';
import { db } from '../lib/db';
import { getMediaUrl } from '../utils/mediaUrl';
import { Alert } from './Alert';
import { authService } from '../services/authService';
import { buildGroups, getGroupForElement, getQuestIndexFromElementId, getCounterpartId, getQuestItemRole, type GroupDef } from '../utils/layoutGroups';
import { alignQuestMainImagesVertically, clampQuestInnerElement } from '../utils/questSync';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface ImageElement {
  type: 'image';
  id: string;
  name: string;
  filename: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hidden?: boolean;
}

interface TextElement {
  type: 'text';
  id: string;
  name: string;
  previewText: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  hidden?: boolean;
}

type LayoutElement = ImageElement | TextElement;

interface LayoutEditorProps {
  scenarioId: string;
  onBack: () => void;
  initialLayoutMode?: 'instruction' | 'game';
}


export function LayoutEditor({ scenarioId, onBack, initialLayoutMode }: LayoutEditorProps) {

  const [backgroundImage, setBackgroundImage] = useState<string>('');
  const [elements, setElements] = useState<LayoutElement[]>([]);
  const [availableImages, setAvailableImages] = useState<{ id: string; name: string; filename: string }[]>([]);
  const [isTagquestGame, setIsTagquestGame] = useState(false);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [layoutStatus, setLayoutStatus] = useState<'draft' | 'active' | 'archived'>('active');
  const [layoutUniqid, setLayoutUniqid] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [scenarioUniqid, setScenarioUniqid] = useState<string>('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showHorizontalGuide, setShowHorizontalGuide] = useState(false);
  const [showVerticalGuide, setShowVerticalGuide] = useState(false);
  const [showColumnGuides, setShowColumnGuides] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [scenarioType, setScenarioType] = useState<string>('');
  const [currentVersion, setCurrentVersion] = useState<number>(1.0);
  const [isMysteryGame, setIsMysteryGame] = useState(false);
  const [layoutMode, setLayoutMode] = useState<'instruction' | 'game'>(initialLayoutMode || 'instruction');
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageBounds, setImageBounds] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [containerHeightPx, setContainerHeightPx] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [questCount, setQuestCount] = useState<number>(0);
  const [naturalAspects, setNaturalAspects] = useState<Record<string, number>>({});
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const panOffsetRef = useRef(panOffset);

  const instructionLayoutImages = ['game_instructions_image', 'game_instructions_button_image', 'game_refresh_button_image'];

  const groups: GroupDef[] = isTagquestGame ? buildGroups(questCount) : [];

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const selectAndExpandElement = (elementId: string) => {
    setSelectedElement(elementId);
    const ownerGroup = groups.find(g => g.items.some(item => item.id === elementId));
    if (ownerGroup) {
      setExpandedGroups(prev => {
        if (prev.has(ownerGroup.id)) return prev;
        const next = new Set(prev);
        next.add(ownerGroup.id);
        return next;
      });
    }
  };

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  useEffect(() => {
    loadScenario();
  }, [scenarioId]);

  const calculateImageBounds = () => {
    if (!containerRef.current || !imageRef.current) return;

    const img = imageRef.current;

    const containerWidth = containerRef.current.offsetWidth;
    const cHeight = containerRef.current.offsetHeight;
    const imgAspectRatio = img.naturalWidth / img.naturalHeight;
    const containerAspectRatio = containerWidth / cHeight;

    let actualWidth, actualHeight, offsetX, offsetY;

    if (imgAspectRatio > containerAspectRatio) {
      actualWidth = containerWidth;
      actualHeight = containerWidth / imgAspectRatio;
      offsetX = 0;
      offsetY = (cHeight - actualHeight) / 2;
    } else {
      actualHeight = cHeight;
      actualWidth = cHeight * imgAspectRatio;
      offsetY = 0;
      offsetX = (containerWidth - actualWidth) / 2;
    }

    setContainerHeightPx(cHeight);
    setImageBounds({
      x: (offsetX / containerWidth) * 100,
      y: (offsetY / cHeight) * 100,
      width: (actualWidth / containerWidth) * 100,
      height: (actualHeight / cHeight) * 100
    });
  };

  useEffect(() => {
    const recalc = () => setTimeout(calculateImageBounds, 50);
    recalc();
    window.addEventListener('resize', calculateImageBounds);
    return () => window.removeEventListener('resize', calculateImageBounds);
  }, [backgroundImage, isFullscreen]);

  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeightPx(containerRef.current.getBoundingClientRect().height);
      }
    };
    const delayed = () => setTimeout(updateHeight, 50);
    delayed();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [isFullscreen]);

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || e.altKey) {
        const rect = wrap.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        const prevZoom = zoomRef.current;
        const nextZoom = Math.min(8, Math.max(0.25, prevZoom * factor));
        const pan = panOffsetRef.current;
        const nextPan = {
          x: mouseX - (mouseX - pan.x) * (nextZoom / prevZoom),
          y: mouseY - (mouseY - pan.y) * (nextZoom / prevZoom),
        };
        zoomRef.current = nextZoom;
        panOffsetRef.current = nextPan;
        setZoom(nextZoom);
        setPanOffset(nextPan);
      } else {
        const pan = panOffsetRef.current;
        const nextPan = { x: pan.x - e.deltaX, y: pan.y - e.deltaY };
        panOffsetRef.current = nextPan;
        setPanOffset(nextPan);
      }
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, []);

  const loadScenario = async () => {
    try {
      const email = authService.getEmail() || '';
      setUserEmail(email);

      const { data, error } = await db
        .from('scenarios')
        .select('media, data, scenario_type, scenario_layout, uniqid')
        .eq('id', scenarioId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      setScenarioUniqid((data as any).uniqid || '');

      const media = data.media as any;
      const gameData = data.data as any;
      const scenarioLayout = data.scenario_layout as any;

      const hasMysteryStructure = gameData?.game_meta?.enigmas && Array.isArray(gameData.game_meta.enigmas);
      setIsMysteryGame(hasMysteryStructure);

      let actualGameType = '';
      if (hasMysteryStructure) {
        actualGameType = 'mystery';
      } else if (gameData?.game_meta || gameData?.game) {
        actualGameType = 'tagquest';
      } else {
        actualGameType = data.scenario_type || '';
      }

      const numQuests = actualGameType === 'tagquest'
        ? 6
        : parseInt(gameData?.game_meta?.number_of_quests || '0', 10);
      setQuestCount(numQuests);

      setScenarioType(actualGameType);

      if (actualGameType) {
        const metaKey = (actualGameType === 'mystery' || actualGameType === 'tracks')
          ? `${actualGameType}_layout_${initialLayoutMode || 'instruction'}`
          : `${actualGameType}_layout`;
        const { data: configData } = await db
          .from('default_config')
          .select('version')
          .eq('meta', metaKey)
          .maybeSingle();
        if (configData?.version) setCurrentVersion(Number(configData.version));
      }

      const isTagquest = actualGameType === 'tagquest';
      setIsTagquestGame(isTagquest);

      if (media?.images?.background_image) {
        setBackgroundImage(getMediaUrl(scenarioId, media.images.background_image));
      } else if (media?.game_media_images?.background_image) {
        setBackgroundImage(getMediaUrl(scenarioId, media.game_media_images.background_image));
      }

      const imagesList: { id: string; name: string; filename: string }[] = [];

      if (media?.images?.game_instructions_image) {
        imagesList.push({ id: 'game_instructions_image', name: 'Game Instructions Image', filename: media.images.game_instructions_image });
      }
      if (media?.images?.game_instructions_button_image) {
        imagesList.push({ id: 'game_instructions_button_image', name: 'Instructions Button Image', filename: media.images.game_instructions_button_image });
      }
      if (media?.images?.game_refresh_button_image) {
        imagesList.push({ id: 'game_refresh_button_image', name: 'Refresh Button Image', filename: media.images.game_refresh_button_image });
      }
      if (media?.images?.time_background_image) {
        imagesList.push({ id: 'time_background_image', name: 'Time Background Image', filename: media.images.time_background_image });
      }
      if (media?.images?.score_background_image) {
        imagesList.push({ id: 'score_background_image', name: 'Score Background Image', filename: media.images.score_background_image });
      }
      if (media?.images?.enigmas_header_image) {
        imagesList.push({ id: 'enigmas_header_image', name: 'Enigmas Header Image', filename: media.images.enigmas_header_image });
      }
      if (media?.overscores?.[0]?.image_overscore_step) {
        imagesList.push({ id: 'overscore_step_1_image', name: 'Overscore Step 1 Image', filename: media.overscores[0].image_overscore_step });
      }
      if (media?.enigmas?.[0]?.good_answer_image) {
        imagesList.push({ id: 'enigma_1_good_answer_image', name: 'Enigma 1 Good Answer Image', filename: media.enigmas[0].good_answer_image });
      }

      const gmi = media?.game_media_images || media?.images || {};
      const comboImg = gmi.combo_image;
      if (comboImg) {
        imagesList.push({ id: 'combo_image', name: 'Combos Container', filename: comboImg });
      }
      const malusContainerImg = gmi.malus_container || gmi.malus_image;
      if (malusContainerImg) {
        imagesList.push({ id: 'malus_image', name: 'Malus Container', filename: malusContainerImg });
        imagesList.push({ id: 'late_malus_container_image', name: 'Late Malus Container', filename: malusContainerImg });
      }
      if (gmi.malus_image) {
        imagesList.push({ id: 'malus_icon_image', name: 'Malus Image', filename: gmi.malus_image });
      }
      if (gmi.late_malus_image) {
        imagesList.push({ id: 'late_malus_icon_image', name: 'Late Malus Image', filename: gmi.late_malus_image });
      }
      const rectImg = gmi.team_name_container_image || gmi.rectangle_image;
      if (rectImg) imagesList.push({ id: 'team_name_container_image', name: 'Team Name Container', filename: rectImg });
      const timerImg = gmi.timer_container_image || rectImg;
      if (timerImg) imagesList.push({ id: 'timer_container_image', name: 'Timer Container', filename: timerImg });
      if (gmi.quest_counter_image && numQuests > 0) {
        const questsMedia: any[] = media?.quests || [];
        const firstQuestMainImage = questsMedia[0]?.main_image || gmi.quest_counter_image;
        imagesList.push({ id: 'animation_quest_image', name: 'Animation Quest Main Image', filename: firstQuestMainImage });
        for (let i = 1; i <= numQuests; i++) {
          imagesList.push({ id: `placement_${i}`, name: `Placement ${i}`, filename: gmi.quest_counter_image });
          const questMainImage = questsMedia[i - 1]?.main_image || gmi.quest_counter_image;
          imagesList.push({ id: `quest_${i}_image`, name: `Quest ${i} Main Image`, filename: questMainImage });
        }
      }
      if (gmi.score_image) {
        imagesList.push({ id: 'score_image', name: 'Score Image', filename: gmi.score_image });
      }

      setAvailableImages(imagesList);

      if (scenarioLayout?.elements) {
        setElements(scenarioLayout.elements);
      } else if (media?.layout?.elements) {
        setElements(media.layout.elements);
      }
    } catch (error) {
      console.error('Error loading scenario:', error);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, elementId: string) => {
    e.preventDefault();
    selectAndExpandElement(elementId);
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, elementId: string) => {
    e.preventDefault();
    e.stopPropagation();
    selectAndExpandElement(elementId);
    setIsResizing(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const syncGroupChildren = (prev: LayoutElement[], updatedEl: LayoutElement, isDragOrResize: 'drag' | 'resize'): LayoutElement[] => {
    const group = getGroupForElement(updatedEl.id, groups);
    const questIdx = getQuestIndexFromElementId(updatedEl.id);
    const isQuest1El = questIdx === 1;
    const isMainImage = group ? group.mainImageId === updatedEl.id : false;

    const afterGroupSync = (() => {
      if (!group || !isMainImage) {
        return prev.map(el => el.id === updatedEl.id ? updatedEl : el);
      }
      const oldMain = prev.find(el => el.id === updatedEl.id);
      if (!oldMain) return prev.map(el => el.id === updatedEl.id ? updatedEl : el);
      const dx = updatedEl.x - oldMain.x;
      const dy = updatedEl.y - oldMain.y;
      const dw = updatedEl.width - oldMain.width;
      const dh = updatedEl.height - oldMain.height;
      return prev.map(el => {
        if (el.id === updatedEl.id) return updatedEl;
        if (!group.items.some(item => item.id === el.id)) return el;
        if (isDragOrResize === 'drag') {
          return { ...el, x: el.x + dx, y: el.y + dy };
        } else {
          return { ...el, x: el.x + dx, y: el.y + dy, width: Math.max(2, el.width + dw), height: Math.max(1, el.height + dh) };
        }
      });
    })();

    if (!isQuest1El) {
      return afterGroupSync.map(el => {
        const role = getQuestItemRole(el.id);
        if (role === 'main' || role === null) return el;
        return clampQuestInnerElement(el, afterGroupSync);
      });
    }

    const questGroups = groups.filter(g => g.questIndex !== undefined);
    if (questGroups.length <= 1) return afterGroupSync;

    const placement1 = afterGroupSync.find(el => el.id === 'placement_1');
    if (!placement1) return afterGroupSync;

    const isPlacement1 = updatedEl.id === 'placement_1';

    const questSynced = afterGroupSync.map(el => {
      const elQuestIdx = getQuestIndexFromElementId(el.id);
      if (elQuestIdx === null || elQuestIdx === 1) return el;

      const placementN = afterGroupSync.find(p => p.id === `placement_${elQuestIdx}`);
      if (!placementN) return el;

      if (isPlacement1) {
        if (isDragOrResize === 'resize' && el.id === `placement_${elQuestIdx}`) {
          return { ...el, width: updatedEl.width, height: updatedEl.height };
        }
        return el;
      }

      const counterpartId = getCounterpartId(updatedEl.id, elQuestIdx);
      if (!counterpartId || el.id !== counterpartId) return el;

      const relOffsetX = updatedEl.x - placement1.x;
      const relOffsetY = updatedEl.y - placement1.y;

      if (isDragOrResize === 'drag') {
        return { ...el, x: placementN.x + relOffsetX, y: placementN.y + relOffsetY };
      } else {
        return { ...el, x: placementN.x + relOffsetX, y: placementN.y + relOffsetY, width: updatedEl.width, height: updatedEl.height };
      }
    });

    return questSynced.map(el => {
      const questIdx = getQuestIndexFromElementId(el.id);
      if (questIdx === null) return el;
      const role = getQuestItemRole(el.id);
      if (role === 'main' || role === null) return el;
      return clampQuestInnerElement(el, questSynced);
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current || !selectedElement) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    if (isDragging) {
      const deltaXContainer = ((e.clientX - dragStart.x) / rect.width) * 100;
      const deltaYContainer = ((e.clientY - dragStart.y) / rect.height) * 100;
      const deltaX = (deltaXContainer / imageBounds.width) * 100;
      const deltaY = (deltaYContainer / imageBounds.height) * 100;

      setElements(prev => {
        const current = prev.find(el => el.id === selectedElement);
        if (!current) return prev;
        const newX = current.x + deltaX;
        const newY = current.y + deltaY;
        const updated = { ...current, x: newX, y: newY };
        return syncGroupChildren(prev, updated, 'drag');
      });

      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (isResizing) {
      const deltaXContainer = ((e.clientX - dragStart.x) / rect.width) * 100;
      const deltaYContainer = ((e.clientY - dragStart.y) / rect.height) * 100;
      const deltaX = (deltaXContainer / imageBounds.width) * 100;
      const deltaY = (deltaYContainer / imageBounds.height) * 100;

      setElements(prev => {
        const current = prev.find(el => el.id === selectedElement);
        if (!current) return prev;
        const newWidth = Math.max(5, Math.min(100 - current.x, current.width + deltaX));
        const newHeight = Math.max(2, Math.min(100 - current.y, current.height + deltaY));
        const updated = { ...current, width: newWidth, height: newHeight };
        return syncGroupChildren(prev, updated, 'resize');
      });

      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setIsPanning(false);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    handleMouseMove(e);
  };

  const resetZoom = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const addImageElement = (image: { id: string; name: string; filename: string }) => {
    if (elements.find(el => el.id === image.id)) return;

    const newElement: ImageElement = {
      type: 'image',
      id: image.id,
      name: image.name,
      filename: image.filename,
      x: 5,
      y: 5,
      width: 20,
      height: 20
    };

    setElements(prev => [...prev, newElement]);
  };

  const addTextElement = (field: { id: string; name: string; previewText: string }) => {
    if (elements.find(el => el.id === field.id)) return;

    const newElement: TextElement = {
      type: 'text',
      id: field.id,
      name: field.name,
      previewText: field.previewText,
      x: 5,
      y: 5,
      width: 20,
      height: 5,
      fontSize: 3
    };

    setElements(prev => [...prev, newElement]);
  };

  const addSingleGroupItem = (group: GroupDef, itemId: string, currentElements: LayoutElement[]): LayoutElement[] => {
    if (currentElements.find(el => el.id === itemId)) return currentElements;
    const itemDef = group.items.find(i => i.id === itemId);
    if (!itemDef) return currentElements;
    if (itemDef.type === 'image') {
      const imgInfo = availableImages.find(img => img.id === itemId);
      if (!imgInfo) return currentElements;
      const newEl: ImageElement = {
        type: 'image', id: imgInfo.id, name: imgInfo.name, filename: imgInfo.filename,
        x: 5, y: 5, width: 20, height: 20
      };
      return [...currentElements, newEl];
    } else {
      const newEl: TextElement = {
        type: 'text', id: itemDef.id, name: itemDef.name, previewText: itemDef.previewText || '',
        x: 5, y: 5, width: 20, height: 5, fontSize: 3
      };
      return [...currentElements, newEl];
    }
  };

  const addGroupItem = (group: GroupDef, itemId: string) => {
    if (elements.find(el => el.id === itemId)) return;
    const questIdx = getQuestIndexFromElementId(itemId);
    const isQuest1Item = questIdx === 1;

    if (!isQuest1Item) {
      setElements(prev => addSingleGroupItem(group, itemId, prev));
      return;
    }

    const questGroups = groups.filter(g => g.questIndex !== undefined);
    if (questGroups.length <= 1) {
      setElements(prev => addSingleGroupItem(group, itemId, prev));
      return;
    }

    setElements(prev => {
      let updated = addSingleGroupItem(group, itemId, prev);
      const placement1 = updated.find(el => el.id === 'placement_1');

      for (let n = 2; n <= questGroups.length; n++) {
        const counterpartId = getCounterpartId(itemId, n);
        if (!counterpartId) continue;
        if (updated.find(el => el.id === counterpartId)) continue;

        const nGroup = questGroups.find(g => g.questIndex === n);
        if (!nGroup) continue;
        const nItemDef = nGroup.items.find(i => i.id === counterpartId);
        if (!nItemDef) continue;

        const sourceEl = updated.find(el => el.id === itemId);
        if (!sourceEl) continue;

        if (nItemDef.type === 'image') {
          const imgInfo = availableImages.find(img => img.id === counterpartId);
          if (!imgInfo) continue;
          const placementN = updated.find(p => p.id === `placement_${n}`);
          const baseY = placementN ? placementN.y : sourceEl.y + (n - 1) * (sourceEl.height + 1);
          const baseX = placement1 ? placement1.x : sourceEl.x;
          const newEl: ImageElement = {
            type: 'image', id: imgInfo.id, name: imgInfo.name, filename: imgInfo.filename,
            x: baseX, y: baseY, width: sourceEl.width, height: sourceEl.height
          };
          updated = [...updated, newEl];
        } else {
          const placementN = updated.find(p => p.id === `placement_${n}`);
          const pl1 = updated.find(p => p.id === 'placement_1') || sourceEl;
          const offX = sourceEl.x - pl1.x;
          const offY = sourceEl.y - pl1.y;
          const baseX = placementN ? placementN.x + offX : sourceEl.x;
          const baseY = placementN ? placementN.y + offY : sourceEl.y + (n - 1) * 6;
          const newEl: TextElement = {
            ...sourceEl as TextElement,
            id: counterpartId,
            name: nItemDef.name,
            x: baseX,
            y: baseY,
          };
          updated = [...updated, newEl];
        }
      }
      return updated;
    });
  };

  const addAllGroupItems = (group: GroupDef) => {
    const questIdx = group.questIndex;
    if (questIdx !== 1) {
      group.items.forEach(item => {
        if (!elements.find(el => el.id === item.id)) {
          setElements(prev => addSingleGroupItem(group, item.id, prev));
        }
      });
      return;
    }
    group.items.forEach(item => addGroupItem(group, item.id));
  };

  const removeAllGroupItems = (group: GroupDef) => {
    const questIdx = group.questIndex;
    if (questIdx !== 1) {
      const idsToRemove = new Set(group.items.map(i => i.id));
      setElements(prev => prev.filter(el => !idsToRemove.has(el.id)));
      setSelectedElement(prev => (prev && idsToRemove.has(prev) ? null : prev));
      return;
    }
    const questGroups = groups.filter(g => g.questIndex !== undefined);
    const idsToRemove = new Set(questGroups.flatMap(g => g.items.map(i => i.id)));
    setElements(prev => prev.filter(el => !idsToRemove.has(el.id)));
    setSelectedElement(prev => (prev && idsToRemove.has(prev) ? null : prev));
  };

  const alignQuestsVertically = () => {
    setElements(prev => alignQuestMainImagesVertically(prev, questCount));
  };

  const removeElement = (elementId: string) => {
    setElements(prev => prev.filter(el => el.id !== elementId));
    if (selectedElement === elementId) {
      setSelectedElement(null);
    }
  };

  const toggleElementHidden = (elementId: string) => {
    setElements(prev => prev.map(el =>
      el.id === elementId ? { ...el, hidden: !el.hidden } : el
    ));
  };

  const updateFontSize = (elementId: string, delta: number) => {
    const questIdx = getQuestIndexFromElementId(elementId);
    const isQuest1Text = questIdx === 1 && elementId !== 'placement_1';
    setElements(prev => {
      const updated = prev.map(el => {
        if (el.id === elementId && el.type === 'text') {
          return { ...el, fontSize: Math.max(0.5, Math.min(200, parseFloat((el.fontSize + delta).toFixed(1)))) };
        }
        return el;
      });
      if (!isQuest1Text) return updated;
      const updatedEl = updated.find(el => el.id === elementId);
      if (!updatedEl || updatedEl.type !== 'text') return updated;
      const role = elementId.replace(/^quest_1_/, '');
      const questGroups = groups.filter(g => g.questIndex !== undefined);
      if (questGroups.length <= 1) return updated;
      return updated.map(el => {
        if (el.type !== 'text') return el;
        const elQIdx = getQuestIndexFromElementId(el.id);
        if (elQIdx === null || elQIdx === 1) return el;
        if (el.id === `quest_${elQIdx}_${role}`) return { ...el, fontSize: updatedEl.fontSize };
        return el;
      });
    });
  };

  const fitElementContent = (elementId: string) => {
    setElements(prev => {
      const el = prev.find(e => e.id === elementId);
      if (!el) return prev;
      if (el.type === 'text') {
        const newHeight = parseFloat(((el.fontSize / 100) * 1.6).toFixed(2));
        const clamped = Math.max(1, Math.min(100 - el.y, newHeight));
        return prev.map(e => e.id === elementId ? { ...e, height: clamped } : e);
      }
      if (el.type === 'image') {
        const aspect = naturalAspects[elementId];
        if (!aspect) return prev;
        const containerAspect = imageBounds.width / imageBounds.height;
        const newHeight = parseFloat(((el.width / aspect) * containerAspect).toFixed(2));
        const clamped = Math.max(1, Math.min(100 - el.y, newHeight));
        return prev.map(e => e.id === elementId ? { ...e, height: clamped } : e);
      }
      return prev;
    });
  };

  const downloadLayoutJSON = () => {
    const exportData = {
      scenarioId,
      scenarioType,
      layoutMode,
      elements,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenarioType}_layout_${currentVersion.toFixed(1)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveLayout = async () => {
    try {
      setSaving(true);

      if (!scenarioType) {
        setAlert({ type: 'error', message: 'Cannot save: Game type not detected. Please reload the scenario.' });
        setSaving(false);
        return;
      }

      const layoutData = { elements };

      let metaKey = '';
      if (scenarioType === 'mystery' || scenarioType === 'tracks') {
        metaKey = `${scenarioType}_layout_${layoutMode}`;
      } else {
        metaKey = `${scenarioType}_layout`;
      }

      if (!metaKey) {
        throw new Error('Meta key is empty. Cannot save layout without a valid key.');
      }

      const { data: existingConfig, error: fetchError } = await db
        .from('default_config')
        .select('version, layout_uniqid')
        .eq('meta', metaKey)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const existingVersion = existingConfig?.version || 1.0;
      const newVersion = Number((existingVersion + 0.1).toFixed(1));

      const existingUniqid = (existingConfig as any)?.layout_uniqid || layoutUniqid;
      const uniqid = existingUniqid || `layout_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      const { error: upsertError } = await db
        .from('default_config')
        .upsert({
          meta: metaKey,
          value: layoutData,
          version: newVersion,
          layout_uniqid: uniqid,
          updated_at: new Date().toISOString()
        }, { onConflict: 'meta' })
        .select();

      if (upsertError) throw upsertError;

      setLayoutUniqid(uniqid);
      setCurrentVersion(newVersion);
      setAlert({ type: 'success', message: `Layout saved as "${metaKey}" (v${newVersion})` });
    } catch (error) {
      console.error('Error saving layout:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save layout.';
      setAlert({ type: 'error', message: `Save failed: ${errorMessage}` });
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!userEmail) {
      setAlert({ type: 'error', message: 'You must be logged in to publish layouts.' });
      return;
    }
    setPublishing(true);
    try {
      await saveLayout();

      const { data: existingConfig } = await db
        .from('default_config')
        .select('version')
        .eq('meta', scenarioType === 'mystery' || scenarioType === 'tracks' ? `${scenarioType}_layout_${layoutMode}` : `${scenarioType}_layout`)
        .maybeSingle();
      const newVersion = Number(((existingConfig?.version || 1.0) + 0.1).toFixed(1));

      const authToken = authService.getToken();

      const payload = {
        email: userEmail,
        name: scenarioType,
        game_type: scenarioType,
        layout_data: { elements },
        status: layoutStatus,
        version: String(newVersion),
        scenario_uniqid: scenarioUniqid || null,
        layout_uniqid: layoutUniqid || null,
      };

      const publishUrl = `${API_BASE_URL}/layouts.php?action=upload`;
      const response = await fetch(publishUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken?.token ? { 'Authorization': `Bearer ${authToken.token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();

      if (!response.ok || !responseData.success) {
        throw new Error(responseData.error || `Failed to publish layout (${response.status})`);
      }

      setAlert({ type: 'success', message: responseData.message || 'Layout published successfully' });
    } catch (error) {
      console.error('Error publishing layout:', error);
      setAlert({ type: 'error', message: error instanceof Error ? error.message : 'Failed to publish layout' });
    } finally {
      setPublishing(false);
    }
  };

  const visibleElements = elements.filter(element => {
    if (!isMysteryGame) return true;
    if (layoutMode === 'instruction') return instructionLayoutImages.includes(element.id);
    return !instructionLayoutImages.includes(element.id);
  });

  return (
    <div className={`min-h-screen bg-gray-900 text-white ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      <div className="border-b border-gray-800 bg-gray-950">
        <div className="px-3 py-2 flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm px-2 py-1.5 rounded hover:bg-gray-800 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="w-px h-5 bg-gray-700 flex-shrink-0" />
          <h1 className="text-sm font-semibold text-white truncate max-w-[200px] flex-shrink-0">Layout Editor</h1>

          {isMysteryGame && (
            <>
              <div className="w-px h-5 bg-gray-700 flex-shrink-0" />
              <div className="flex items-center gap-1 bg-gray-900 rounded p-0.5 border border-gray-700 flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('instruction')}
                  className={`px-2.5 py-1 rounded text-xs transition flex items-center gap-1.5 ${
                    layoutMode === 'instruction' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <Layout size={12} />
                  Instruction
                </button>
                <button
                  onClick={() => setLayoutMode('game')}
                  className={`px-2.5 py-1 rounded text-xs transition flex items-center gap-1.5 ${
                    layoutMode === 'game' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <Layout size={12} />
                  Game
                </button>
              </div>
            </>
          )}

          <div className="w-px h-5 bg-gray-700 flex-shrink-0" />

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setShowVerticalGuide(v => !v)}
              className={`px-2 py-1 rounded text-xs font-mono transition-colors border ${showVerticalGuide ? 'bg-blue-900/60 border-blue-600 text-blue-300' : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'}`}
              title="Vertical guide (50%)"
            >V½</button>
            <button
              onClick={() => setShowHorizontalGuide(v => !v)}
              className={`px-2 py-1 rounded text-xs font-mono transition-colors border ${showHorizontalGuide ? 'bg-blue-900/60 border-blue-600 text-blue-300' : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'}`}
              title="Horizontal guide (50%)"
            >H½</button>
            <button
              onClick={() => setShowColumnGuides(v => !v)}
              className={`px-2 py-1 rounded text-xs font-mono transition-colors border ${showColumnGuides ? 'bg-blue-900/60 border-blue-600 text-blue-300' : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'}`}
              title="Column guides (¼ ½ ¼)"
            >⅓</button>
            <button
              onClick={() => setShowGrid(v => !v)}
              className={`px-2 py-1 rounded text-xs font-mono transition-colors border ${showGrid ? 'bg-blue-900/60 border-blue-600 text-blue-300' : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'}`}
              title="Grid"
            >#</button>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={saveLayout}
              disabled={saving || publishing}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving…' : 'Save'}
            </button>
            <select
              value={layoutStatus}
              onChange={(e) => setLayoutStatus(e.target.value as 'draft' | 'active' | 'archived')}
              className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-gray-500"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <button
              onClick={handlePublish}
              disabled={publishing || saving}
              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
            <button
              onClick={downloadLayoutJSON}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
              title="Download layout as JSON"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-white"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-45px)] relative">
        {/* Collapsible Sidebar */}
        <div
          className={`bg-gray-950 border-r border-gray-800 overflow-y-auto transition-all duration-300 flex-shrink-0 ${
            sidebarCollapsed ? 'w-0' : 'w-80'
          }`}
        >
          <div className={`p-4 ${sidebarCollapsed ? 'hidden' : ''}`}>
            {isMysteryGame && (
              <p className="text-xs text-gray-500 mb-4">
                ({layoutMode === 'instruction' ? 'Instruction' : 'Game'} Layout)
              </p>
            )}

            {/* Groups */}
            {groups.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No elements available for this scenario type.</p>
            ) : (
              <div className="space-y-2">
                {groups.map(group => {
                  const isExpanded = expandedGroups.has(group.id);
                  const groupItems = group.items.filter(item => {
                    if (item.parentId && !availableImages.find(img => img.id === item.parentId)) return false;
                    if (item.type === 'image') return !!availableImages.find(img => img.id === item.id);
                    return true;
                  });
                  if (groupItems.length === 0) return null;
                  const placedCount = groupItems.filter(item => !!elements.find(el => el.id === item.id)).length;
                  const allPlaced = placedCount === groupItems.length;
                  const mainImgInfo = availableImages.find(img => img.id === group.mainImageId);
                  return (
                    <div key={group.id} className="rounded-lg border border-gray-800 overflow-hidden">
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-800 hover:bg-gray-750 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers size={13} className="flex-shrink-0 text-blue-400" />
                          <span className="text-xs font-semibold text-white truncate">{group.name}</span>
                          <span className="text-xs text-gray-500 flex-shrink-0">{placedCount}/{groupItems.length}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isExpanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRightSm size={13} className="text-gray-400" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="bg-gray-900 border-t border-gray-800">
                          {group.questIndex === 1 && questCount > 1 && (
                            <div className="px-3 pt-2 pb-1">
                              <p className="text-xs text-amber-500/80 italic">Changes propagate to all {questCount} quests</p>
                            </div>
                          )}
                          {mainImgInfo && (
                            <div className="px-3 pt-2 pb-1">
                              <div className="w-full h-16 bg-gray-800 rounded overflow-hidden">
                                <img
                                  src={getMediaUrl(scenarioId, mainImgInfo.filename)}
                                  alt={mainImgInfo.name}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                            </div>
                          )}
                          {((!allPlaced) || placedCount > 0 || (group.questIndex === 1 && questCount > 1)) && (
                            <div className="px-2 pt-2 pb-1 flex items-center gap-1.5 flex-wrap">
                              {group.questIndex === 1 && questCount > 1 && (
                                <button
                                  onClick={() => alignQuestsVertically()}
                                  className="text-xs text-amber-400 hover:text-amber-300 px-2 py-0.5 rounded border border-amber-800 hover:border-amber-600 transition-colors"
                                  title="Align all quest images to the same X position"
                                >
                                  Align
                                </button>
                              )}
                              {!allPlaced && (
                                <button
                                  onClick={() => addAllGroupItems(group)}
                                  className="text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded border border-blue-800 hover:border-blue-600 transition-colors"
                                >
                                  {group.questIndex === 1 && questCount > 1 ? 'Add All Quests' : 'Add All'}
                                </button>
                              )}
                              {placedCount > 0 && (
                                <button
                                  onClick={() => removeAllGroupItems(group)}
                                  className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded border border-red-900 hover:border-red-700 transition-colors"
                                  title={group.questIndex === 1 && questCount > 1 ? 'Remove all quest elements' : 'Remove all elements in this group'}
                                >
                                  {group.questIndex === 1 && questCount > 1 ? 'Remove All Quests' : 'Remove All'}
                                </button>
                              )}
                            </div>
                          )}
                          <div className="px-2 py-2 space-y-1">
                            {groupItems.map(item => {
                              const placed = !!elements.find(el => el.id === item.id);
                              const element = elements.find(el => el.id === item.id);
                              const isSelected = selectedElement === item.id;
                              return (
                                <div key={item.id} className={`rounded-md transition-colors ${isSelected ? 'bg-blue-900/40 ring-1 ring-blue-600' : 'bg-gray-800/60'}`}>
                                  <div
                                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
                                    onClick={() => element && selectAndExpandElement(item.id)}
                                  >
                                    {item.type === 'text'
                                      ? <Type size={11} className="flex-shrink-0 text-emerald-400" />
                                      : <Image size={11} className="flex-shrink-0 text-blue-400" />
                                    }
                                    <span className={`text-xs flex-1 truncate ${!placed ? 'text-gray-500' : isSelected ? 'text-white' : 'text-gray-300'}`}>
                                      {item.name}
                                    </span>
                                    {placed && element ? (
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); toggleElementHidden(item.id); }}
                                          className="text-gray-400 hover:text-white transition-colors"
                                        >
                                          {element.hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); removeElement(item.id); }}
                                          className="text-red-400 hover:text-red-300 text-xs"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); addGroupItem(group, item.id); }}
                                        className="text-xs text-green-400 hover:text-green-300 flex-shrink-0"
                                      >
                                        + Add
                                      </button>
                                    )}
                                  </div>
                                  {placed && element && isSelected && (
                                    <div className="px-2 pb-2 space-y-1">
                                      <div className="flex items-center gap-2 pl-5">
                                        <span className="text-xs text-gray-500">{element.width.toFixed(1)}% × {element.height.toFixed(1)}%{element.type === 'text' && <span className="ml-1">· {element.fontSize}%</span>}</span>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); fitElementContent(element.id); }}
                                          className="text-xs px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
                                          title="Fit height to content"
                                        >
                                          Fit
                                        </button>
                                      </div>
                                      {element.type === 'text' && (
                                        <div className="flex items-center gap-2 pl-5">
                                          <span className="text-xs text-gray-400">Size:</span>
                                          <button onClick={(e) => { e.stopPropagation(); updateFontSize(element.id, -0.5); }} className="w-5 h-5 bg-gray-700 hover:bg-gray-600 rounded text-xs flex items-center justify-center">−</button>
                                          <input
                                            type="number"
                                            min="0.5"
                                            max="200"
                                            step="0.5"
                                            value={element.fontSize}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              const val = parseFloat(e.target.value);
                                              if (!isNaN(val)) {
                                                setElements(prev => prev.map(el => el.id === element.id && el.type === 'text' ? { ...el, fontSize: Math.max(0.5, Math.min(200, parseFloat(val.toFixed(1)))) } : el));
                                              }
                                            }}
                                            className="w-14 text-xs text-center bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-white focus:outline-none focus:border-emerald-500"
                                          />
                                          <span className="text-xs text-gray-500">%</span>
                                          <button onClick={(e) => { e.stopPropagation(); updateFontSize(element.id, 0.5); }} className="w-5 h-5 bg-gray-700 hover:bg-gray-600 rounded text-xs flex items-center justify-center">+</button>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Collapse/Expand Button */}
        <button
          onClick={() => { setSidebarCollapsed(!sidebarCollapsed); setTimeout(calculateImageBounds, 300); }}
          className="absolute top-1/2 -translate-y-1/2 bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-r-lg border border-l-0 border-gray-700 z-10 transition-all"
          style={{ left: sidebarCollapsed ? '0' : '320px' }}
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <div
          ref={canvasWrapRef}
          className="flex-1 overflow-hidden bg-gray-800 relative"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isPanning ? 'grabbing' : 'default' }}
        >
          {zoom !== 1 && (
            <button
              onClick={resetZoom}
              className="absolute top-4 right-4 z-30 bg-gray-900/80 hover:bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg border border-gray-700 backdrop-blur-sm"
            >
              {Math.round(zoom * 100)}% - Reset
            </button>
          )}
          <div
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              padding: '2rem',
              width: '100%',
              height: '100%',
            }}
          >
          <div
            ref={containerRef}
            className="relative mx-auto bg-gray-900 shadow-2xl"
            style={{ height: 'calc(100vh - 200px)' }}
          >
            {backgroundImage ? (
              <img
                ref={imageRef}
                src={backgroundImage}
                alt="Background"
                className="absolute top-0 left-0 pointer-events-none"
                style={{ height: '100%', width: '100%', objectFit: 'contain' }}
                onLoad={calculateImageBounds}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-600">
                No background image available
              </div>
            )}

            {showVerticalGuide && (
              <div className="absolute top-0 bottom-0 w-0.5 border-l-2 border-dashed border-yellow-400 pointer-events-none z-20"
                style={{ left: `${imageBounds.x + imageBounds.width * 0.5}%` }} />
            )}
            {showHorizontalGuide && (
              <div className="absolute left-0 right-0 h-0.5 border-t-2 border-dashed border-yellow-400 pointer-events-none z-20"
                style={{ top: `${imageBounds.y + imageBounds.height * 0.5}%` }} />
            )}
            {showColumnGuides && (
              <>
                <div className="absolute top-0 bottom-0 w-0.5 border-l-2 border-dashed border-orange-400 pointer-events-none z-20"
                  style={{ left: `${imageBounds.x + imageBounds.width * 0.25}%` }} />
                <div className="absolute top-0 bottom-0 w-0.5 border-l-2 border-dashed border-orange-400 pointer-events-none z-20"
                  style={{ left: `${imageBounds.x + imageBounds.width * 0.75}%` }} />
              </>
            )}
            {showGrid && (
              <>
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={`gv${i}`} className="absolute top-0 bottom-0 w-px border-l border-blue-500/30 pointer-events-none z-20"
                    style={{ left: `${imageBounds.x + imageBounds.width * ((i + 1) / 10)}%` }} />
                ))}
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={`gh${i}`} className="absolute left-0 right-0 h-px border-t border-blue-500/30 pointer-events-none z-20"
                    style={{ top: `${imageBounds.y + imageBounds.height * ((i + 1) / 10)}%` }} />
                ))}
              </>
            )}

            {visibleElements.map(element => {
              if (element.hidden) return null;
              const elLeft = imageBounds.x + (element.x / 100) * imageBounds.width;
              const elTop = imageBounds.y + (element.y / 100) * imageBounds.height;
              const elWidth = (element.width / 100) * imageBounds.width;
              const elHeight = (element.height / 100) * imageBounds.height;
              const elHeightPx = containerHeightPx * (elHeight / 100);
              return (
              <div
                key={element.id}
                className={`absolute cursor-move border-2 ${
                  selectedElement === element.id
                    ? element.type === 'text'
                      ? 'border-emerald-500 shadow-lg shadow-emerald-500/30'
                      : 'border-blue-500 shadow-lg shadow-blue-500/50'
                    : element.type === 'text'
                      ? 'border-transparent hover:border-emerald-400'
                      : 'border-transparent hover:border-blue-400'
                }`}
                style={{
                  left: `${elLeft}%`,
                  top: `${elTop}%`,
                  width: `${elWidth}%`,
                  height: `${elHeight}%`
                }}
                onMouseDown={(e) => handleMouseDown(e, element.id)}
              >
                {element.type === 'image' ? (
                  <img
                    src={getMediaUrl(scenarioId, element.filename)}
                    alt={element.name}
                    className="w-full h-full object-fill pointer-events-none"
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setNaturalAspects(prev => ({ ...prev, [element.id]: img.naturalWidth / img.naturalHeight }));
                      }
                    }}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center pointer-events-none select-none overflow-hidden"
                    style={{
                      background: selectedElement === element.id
                        ? 'rgba(16, 185, 129, 0.08)'
                        : 'rgba(255,255,255,0.04)',
                      fontSize: elHeightPx > 0 ? `${(element.fontSize / 100) * elHeightPx}px` : `${element.fontSize}%`,
                      fontWeight: 700,
                      color: '#ffffff',
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {element.previewText}
                  </div>
                )}

                {selectedElement === element.id && (
                  <>
                    <div className={`absolute -top-6 left-0 text-white text-xs px-2 py-1 rounded whitespace-nowrap ${
                      element.type === 'text' ? 'bg-emerald-600' : 'bg-blue-600'
                    }`}>
                      {element.name}
                    </div>

                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-current rounded-full border border-white shadow-sm"
                      style={{ color: element.type === 'text' ? '#10b981' : '#3b82f6' }}
                    />
                    <div className="absolute top-1/2 -translate-y-1/2 -right-1 w-2 h-2 rounded-full border border-white shadow-sm"
                      style={{ background: element.type === 'text' ? '#10b981' : '#3b82f6' }}
                    />
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full border border-white shadow-sm"
                      style={{ background: element.type === 'text' ? '#10b981' : '#3b82f6' }}
                    />
                    <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-2 rounded-full border border-white shadow-sm"
                      style={{ background: element.type === 'text' ? '#10b981' : '#3b82f6' }}
                    />

                    <div
                      className={`absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-center justify-center ${
                        element.type === 'text' ? 'bg-emerald-500' : 'bg-blue-500'
                      }`}
                      onMouseDown={(e) => handleResizeMouseDown(e, element.id)}
                    >
                      <Maximize2 className="w-3 h-3 text-white" />
                    </div>
                  </>
                )}
              </div>
              );
            })}
          </div>
          </div>
          </div>
        </div>

      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}
    </div>
  );
}
