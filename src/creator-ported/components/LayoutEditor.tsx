// @ts-nocheck — ported from creator; retype in Phase 5. See memory: studio merge tech debt.
import { Fragment, useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, Send, Maximize2, Minimize2, ChevronLeft, ChevronRight, LayoutGrid as Layout, Type, Image, Eye, EyeOff, ChevronDown, ChevronRight as ChevronRightSm, Layers, Download, MapPin } from 'lucide-react';
import { db } from '../lib/db';
import { bumpScenarioVersion } from '../../scenarios/shell/state/saveOrchestrator';
import { getMediaUrl } from '../utils/mediaUrl';
import { Alert } from './Alert';
import { authService } from '../services/authService';
import { buildGroups, buildTracksGroups, buildClashGroups, TRACKS_HUD_ITEMS, TRACKS_HUD_MOCK_TEXT, getGroupForElement, getQuestIndexFromElementId, getCounterpartId, getQuestItemRole, type GroupDef, type GroupItemDef } from '../utils/layoutGroups';
import { defaultClashTerritories } from '../../scenarios/bodies/clash/defaults';
import { alignQuestMainImagesVertically, clampQuestInnerElement } from '../utils/questSync';
import { TracksTextFit } from '../../scenarios/bodies/tracks/TracksTextFit';
import {
  TEXT_ELEMENT_DEFAULT_POSITION,
  TEXT_ELEMENT_DEFAULT_ALIGN,
} from '../../scenarios/bodies/tracks/textElementStyle';
import {
  TypographyEditor,
  resolveTypography,
  type ResolvedTypography,
} from '../../scenarios/bodies/tracks/TypographyEditor';
import { resolveFontFamily } from '../../fonts/resolveFontFamily';
import { registerStudioCustomFonts } from '../../fonts/registerStudioCustomFonts';
import { getLocalized } from '../../scenarios/i18n/getLocalized';
import type {
  CustomFont,
  TextCategory,
  TextCategoryTypography,
  TextElement as ScenarioTextSource,
} from '../../types/scenario-data';

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

/**
 * Tracks-only: author-defined translatable text overlays. Position lives here
 * (in the LayoutEditor's elements state) AND mirrors back to
 * gameMeta.text_elements[i].position on save. Content + style live exclusively
 * in gameMeta.text_elements[i] — looked up by `id` at render time.
 */
interface ScenarioTextElement {
  type: 'scenario_text';
  id: string;       // matches gameMeta.text_elements[i].id
  name: string;     // author-facing preview string
  x: number;
  y: number;
  width: number;
  height: number;
  hidden?: boolean;
}

type LayoutElement = ImageElement | TextElement | ScenarioTextElement;

/** Title preview snippet length used in sidebar labels for scenario text. */
const SCENARIO_TEXT_NAME_LIMIT = 30;

function buildScenarioTextName(
  src: ScenarioTextSource | undefined,
  index: number,
  lang: string,
  defaultLang: string,
): string {
  if (!src) return `Text ${index + 1}`;
  const value = getLocalized(
    (src.text ?? {}) as never,
    lang as never,
    defaultLang as never,
  );
  const trimmed = (value || '').trim();
  if (!trimmed) return `Text ${index + 1}`;
  const snippet =
    trimmed.length > SCENARIO_TEXT_NAME_LIMIT
      ? `${trimmed.slice(0, SCENARIO_TEXT_NAME_LIMIT - 1)}…`
      : trimmed;
  return `Text ${index + 1} — “${snippet}”`;
}

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
  const [containerWidthPx, setContainerWidthPx] = useState(0);
  // Tracks-only: the scenario's text_elements[] as authored. Looked up by id
  // when rendering 'scenario_text' layout elements (content + style live here,
  // position lives in the layout element). Scenario font + color provide the
  // fallback when an element leaves font/font_color unset.
  const [scenarioTextElements, setScenarioTextElements] = useState<ScenarioTextSource[]>([]);
  const [scenarioTextCategories, setScenarioTextCategories] = useState<TextCategory[]>([]);
  const [scenarioCustomFonts, setScenarioCustomFonts] = useState<CustomFont[]>([]);
  const [scenarioFont, setScenarioFont] = useState<string>('');
  const [scenarioFontColor, setScenarioFontColor] = useState<string>('');
  const [scenarioDefaultLanguage, setScenarioDefaultLanguage] = useState<string>('en');
  // Tracks-only: which text-category group header is currently selected for
  // typography editing. Mutually exclusive with selectedElement — selecting
  // either clears the other.
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [questCount, setQuestCount] = useState<number>(0);
  const [isTracksGame, setIsTracksGame] = useState(false);
  const [isClashGame, setIsClashGame] = useState(false);
  const [territoryCount, setTerritoryCount] = useState<number>(0);
  const [checkpointCount, setCheckpointCount] = useState<number>(0);
  const [tracksIconSize, setTracksIconSize] = useState<number>(3);
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
  // Tracks-only: full scenario `data` JSON (for syncing checkpoint positions
  // back to game_meta on save) + per-checkpoint seed positions (icon CENTER, in
  // % of the map, mirroring gameMeta.checkpoints[].position).
  const scenarioDataRef = useRef<any>(null);
  const tracksSeedRef = useRef<Record<string, { left: number; top: number }>>({});

  const instructionLayoutImages = ['game_instructions_image', 'game_instructions_button_image', 'game_refresh_button_image'];
  const TRACKS_HUD_IDS = TRACKS_HUD_ITEMS.map((i) => i.id);
  const isCheckpointElement = (id: string) => isTracksGame && /^checkpoint_\d+$/.test(id);

  // Sidebar items for the text-elements groups, partitioned by category id.
  // Uncategorized items go under the empty-string key. Names use the
  // scenario default language preview so the sidebar stays stable when the
  // author opens the LayoutEditor — translations are previewed live on the
  // canvas via getLocalized's fallback chain.
  const tracksTextItemsByCategory: Map<string, GroupItemDef[]> = (isTracksGame || isClashGame)
    ? (() => {
        const map = new Map<string, GroupItemDef[]>();
        scenarioTextElements.forEach((te, i) => {
          const key = te.category ?? '';
          const item: GroupItemDef = {
            id: te.id,
            name: buildScenarioTextName(te, i, scenarioDefaultLanguage, scenarioDefaultLanguage),
            type: 'scenario_text' as const,
          };
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(item);
        });
        return map;
      })()
    : new Map<string, GroupItemDef[]>();

  const groups: GroupDef[] = isTagquestGame
    ? buildGroups(questCount)
    : isTracksGame
      ? buildTracksGroups(
          checkpointCount,
          scenarioTextCategories.map((c) => ({ id: c.id, name: c.name })),
          tracksTextItemsByCategory,
        )
      : isClashGame
        ? buildClashGroups(
            territoryCount,
            scenarioTextCategories.map((c) => ({ id: c.id, name: c.name })),
            tracksTextItemsByCategory,
          )
        : [];

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const selectAndExpandElement = (elementId: string) => {
    setSelectedElement(elementId);
    setSelectedCategoryId(null);
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

  /**
   * Tracks-only: handle a click on a category group header. Expanding a
   * collapsed category also "selects" it for typography editing; collapsing
   * an expanded+selected category deselects. Uncategorized's header just
   * toggles expand (no typography to edit).
   */
  const handleTextCategoryHeaderClick = (group: GroupDef) => {
    const wasExpanded = expandedGroups.has(group.id);
    toggleGroup(group.id);
    if (group.categoryId == null) {
      // Uncategorized → no selection
      return;
    }
    if (wasExpanded) {
      if (selectedCategoryId === group.categoryId) setSelectedCategoryId(null);
    } else {
      setSelectedCategoryId(group.categoryId);
      setSelectedElement(null);
    }
  };

  /** Tracks-only: replace a category's typography (full 8-field object). */
  const updateCategoryTypography = (categoryId: string, next: TextCategoryTypography) => {
    setScenarioTextCategories((cats) =>
      cats.map((c) => (c.id === categoryId ? { ...c, typography: next } : c)),
    );
  };

  /**
   * Tracks-only: replace the per-element typography override fields on a
   * scenario_text source. Undefined fields in `next` clear the corresponding
   * override (the runtime then falls back to category → scenario).
   */
  const updateElementOverride = (elementId: string, next: TextCategoryTypography) => {
    setScenarioTextElements((els) =>
      els.map((e) => {
        if (e.id !== elementId) return e;
        const merged: ScenarioTextSource = { ...e };
        // Replace each of the 8 typography fields — defined values set,
        // undefined values delete the property entirely.
        (['font', 'font_color', 'bold', 'italic', 'underline', 'align', 'shadow', 'background'] as const).forEach(
          (k) => {
            const v = (next as Record<string, unknown>)[k];
            if (v === undefined) delete (merged as Record<string, unknown>)[k];
            else (merged as Record<string, unknown>)[k] = v;
          },
        );
        return merged;
      }),
    );
  };

  /** Helper: look up an element's resolved category (or undefined if Uncategorized / orphan). */
  const findCategoryForElement = (elementId: string): TextCategory | undefined => {
    const el = scenarioTextElements.find((e) => e.id === elementId);
    if (!el || !el.category) return undefined;
    return scenarioTextCategories.find((c) => c.id === el.category);
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
    // No (or not-yet-loaded) background: fall back to the full container so drag
    // math stays finite — otherwise a NaN aspect makes elements undraggable
    // horizontally and renders them at the left edge.
    if (!img.naturalWidth || !img.naturalHeight) {
      setContainerHeightPx(cHeight);
      setImageBounds({ x: 0, y: 0, width: 100, height: 100 });
      return;
    }
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
        const rect = containerRef.current.getBoundingClientRect();
        setContainerHeightPx(rect.height);
        setContainerWidthPx(rect.width);
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

      // NOTE: the canonical column is `medias` (the legacy creator used `media`,
      // singular — selecting that errored and silently blanked the whole editor).
      const { data, error } = await db
        .from('scenarios')
        .select('medias, data, scenario_type, scenario_layout, uniqid, game_type')
        .eq('id', scenarioId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return;

      // Media is served under the scenario UNIQID, not the numeric id — use this
      // for every getMediaUrl() in this function (state isn't set synchronously).
      const uniqid = (data as any).uniqid || '';
      setScenarioUniqid(uniqid);

      // query.php returns JSON columns as raw strings; parse them (objects pass
      // through unchanged for backends that already decode).
      const parseCol = (v: any) => {
        if (v == null) return v;
        if (typeof v === 'string') {
          try { return JSON.parse(v); } catch { return null; }
        }
        return v;
      };

      const media = parseCol((data as any).medias);
      const gameData = parseCol((data as any).data);
      const scenarioLayout = parseCol((data as any).scenario_layout);
      scenarioDataRef.current = gameData;

      // Prefer the row's game_type column (set at creation) so a freshly-made
      // scenario detects correctly before its first save populates data.game_meta.
      const gameTypeCol = (data as { game_type?: string }).game_type;
      const hasMysteryStructure =
        gameTypeCol === 'mystery' ||
        (gameData?.game_meta?.enigmas && Array.isArray(gameData.game_meta.enigmas));
      const hasTracksStructure =
        gameTypeCol === 'tracks' ||
        (gameData?.game_meta?.checkpoints && Array.isArray(gameData.game_meta.checkpoints));
      const hasClashStructure =
        gameTypeCol === 'clash' ||
        (Array.isArray(gameData?.game_meta?.territories) && Array.isArray(gameData?.game_meta?.clans));
      setIsMysteryGame(hasMysteryStructure);
      setIsTracksGame(hasTracksStructure);
      setIsClashGame(hasClashStructure);

      let actualGameType = '';
      if (hasMysteryStructure) {
        actualGameType = 'mystery';
      } else if (hasTracksStructure) {
        actualGameType = 'tracks';
      } else if (hasClashStructure) {
        actualGameType = 'clash';
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

      // ── Tracks: checkpoints (one icon per checkpoint, seeded from
      // gameMeta.checkpoints[].position) + HUD frames, placed over the MAP.
      // Built separately from the tagquest/mystery catalog below.
      if (actualGameType === 'tracks') {
        const gm = gameData?.game_meta ?? {};
        const cps: any[] = Array.isArray(gm.checkpoints) ? gm.checkpoints : [];
        const commonMode = !!gm.checkpoints_unique_image;
        const iconSize = Number(gm.checkpoint_image_width_percentage) || 3;
        setTracksIconSize(iconSize);
        setCheckpointCount(cps.length);

        // Scenario-level typography defaults — per-element overrides fall back
        // to these. registerStudioCustomFonts ensures author-uploaded fonts
        // are loaded so the canvas measurement in TracksTextFit uses correct
        // metrics (otherwise it falls back to sans-serif).
        setScenarioFont(typeof gm.font === 'string' ? gm.font : '');
        setScenarioFontColor(typeof gm.font_color === 'string' ? gm.font_color : '');
        setScenarioDefaultLanguage(
          typeof gameData?.default_language === 'string' ? gameData.default_language : 'en',
        );
        const customFonts: CustomFont[] = Array.isArray(gm.custom_fonts)
          ? (gm.custom_fonts as CustomFont[])
          : [];
        setScenarioCustomFonts(customFonts);
        if (customFonts.length > 0) {
          registerStudioCustomFonts(customFonts, (filename: string) =>
            getMediaUrl(uniqid, filename),
          );
        }

        const textEls: ScenarioTextSource[] = Array.isArray(gm.text_elements)
          ? (gm.text_elements as ScenarioTextSource[])
          : [];
        setScenarioTextElements(textEls);

        // Hydrate author-defined categories. Section is the source of truth;
        // LayoutEditor reads them to render category groups + edit their
        // typography. (Categories are not created/renamed/deleted here.)
        const cats: TextCategory[] = Array.isArray(gm.text_categories)
          ? (gm.text_categories as TextCategory[])
          : [];
        setScenarioTextCategories(cats);

        // Background = the map (checkpoints sit on it); fall back to the
        // generic background image when no map is set.
        const mapFile = media?.images?.map_image || media?.images?.background_image;
        if (mapFile) setBackgroundImage(getMediaUrl(uniqid, mapFile));

        // Per-checkpoint image filenames live in medias.checkpoints[]; common
        // mode shares one icon (medias.images.checkpoints_unique_image_id).
        const cpImgByNumber = new Map<number, string>();
        const cpImgById = new Map<string, string>();
        (Array.isArray(media?.checkpoints) ? media.checkpoints : []).forEach((cm: any) => {
          if (!cm || typeof cm.image !== 'string') return;
          const n = Number(cm.checkpoint_number);
          if (n) cpImgByNumber.set(n, cm.image);
          if (typeof cm.checkpoint_id === 'string') cpImgById.set(cm.checkpoint_id, cm.image);
        });
        const commonIcon = media?.images?.checkpoints_unique_image_id || '';

        const imagesList: { id: string; name: string; filename: string }[] = [];
        const seeds: Record<string, { left: number; top: number }> = {};
        const checkpointEls: LayoutElement[] = [];
        cps.forEach((cp: any, i: number) => {
          const n = i + 1;
          const id = `checkpoint_${n}`;
          const filename = commonMode
            ? commonIcon
            : (typeof cp?.id === 'string' ? cpImgById.get(cp.id) : '') || cpImgByNumber.get(n) || '';
          imagesList.push({ id, name: `Checkpoint ${n}`, filename });
          const pos = cp?.position ?? { top: 50, left: 50 };
          const left = Number(pos.left);
          const top = Number(pos.top);
          seeds[id] = { left: isFinite(left) ? left : 50, top: isFinite(top) ? top : 50 };
          checkpointEls.push({
            type: 'image', id, name: `Checkpoint ${n}`, filename,
            x: seeds[id].left, y: seeds[id].top, width: iconSize, height: iconSize,
          });
        });

        // HUD frame images (only those present on this scenario).
        TRACKS_HUD_ITEMS.forEach((item) => {
          const filename = media?.images?.[item.id];
          if (filename) imagesList.push({ id: item.id, name: item.name, filename });
        });

        tracksSeedRef.current = seeds;
        setAvailableImages(imagesList);

        // HUD frame elements: reuse saved positions from scenario_layout when
        // present, otherwise drop them into a default top strip so they show.
        const savedHud = (Array.isArray(scenarioLayout?.elements) ? scenarioLayout.elements : [])
          .filter((el: any) => TRACKS_HUD_IDS.includes(el.id));
        const savedHudIds = new Set(savedHud.map((el: any) => el.id));
        const DEFAULT_HUD_POS: Record<string, { x: number; y: number; width: number; height: number }> = {
          team_name_background_image: { x: 4, y: 3, width: 22, height: 9 },
          timer_background_image: { x: 39, y: 3, width: 22, height: 9 },
          score_background_image: { x: 74, y: 3, width: 22, height: 9 },
          time_background_image: { x: 74, y: 13, width: 22, height: 9 },
        };
        const seededHud: LayoutElement[] = [];
        TRACKS_HUD_ITEMS.forEach((item) => {
          const filename = media?.images?.[item.id];
          if (!filename || savedHudIds.has(item.id)) return;
          const p = DEFAULT_HUD_POS[item.id] || { x: 5, y: 5, width: 20, height: 10 };
          seededHud.push({ type: 'image', id: item.id, name: item.name, filename, ...p });
        });

        // Scenario text elements with a saved position are placed on the
        // canvas immediately; unplaced entries stay in the sidebar only.
        const placedTextEls: LayoutElement[] = textEls
          .filter((te) => te?.id && te.position)
          .map((te, idx) => ({
            type: 'scenario_text',
            id: te.id,
            name: buildScenarioTextName(
              te,
              idx,
              gameData?.default_language || 'en',
              gameData?.default_language || 'en',
            ),
            x: Number(te.position.left) || 0,
            y: Number(te.position.top) || 0,
            width: Number(te.position.width) || TEXT_ELEMENT_DEFAULT_POSITION.width,
            height: Number(te.position.height) || TEXT_ELEMENT_DEFAULT_POSITION.height,
          }));

        setElements([...checkpointEls, ...savedHud, ...seededHud, ...placedTextEls]);
        return;
      }

      // ── Clash: territory sigil markers (seeded from gameMeta.territories[].
      // position) + translatable text elements, placed over the MAP. No HUD
      // frames, no tagquest catalog.
      if (actualGameType === 'clash') {
        const gm = gameData?.game_meta ?? {};
        const terrs: any[] = Array.isArray(gm.territories) ? gm.territories : [];
        // Clash is a fixed 4-territory skeleton — seed 4 markers even if the
        // scenario hasn't been saved yet (so the author always sees them).
        const terrCount = terrs.length > 0 ? terrs.length : 4;
        setTerritoryCount(terrCount);

        setScenarioFont(typeof gm.font === 'string' ? gm.font : '');
        setScenarioFontColor(typeof gm.font_color === 'string' ? gm.font_color : '');
        setScenarioDefaultLanguage(
          typeof gameData?.default_language === 'string' ? gameData.default_language : 'en',
        );
        const customFonts: CustomFont[] = Array.isArray(gm.custom_fonts)
          ? (gm.custom_fonts as CustomFont[])
          : [];
        setScenarioCustomFonts(customFonts);
        if (customFonts.length > 0) {
          registerStudioCustomFonts(customFonts, (filename: string) => getMediaUrl(uniqid, filename));
        }

        const textEls: ScenarioTextSource[] = Array.isArray(gm.text_elements)
          ? (gm.text_elements as ScenarioTextSource[])
          : [];
        setScenarioTextElements(textEls);
        const cats: TextCategory[] = Array.isArray(gm.text_categories)
          ? (gm.text_categories as TextCategory[])
          : [];
        setScenarioTextCategories(cats);

        // Background = the territory map (the runtime renders sigils over it).
        const mapFile = media?.images?.map_image || media?.images?.background_image;
        if (mapFile) setBackgroundImage(getMediaUrl(uniqid, mapFile));

        // One move-only marker per territory so the author sees where a
        // controlling clan's sigil will sit at runtime. Markers reuse the clan
        // seal images, cycling when there are fewer clans than territories
        // (e.g. 2 clans → T1=clan1, T2=clan2, T3=clan1, T4=clan2). With no clan
        // images uploaded, the marker falls back to a map-pin icon (rendered in
        // the canvas when filename is empty).
        // Clan seals live inline in data.game_meta.clans[].seal (kept inline by
        // the clash adapter); fall back to the medias bucket just in case.
        const clanSeals: string[] = (Array.isArray(gm.clans) ? gm.clans : [])
          .map((c: any, ci: number) => {
            const inline = typeof c?.seal === 'string' ? c.seal : '';
            if (inline) return inline;
            const fromMedia = media?.clans?.[ci]?.seal;
            return typeof fromMedia === 'string' ? fromMedia : '';
          })
          .filter((s: string) => s.length > 0);
        // Spread defaults so unplaced markers don't stack at dead-centre.
        const CLASH_DEFAULT_POS = [
          { left: 30, top: 35 }, { left: 70, top: 30 },
          { left: 65, top: 70 }, { left: 28, top: 72 },
        ];
        const imagesList: { id: string; name: string; filename: string }[] = [];
        const seeds: Record<string, { left: number; top: number }> = {};
        const territoryEls: LayoutElement[] = [];
        const SIGIL_SIZE = 8;
        const SIZE_BY_INDEX = ['Large', 'Medium', 'Medium', 'Small'];
        for (let i = 0; i < terrCount; i++) {
          const t = terrs[i];
          const n = i + 1;
          const id = `territory_${n}`;
          const size = SIZE_BY_INDEX[i];
          const name = size ? `Territory ${n} (${size})` : `Territory ${n}`;
          const filename = clanSeals.length > 0 ? clanSeals[i % clanSeals.length] : '';
          imagesList.push({ id, name, filename });
          const dft = CLASH_DEFAULT_POS[i % CLASH_DEFAULT_POS.length];
          const pos = t?.position ?? dft;
          const left = Number(pos.left);
          const top = Number(pos.top);
          seeds[id] = { left: isFinite(left) ? left : dft.left, top: isFinite(top) ? top : dft.top };
          territoryEls.push({
            type: 'image', id, name, filename,
            x: seeds[id].left, y: seeds[id].top, width: SIGIL_SIZE, height: SIGIL_SIZE,
          });
        }
        tracksSeedRef.current = seeds;
        setAvailableImages(imagesList);

        const placedTextEls: LayoutElement[] = textEls
          .filter((te) => te?.id && te.position)
          .map((te, idx) => ({
            type: 'scenario_text',
            id: te.id,
            name: buildScenarioTextName(
              te,
              idx,
              gameData?.default_language || 'en',
              gameData?.default_language || 'en',
            ),
            x: Number(te.position.left) || 0,
            y: Number(te.position.top) || 0,
            width: Number(te.position.width) || TEXT_ELEMENT_DEFAULT_POSITION.width,
            height: Number(te.position.height) || TEXT_ELEMENT_DEFAULT_POSITION.height,
          }));

        setElements([...territoryEls, ...placedTextEls]);
        return;
      }

      if (media?.images?.background_image) {
        setBackgroundImage(getMediaUrl(uniqid, media.images.background_image));
      } else if (media?.game_media_images?.background_image) {
        setBackgroundImage(getMediaUrl(uniqid, media.game_media_images.background_image));
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
      // Tracks checkpoints restore to their map position (icon CENTER) at the
      // configured icon size; HUD frames and everything else use a default box.
      const seed = isCheckpointElement(itemId) ? tracksSeedRef.current[itemId] : undefined;
      const newEl: ImageElement = seed
        ? {
            type: 'image', id: imgInfo.id, name: imgInfo.name, filename: imgInfo.filename,
            x: seed.left, y: seed.top, width: tracksIconSize, height: tracksIconSize,
          }
        : {
            type: 'image', id: imgInfo.id, name: imgInfo.name, filename: imgInfo.filename,
            x: 5, y: 5, width: 20, height: 20,
          };
      return [...currentElements, newEl];
    } else if (itemDef.type === 'scenario_text') {
      // First placement uses the shared default; saved position is restored
      // at hydration time, not here. Removing + re-adding always drops a
      // fresh box at the default — intentional, matches the "Add to layout"
      // semantics from the design.
      const newEl: ScenarioTextElement = {
        type: 'scenario_text',
        id: itemDef.id,
        name: itemDef.name,
        x: TEXT_ELEMENT_DEFAULT_POSITION.left,
        y: TEXT_ELEMENT_DEFAULT_POSITION.top,
        width: TEXT_ELEMENT_DEFAULT_POSITION.width,
        height: TEXT_ELEMENT_DEFAULT_POSITION.height,
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

  // Tracks layouts are PER-SCENARIO (unlike tagquest/mystery, which save a
  // type-level template to default_config): checkpoint counts and positions
  // vary per scenario. Checkpoint icon CENTERS sync back to
  // gameMeta.checkpoints[].position (the runtime reads those); HUD frame boxes
  // persist to the scenario's scenario_layout (also bundled to the playground).
  const saveTracksLayout = async () => {
    const { data: row, error: fetchErr } = await db
      .from('scenarios')
      .select('data')
      .eq('id', scenarioId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    // Re-read `data` fresh so we don't clobber concurrent edits to the rest of
    // it. JSON columns come back as strings from query.php — parse before patching.
    const parseCol = (v: any) => {
      if (v == null) return v;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return null; }
      }
      return v;
    };
    const data = parseCol(row?.data) ?? scenarioDataRef.current ?? {};
    const gm = (data.game_meta = data.game_meta || {});
    const cps: any[] = Array.isArray(gm.checkpoints) ? gm.checkpoints : [];

    // On-map checkpoint icon size (% of map width). Edited here in the layout
    // editor; the runtime reads it off game_meta to size every checkpoint marker.
    gm.checkpoint_image_width_percentage = tracksIconSize;

    elements.forEach((el) => {
      const m = /^checkpoint_(\d+)$/.exec(el.id);
      if (!m) return;
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < cps.length) {
        cps[idx] = { ...cps[idx], position: { left: el.x, top: el.y } };
      }
    });

    // Scenario text elements: position lives ONLY in gameMeta.text_elements[i]
    // (single source of truth — see plan). Placed entries write their box;
    // unplaced entries have any prior position cleared so the runtime skips
    // them. Per-element typography overrides also write here — we authoritatively
    // replace each element from our in-memory scenarioTextElements state
    // (which is what TypographyEditor mutates) before splicing the position.
    // Orphans (source deleted in scenario editor) are ignored because we rebuild
    // from the fresh DB text_elements array, intersected with our in-memory
    // overrides by id.
    const texts: any[] = Array.isArray(gm.text_elements) ? gm.text_elements : [];
    const placedTextById = new Map<string, ScenarioTextElement>();
    elements.forEach((el) => {
      if (el.type === 'scenario_text') {
        placedTextById.set(el.id, el as ScenarioTextElement);
      }
    });
    const overrideById = new Map<string, ScenarioTextSource>();
    scenarioTextElements.forEach((te) => overrideById.set(te.id, te));
    gm.text_elements = texts.map((te) => {
      if (!te || typeof te !== 'object' || !te.id) return te;
      // Merge in our typography overrides (font/color/B/I/U/align/shadow/bg).
      // Other persisted fields (text, category) win from the DB row — those
      // are owned by the scenario editor section, not us.
      const overrides = overrideById.get(te.id);
      let merged: Record<string, unknown> = { ...te };
      if (overrides) {
        for (const k of ['font', 'font_color', 'bold', 'italic', 'underline', 'align', 'shadow', 'background'] as const) {
          const v = (overrides as Record<string, unknown>)[k];
          if (v === undefined) delete merged[k];
          else merged[k] = v;
        }
      }
      const placed = placedTextById.get(te.id);
      if (placed) {
        merged.position = {
          left: placed.x,
          top: placed.y,
          width: placed.width,
          height: placed.height,
        };
      } else if (merged.position) {
        delete merged.position;
      }
      return merged;
    });

    // Category typography also flows from our in-memory state. Replace the
    // typography of each category by id; preserve everything else (name +
    // any future fields). Categories not in our state survive untouched —
    // the scenario editor section is the source of truth for add/rename/
    // delete + ordering, we just mutate typography here.
    const dbCats: any[] = Array.isArray(gm.text_categories) ? gm.text_categories : [];
    const catTypographyById = new Map<string, TextCategoryTypography>();
    scenarioTextCategories.forEach((c) => catTypographyById.set(c.id, c.typography ?? {}));
    gm.text_categories = dbCats.map((dbc) => {
      if (!dbc || typeof dbc !== 'object' || !dbc.id) return dbc;
      const typo = catTypographyById.get(dbc.id);
      if (typo === undefined) return dbc;
      return { ...dbc, typography: typo };
    });

    // scenario_layout stores HUD-frame + image positions only. Scenario text
    // elements would be redundant here (the runtime reads them out of
    // gameMeta) and risk drift, so strip them before writing.
    const layoutElements = elements.filter((el) => el.type !== 'scenario_text');

    // Bump the row version so playgrounds re-sync the new positions.
    const update: Record<string, unknown> = {
      data,
      scenario_layout: { elements: layoutElements },
    };
    await bumpScenarioVersion(scenarioId, update);
    const { error: updErr } = await db
      .from('scenarios')
      .update(update)
      .eq('id', scenarioId);
    if (updErr) throw updErr;

    scenarioDataRef.current = data;
    const placedTextCount = placedTextById.size;
    setAlert({
      type: 'success',
      message: `Tracks layout saved (${cps.length} checkpoints + HUD frames${
        placedTextCount > 0 ? ` + ${placedTextCount} text element${placedTextCount === 1 ? '' : 's'}` : ''
      }).`,
    });
  };

  // Clash: territory sigil CENTERS sync back to gameMeta.territories[].position
  // (the runtime reads those); text elements sync to gameMeta.text_elements[i].
  // No HUD frames. Mirrors saveTracksLayout.
  const saveClashLayout = async () => {
    const { data: row, error: fetchErr } = await db
      .from('scenarios')
      .select('data')
      .eq('id', scenarioId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    const parseCol = (v: any) => {
      if (v == null) return v;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return null; }
      }
      return v;
    };
    const data = parseCol(row?.data) ?? scenarioDataRef.current ?? {};
    const gm = (data.game_meta = data.game_meta || {});
    // Seed the fixed 4-territory skeleton if the saved data has none, so dragged
    // positions always have a territory to write into (even pre-first-save).
    const terrs: any[] =
      Array.isArray(gm.territories) && gm.territories.length > 0
        ? gm.territories
        : defaultClashTerritories();
    gm.territories = terrs;

    elements.forEach((el) => {
      const m = /^territory_(\d+)$/.exec(el.id);
      if (!m) return;
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < terrs.length) {
        terrs[idx] = { ...terrs[idx], position: { left: el.x, top: el.y } };
      }
    });

    // Scenario text elements — same single-source-of-truth handling as tracks.
    const texts: any[] = Array.isArray(gm.text_elements) ? gm.text_elements : [];
    const placedTextById = new Map<string, ScenarioTextElement>();
    elements.forEach((el) => {
      if (el.type === 'scenario_text') placedTextById.set(el.id, el as ScenarioTextElement);
    });
    const overrideById = new Map<string, ScenarioTextSource>();
    scenarioTextElements.forEach((te) => overrideById.set(te.id, te));
    gm.text_elements = texts.map((te) => {
      if (!te || typeof te !== 'object' || !te.id) return te;
      const overrides = overrideById.get(te.id);
      const merged: Record<string, unknown> = { ...te };
      if (overrides) {
        for (const k of ['font', 'font_color', 'bold', 'italic', 'underline', 'align', 'shadow', 'background'] as const) {
          const v = (overrides as Record<string, unknown>)[k];
          if (v === undefined) delete merged[k];
          else merged[k] = v;
        }
      }
      const placed = placedTextById.get(te.id);
      if (placed) {
        merged.position = { left: placed.x, top: placed.y, width: placed.width, height: placed.height };
      } else if (merged.position) {
        delete merged.position;
      }
      return merged;
    });

    const dbCats: any[] = Array.isArray(gm.text_categories) ? gm.text_categories : [];
    const catTypographyById = new Map<string, TextCategoryTypography>();
    scenarioTextCategories.forEach((c) => catTypographyById.set(c.id, c.typography ?? {}));
    gm.text_categories = dbCats.map((dbc) => {
      if (!dbc || typeof dbc !== 'object' || !dbc.id) return dbc;
      const typo = catTypographyById.get(dbc.id);
      if (typo === undefined) return dbc;
      return { ...dbc, typography: typo };
    });

    const layoutElements = elements.filter((el) => el.type !== 'scenario_text');
    const update: Record<string, unknown> = {
      data,
      scenario_layout: { elements: layoutElements },
    };
    await bumpScenarioVersion(scenarioId, update);
    const { error: updErr } = await db
      .from('scenarios')
      .update(update)
      .eq('id', scenarioId);
    if (updErr) throw updErr;

    scenarioDataRef.current = data;
    const placedTextCount = placedTextById.size;
    setAlert({
      type: 'success',
      message: `Clash layout saved (${terrs.length} territories${
        placedTextCount > 0 ? ` + ${placedTextCount} text element${placedTextCount === 1 ? '' : 's'}` : ''
      }).`,
    });
  };

  const saveLayout = async () => {
    try {
      setSaving(true);

      if (!scenarioType) {
        setAlert({ type: 'error', message: 'Cannot save: Game type not detected. Please reload the scenario.' });
        setSaving(false);
        return;
      }

      if (scenarioType === 'tracks') {
        await saveTracksLayout();
        return;
      }

      if (scenarioType === 'clash') {
        await saveClashLayout();
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
      // saveLayout() writes the live layout to its authoritative store:
      // scenario_layout (+ synced checkpoint positions) for tracks/clash, or
      // default_config for mystery/tagquest — and that's what reaches the
      // playground. There is no separate publish target anymore (the old
      // `layouts` table pipeline was retired), so Save IS the publish.
      await saveLayout();
      setAlert({ type: 'success', message: 'Layout published successfully' });
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

          {/* Mystery "Game" layout mode retired — the in-game board is now
              positioned by the dedicated In-game layout editor (game_meta
              .ingame_layout, consumed directly by MysteryGameRenderer). This
              editor handles only the mystery Instruction layout. */}

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

            {isTracksGame && (
              <div className="mb-4 rounded-lg border border-gray-800 bg-gray-900 p-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-gray-300 mb-1 block">
                    Icon size on map (% of map width)
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    step={0.5}
                    value={tracksIconSize}
                    onChange={(ev) => {
                      const next = Number(ev.target.value);
                      if (!Number.isFinite(next)) return;
                      setTracksIconSize(next);
                      // Live-resize the placed checkpoint markers so the author
                      // sees the new size immediately (persisted on Save).
                      setElements((els) =>
                        els.map((el) =>
                          isCheckpointElement(el.id) ? { ...el, width: next, height: next } : el,
                        ),
                      );
                    }}
                    className="w-28 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-100 focus:outline-none focus:border-gray-500"
                  />
                </label>
              </div>
            )}

            {/* Groups */}
            {groups.length === 0 ? (
              <p className="text-xs text-gray-600 italic">No elements available for this scenario type.</p>
            ) : (
              <div className="space-y-2">
                {groups.map((group, gIdx) => {
                  const firstTextCatIdx = groups.findIndex((g) => g.kind === 'text_category');
                  const showTextElementsSeparator = gIdx === firstTextCatIdx && firstTextCatIdx >= 0;
                  const isExpanded = expandedGroups.has(group.id);
                  const groupItems = group.items.filter(item => {
                    if (item.parentId && !availableImages.find(img => img.id === item.parentId)) return false;
                    if (item.type === 'image') return !!availableImages.find(img => img.id === item.id);
                    return true;
                  });
                  // Empty groups are normally hidden; text_category groups
                  // (non-Uncategorized) render even when empty so the author
                  // can still edit the category's typography from its header.
                  const renderEmpty =
                    group.kind === 'text_category' && group.categoryId != null;
                  if (groupItems.length === 0 && !renderEmpty) return null;
                  const placedCount = groupItems.filter(item => !!elements.find(el => el.id === item.id)).length;
                  const allPlaced = placedCount === groupItems.length;
                  const mainImgInfo = availableImages.find(img => img.id === group.mainImageId);
                  const isCategoryGroup = group.kind === 'text_category';
                  const isCatSelected = isCategoryGroup && group.categoryId != null && selectedCategoryId === group.categoryId;
                  return (
                    <Fragment key={group.id}>
                      {showTextElementsSeparator && (
                        <div className="pt-2 pb-1 px-1 flex items-center gap-2 select-none">
                          <span className="flex-1 h-px bg-gray-800" />
                          <span className="text-[10px] uppercase tracking-wider text-gray-500">
                            Text elements
                          </span>
                          <span className="flex-1 h-px bg-gray-800" />
                        </div>
                      )}
                      <div className={`rounded-lg border ${isCatSelected ? 'border-violet-700' : 'border-gray-800'} overflow-hidden`}>
                      <button
                        onClick={() => {
                          if (isCategoryGroup) handleTextCategoryHeaderClick(group);
                          else toggleGroup(group.id);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors ${
                          isCatSelected ? 'bg-violet-900/40' : 'bg-gray-800 hover:bg-gray-750'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Layers size={13} className={`flex-shrink-0 ${isCategoryGroup ? 'text-violet-400' : 'text-blue-400'}`} />
                          <span className="text-xs font-semibold text-white truncate">{group.name}</span>
                          {groupItems.length > 0 && (
                            <span className="text-xs text-gray-500 flex-shrink-0">{placedCount}/{groupItems.length}</span>
                          )}
                          {isCategoryGroup && groupItems.length === 0 && (
                            <span className="text-[10px] italic text-gray-500 flex-shrink-0">empty</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isExpanded ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRightSm size={13} className="text-gray-400" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="bg-gray-900 border-t border-gray-800">
                          {isCatSelected && group.categoryId && (() => {
                            const cat = scenarioTextCategories.find((c) => c.id === group.categoryId);
                            if (!cat) return null;
                            const catTypography: TextCategoryTypography = cat.typography ?? {};
                            const inheritedFromScenario: ResolvedTypography = {
                              font: scenarioFont || '',
                              font_color: scenarioFontColor || '#ffffff',
                              bold: false,
                              italic: false,
                              underline: false,
                              align: TEXT_ELEMENT_DEFAULT_ALIGN,
                              shadow: false,
                              background: false,
                            };
                            return (
                              <div className="px-2 pt-2 pb-1">
                                <p className="text-[10px] uppercase tracking-wider text-violet-400 mb-1 px-0.5">
                                  Category typography
                                </p>
                                <TypographyEditor
                                  value={catTypography}
                                  onChange={(next) =>
                                    updateCategoryTypography(group.categoryId!, next)
                                  }
                                  mode="category"
                                  inheritedFrom={inheritedFromScenario}
                                  customFonts={scenarioCustomFonts}
                                />
                              </div>
                            );
                          })()}
                          {group.questIndex === 1 && questCount > 1 && (
                            <div className="px-3 pt-2 pb-1">
                              <p className="text-xs text-amber-500/80 italic">Changes propagate to all {questCount} quests</p>
                            </div>
                          )}
                          {mainImgInfo && (
                            <div className="px-3 pt-2 pb-1">
                              <div className="w-full h-16 bg-gray-800 rounded overflow-hidden">
                                <img
                                  src={getMediaUrl(scenarioUniqid, mainImgInfo.filename)}
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
                                    {item.type === 'image' ? (
                                      <Image size={11} className="flex-shrink-0 text-blue-400" />
                                    ) : item.type === 'scenario_text' ? (
                                      <Type size={11} className="flex-shrink-0 text-violet-400" />
                                    ) : (
                                      <Type size={11} className="flex-shrink-0 text-emerald-400" />
                                    )}
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
                                        {element.type !== 'scenario_text' && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); fitElementContent(element.id); }}
                                            className="text-xs px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors"
                                            title="Fit height to content"
                                          >
                                            Fit
                                          </button>
                                        )}
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
                                      {element.type === 'scenario_text' && (() => {
                                        // Per-element override editor. The
                                        // inherited base is the resolved
                                        // category typography (or scenario
                                        // default when uncategorized) — the
                                        // [Override] toggles in TypographyEditor
                                        // flip each field between "use the
                                        // inherited value" (greyed) and "set
                                        // an element override" (active).
                                        const src = scenarioTextElements.find((t) => t.id === element.id);
                                        if (!src) return null;
                                        const cat = findCategoryForElement(element.id);
                                        const inherited = resolveTypography({
                                          category: cat?.typography,
                                          scenarioFont,
                                          scenarioFontColor,
                                        });
                                        const elementOverrideValue: TextCategoryTypography = {
                                          font: src.font,
                                          font_color: src.font_color,
                                          bold: src.bold,
                                          italic: src.italic,
                                          underline: src.underline,
                                          align: src.align,
                                          shadow: src.shadow,
                                          background: src.background,
                                        };
                                        return (
                                          <div
                                            className="px-2 pb-2"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <p className="text-[10px] uppercase tracking-wider text-violet-400 mb-1 px-0.5">
                                              {cat
                                                ? `Override (inherits "${cat.name}")`
                                                : 'Override (uncategorized — inherits scenario)'}
                                            </p>
                                            <TypographyEditor
                                              value={elementOverrideValue}
                                              onChange={(next) =>
                                                updateElementOverride(element.id, next)
                                              }
                                              mode="element"
                                              inheritedFrom={inherited}
                                              customFonts={scenarioCustomFonts}
                                            />
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      </div>
                    </Fragment>
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
              // Tracks checkpoints are anchored by their CENTER (matching the
              // runtime's translate(-50%,-50%)) and keep natural aspect; they
              // are move-only (size is the global icon-size field). Everything
              // else is a corner-anchored, resizable box.
              const isCp = isCheckpointElement(element.id);
              const hudMock = isTracksGame ? TRACKS_HUD_MOCK_TEXT[element.id] : undefined;
              const elLeft = imageBounds.x + (element.x / 100) * imageBounds.width;
              const elTop = imageBounds.y + (element.y / 100) * imageBounds.height;
              const elWidth = (element.width / 100) * imageBounds.width;
              const elHeight = (element.height / 100) * imageBounds.height;
              const elHeightPx = containerHeightPx * (elHeight / 100);
              const elWidthPx = containerWidthPx * (elWidth / 100);
              const wrapperStyle = isCp
                ? { left: `${elLeft}%`, top: `${elTop}%`, width: `${elWidth}%`, transform: 'translate(-50%, -50%)' }
                : { left: `${elLeft}%`, top: `${elTop}%`, width: `${elWidth}%`, height: `${elHeight}%` };

              // Per-type accent color drives both the wrapper border + the
              // selection chrome (label chip, drag dots, resize handle).
              // 'scenario_text' uses violet to stand apart from legacy text
              // (emerald) and image (blue) elements.
              const accentBorderSelected =
                element.type === 'image'
                  ? 'border-blue-500 shadow-lg shadow-blue-500/50'
                  : element.type === 'scenario_text'
                    ? 'border-violet-500 shadow-lg shadow-violet-500/30'
                    : 'border-emerald-500 shadow-lg shadow-emerald-500/30';
              const accentBorderHover =
                element.type === 'image'
                  ? 'border-transparent hover:border-blue-400'
                  : element.type === 'scenario_text'
                    ? 'border-transparent hover:border-violet-400'
                    : 'border-transparent hover:border-emerald-400';
              const accentLabelBg =
                element.type === 'image'
                  ? 'bg-blue-600'
                  : element.type === 'scenario_text'
                    ? 'bg-violet-600'
                    : 'bg-emerald-600';
              const accentHex =
                element.type === 'image'
                  ? '#3b82f6'
                  : element.type === 'scenario_text'
                    ? '#8b5cf6'
                    : '#10b981';
              const accentHandleBg =
                element.type === 'image'
                  ? 'bg-blue-500'
                  : element.type === 'scenario_text'
                    ? 'bg-violet-500'
                    : 'bg-emerald-500';

              // Live content + style lookup for scenario_text — content,
              // font, color, etc. live in gameMeta.text_elements[] and are
              // joined here by id. Inherits scenario font/color when unset.
              const scenarioTextSrc =
                element.type === 'scenario_text'
                  ? scenarioTextElements.find((t) => t.id === element.id)
                  : undefined;

              return (
              <div
                key={element.id}
                className={`absolute cursor-move border-2 ${
                  selectedElement === element.id ? accentBorderSelected : accentBorderHover
                }`}
                style={wrapperStyle}
                onMouseDown={(e) => handleMouseDown(e, element.id)}
              >
                {element.type === 'image' ? (
                  <>
                  {element.filename ? (
                  <img
                    src={getMediaUrl(scenarioUniqid, element.filename)}
                    alt={element.name}
                    className={`${isCp ? 'w-full h-auto' : 'w-full h-full object-fill'} pointer-events-none`}
                    draggable={false}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setNaturalAspects(prev => ({ ...prev, [element.id]: img.naturalWidth / img.naturalHeight }));
                      }
                    }}
                  />
                  ) : isClashGame && /^territory_\d+$/.test(element.id) ? (
                    // Clash territory with no clan images — map-pin marker.
                    <div className="w-full h-full flex items-center justify-center pointer-events-none text-blue-500 drop-shadow">
                      <MapPin className="w-full h-full" strokeWidth={1.5} />
                    </div>
                  ) : (
                    // Checkpoint with no uploaded icon — grabbable circle placeholder.
                    <div
                      className="w-full rounded-full border-2 border-blue-400/70 bg-blue-400/25 pointer-events-none"
                      style={{ paddingBottom: '100%' }}
                    />
                  )}
                  {hudMock && (
                    // Mock value preview, centered on the HUD frame (render-only).
                    // Mirrors the playground runtime, where timer/score/team-name
                    // inherit the scenario font + font_color from the renderer
                    // root, so the preview shows the chosen font/colour too.
                    <div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden"
                      style={{
                        fontFamily: resolveFontFamily(scenarioFont) || undefined,
                        color: scenarioFontColor || '#ffffff',
                        fontWeight: 700,
                        fontSize: `${Math.max(8, elHeightPx * 0.4)}px`,
                        textShadow: '0 1px 3px rgba(0,0,0,0.85)',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {hudMock}
                    </div>
                  )}
                  </>
                ) : element.type === 'scenario_text' ? (
                  // Author-defined translatable label. Auto-fit single-line
                  // sizing via TracksTextFit (shared with the playground
                  // runtime in slice 3). Text + style read live from the
                  // hydrated source; empty content renders an italic
                  // placeholder so unauthored boxes are still draggable.
                  scenarioTextSrc ? (
                    (() => {
                      const lang = scenarioDefaultLanguage as never;
                      const textValue = String(
                        getLocalized(
                          (scenarioTextSrc.text ?? {}) as never,
                          lang,
                          lang,
                        ) || '',
                      );
                      // Resolve via the inheritance chain — element override
                      // (per-field) wins, then category typography (if the
                      // element has one + the category exists), then
                      // scenario default.
                      const elCat = scenarioTextSrc.category
                        ? scenarioTextCategories.find((c) => c.id === scenarioTextSrc.category)
                        : undefined;
                      const resolved = resolveTypography({
                        element: {
                          font: scenarioTextSrc.font,
                          font_color: scenarioTextSrc.font_color,
                          bold: scenarioTextSrc.bold,
                          italic: scenarioTextSrc.italic,
                          underline: scenarioTextSrc.underline,
                          align: scenarioTextSrc.align,
                          shadow: scenarioTextSrc.shadow,
                          background: scenarioTextSrc.background,
                        },
                        category: elCat?.typography,
                        scenarioFont,
                        scenarioFontColor,
                      });
                      const effFontStack = resolveFontFamily(resolved.font);
                      const placeholder = !textValue.trim();
                      return (
                        <div
                          className="absolute inset-0"
                          style={{
                            background: selectedElement === element.id
                              ? 'rgba(139, 92, 246, 0.06)'
                              : 'rgba(255,255,255,0.02)',
                          }}
                        >
                          {placeholder ? (
                            <div className="w-full h-full flex items-center justify-center text-violet-300/60 italic text-sm pointer-events-none select-none">
                              (empty)
                            </div>
                          ) : (
                            <TracksTextFit
                              text={textValue}
                              boxWidthPx={elWidthPx}
                              boxHeightPx={elHeightPx}
                              fontFamily={effFontStack}
                              fontWeight={resolved.bold ? 700 : 400}
                              fontStyle={resolved.italic ? 'italic' : 'normal'}
                              underline={resolved.underline}
                              color={resolved.font_color || '#ffffff'}
                              align={resolved.align}
                              shadow={resolved.shadow}
                              background={resolved.background}
                            />
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    // Source dropped from the scenario after this layout was
                    // loaded — render a striped placeholder so the orphaned
                    // box is visible until the author removes it.
                    <div className="w-full h-full flex items-center justify-center text-violet-300/60 italic text-sm pointer-events-none select-none">
                      (missing source)
                    </div>
                  )
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
                    <div className={`absolute -top-6 left-0 text-white text-xs px-2 py-1 rounded whitespace-nowrap ${accentLabelBg}`}>
                      {element.name}
                    </div>

                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-current rounded-full border border-white shadow-sm"
                      style={{ color: accentHex }}
                    />
                    <div className="absolute top-1/2 -translate-y-1/2 -right-1 w-2 h-2 rounded-full border border-white shadow-sm"
                      style={{ background: accentHex }}
                    />
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full border border-white shadow-sm"
                      style={{ background: accentHex }}
                    />
                    <div className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-2 rounded-full border border-white shadow-sm"
                      style={{ background: accentHex }}
                    />

                    {!isCp && (
                      <div
                        className={`absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize flex items-center justify-center ${accentHandleBg}`}
                        onMouseDown={(e) => handleResizeMouseDown(e, element.id)}
                      >
                        <Maximize2 className="w-3 h-3 text-white" />
                      </div>
                    )}
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
