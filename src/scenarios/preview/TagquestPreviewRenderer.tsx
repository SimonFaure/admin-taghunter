/**
 * Tagquest preview renderer - renders the new single-template HUD using the
 * canonical `defaultTagquestLayout` as the source of truth.
 *
 * Background fills the viewport via cover. The HUD lives inside a 16:9
 * "stage" centered in the wrapper (letterbox/pillarbox on non-16:9 wrappers).
 * Template overlay + text/image elements position relative to the stage.
 *
 * The same `defaultTagquestLayout` is bundled into the playground runtime as
 * its fallback JSON - so positions are guaranteed to match in-game. (The old
 * MySQL `layouts` table seed was retired; layouts are no longer synced.)
 *
 * In `textEditMode` this doubles as Quest's layout editor for typography: the
 * HUD texts become clickable pickers for their role, driving the size/colour
 * sidebar (`TagquestTypographyPanel`).
 *
 * In `layoutEditMode` (the admin "Default layouts" page) a transparent overlay
 * of one box per element sits on top of the HUD and makes every element
 * draggable and resizable. The overlay, rather than handles woven into each
 * render branch, is what keeps this file readable: the HUD underneath renders
 * exactly as it does in-game and simply repaints as the geometry changes.
 *
 * `typographyDefaults` / `layoutOverrides` are the studio-wide defaults from the
 * same admin page (see `useTagquestDefaults`). They sit UNDER the scenario's own
 * values, and the playground applies them the same way, so the preview stays
 * honest about what the projector will draw.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultTagquestLayout, type LayoutElementInput } from '../bodies/tagquest/defaultLayout';
import {
  TAGQUEST_MAIN_IMAGE_MARGIN_MAX,
  applyTagquestLayoutOverrides,
  tagquestMainImageInsetPx,
  type TagquestLayoutOverrides,
} from '../bodies/tagquest/layoutOverrides';
import {
  mergeTagquestTypography,
  readTagquestTypography,
  resolveTagquestTextStyle,
  tagquestTextCategoryFor,
  type TagquestTextCategoryId,
  type TagquestTypography,
} from '../bodies/tagquest/typographyCategories';
import { MOCK_TEAM_STRIP, buildAdvancementForQuests } from './mockGameState';
import { resolveAdminLabel, type PreviewLabels, type PreviewLabelsMap } from './previewLabels';
import type { Lang } from '../i18n/types';
import { resolveFontFamily } from '../../fonts/resolveFontFamily';
import { registerStudioCustomFonts } from '../../fonts/registerStudioCustomFonts';
import type { CustomFont } from '../../types/scenario-data';

type Localized = Record<string, string>;

const DEFAULT_TEMPLATE_URL = '/default_templates/tagquest_template.png';

/**
 * Background-position for each of the four quest pieces, in the grid order
 * image_1..image_4 = top-left, top-right, bottom-left, bottom-right.
 * Every piece is pulled towards the centre of the 2×2 block, so the quadrants
 * touch there rather than floating apart once `contain` letterboxes them (#9).
 */
const QUEST_PIECE_POSITION = ['bottom right', 'bottom left', 'top right', 'top left'] as const;

export interface PreviewQuest {
  name?: Localized | string;
  main_image?: string;
  image_1?: string;
  image_2?: string;
  image_3?: string;
  image_4?: string;
}

export interface PreviewGameMeta {
  background_image?: string;
  malus_image?: string;
  late_malus_image?: string;
  custom_template?: string;
  use_default_template?: boolean;
  combo_6_quests?: string;
  combo_4_quests?: string;
  combo_2_quests?: string;
  font?: string;
  font_color?: string;
  custom_fonts?: CustomFont[];
  [key: string]: unknown;
}

export type QuestView = 'pieces' | 'revealed';

export interface TagquestPreviewRendererProps {
  gameMeta: PreviewGameMeta;
  quests: PreviewQuest[];
  resolveMediaUrl: (filename: string) => string;
  canonicalWidth: number;
  canonicalHeight: number;
  selectedQuestIndex: number;
  questView: QuestView;
  showMalusOverlay: boolean;
  showLateMalusOverlay: boolean;
  readLocalized: (value: Localized | string | undefined) => string;
  labels: PreviewLabels;
  /** Active editor language (for admin label resolution). */
  lang: Lang;
  /** Scenario default language (fallback chain root). */
  defaultLang: Lang;
  /** Admin-managed global labels. Undefined → falls through to DEFAULT_PREVIEW_LABELS. */
  adminLabels?: PreviewLabelsMap;
  /**
   * Typography editing: every HUD text that carries a role becomes a picker
   * for that role (dashed outline, click to select). This is what turns the
   * preview into the layout editor for size + colour - the author clicks a
   * combo number rather than decoding "combo data" in a list.
   */
  textEditMode?: boolean;
  /** Role highlighted on the stage (every element of that role, at once). */
  selectedTextCategory?: TagquestTextCategoryId | null;
  onSelectTextCategory?: (id: TagquestTextCategoryId) => void;
  /**
   * Studio-wide defaults from the admin "Default layouts" page. They sit under
   * the scenario's own `tagquest_typography` / under the code layout.
   */
  typographyDefaults?: TagquestTypography;
  layoutOverrides?: TagquestLayoutOverrides;
  /**
   * Position editing (admin page only): every element gets a drag box and a
   * resize handle. Geometry changes are reported as percentages of the stage.
   */
  layoutEditMode?: boolean;
  selectedElementId?: string | null;
  onSelectElement?: (id: string) => void;
  onElementGeometry?: (id: string, patch: { x?: number; y?: number; width?: number; height?: number }) => void;
  /**
   * Inner margin of the completed main image, dragged on the canvas by the
   * corner handle on its guide square. Percent of the box's shorter side.
   */
  onMainImageMargin?: (percent: number) => void;
}

function parseInt0(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseInt(v, 10) || 0;
  return 0;
}

function resolvePreviewFilename(
  filename: string | undefined,
  gameMeta: PreviewGameMeta,
  quests: PreviewQuest[],
  resolve: (f: string) => string,
): string {
  if (!filename) return '';
  if (!filename.startsWith('@')) return resolve(filename);
  if (filename === '@background') {
    return gameMeta.background_image ? resolve(gameMeta.background_image) : '';
  }
  if (filename === '@template' || filename === '@default') {
    const useDefault = gameMeta.use_default_template !== false;
    if (!useDefault && gameMeta.custom_template) return resolve(gameMeta.custom_template);
    return DEFAULT_TEMPLATE_URL;
  }
  if (filename === '@malus_image') {
    return gameMeta.malus_image ? resolve(gameMeta.malus_image) : '';
  }
  if (filename === '@late_malus_image') {
    return gameMeta.late_malus_image ? resolve(gameMeta.late_malus_image) : '';
  }
  const q = filename.match(/^@quest_main_image_(\d+)$/);
  if (q) {
    const idx = parseInt(q[1], 10) - 1;
    const mi = quests[idx]?.main_image;
    return mi ? resolve(mi) : '';
  }
  return '';
}

export function TagquestPreviewRenderer({
  gameMeta,
  quests,
  resolveMediaUrl,
  canonicalWidth,
  canonicalHeight,
  selectedQuestIndex,
  questView,
  showMalusOverlay,
  showLateMalusOverlay,
  readLocalized,
  labels,
  lang,
  defaultLang,
  adminLabels,
  textEditMode = false,
  selectedTextCategory = null,
  onSelectTextCategory,
  typographyDefaults,
  layoutOverrides,
  layoutEditMode = false,
  selectedElementId = null,
  onSelectElement,
  onElementGeometry,
  onMainImageMargin,
}: TagquestPreviewRendererProps) {
  const fitWrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  // Hover highlights the whole ROLE, not the single element under the cursor -
  // the author must see that touching "combo data" moves six numbers at once.
  const [hoveredCategory, setHoveredCategory] = useState<TagquestTextCategoryId | null>(null);

  // Scenario-wide font (Typography section). Overrides every layout element's
  // own fontFamily so the preview matches the in-game playground behaviour.
  const scenarioFontFamily = resolveFontFamily(gameMeta.font);

  // Per-role size/colour overrides (#1/#2) laid over the studio-wide defaults,
  // resolved through the SAME helpers the playground runtime uses so the preview
  // cannot drift from the game.
  const typography = mergeTagquestTypography(
    typographyDefaults,
    readTagquestTypography(gameMeta.tagquest_typography),
  );

  // The HUD skeleton with the admin's default positions applied. Identical to
  // what the playground builds from its bundled JSON + the same synced blob.
  const layoutElements = useMemo(
    () => applyTagquestLayoutOverrides(defaultTagquestLayout.elements, layoutOverrides),
    [layoutOverrides],
  );

  // Register the scenario's uploaded custom fonts so the preview renders them.
  useEffect(() => {
    registerStudioCustomFonts(gameMeta.custom_fonts, resolveMediaUrl);
  }, [gameMeta.custom_fonts, resolveMediaUrl]);

  // Compute the stage box that fits the wrapper at the canonical aspect
  // ratio (driven by the viewport selector), centered.
  useEffect(() => {
    const wrapper = fitWrapperRef.current;
    if (!wrapper) return;
    const TARGET =
      canonicalWidth > 0 && canonicalHeight > 0 ? canonicalWidth / canonicalHeight : 16 / 9;

    function applyFit() {
      if (!wrapper) return;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      if (w <= 0 || h <= 0) return;
      let sw: number, sh: number;
      if (w / h > TARGET) {
        sh = h;
        sw = h * TARGET;
      } else {
        sw = w;
        sh = w / TARGET;
      }
      setStage({ width: sw, height: sh });
    }

    applyFit();
    const ro = new ResizeObserver(applyFit);
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [canonicalWidth, canonicalHeight]);

  const backgroundUrl = resolvePreviewFilename('@background', gameMeta, quests, resolveMediaUrl);
  const comboPts = {
    pts6: parseInt0(gameMeta.combo_6_quests),
    pts4: parseInt0(gameMeta.combo_4_quests),
    pts2: parseInt0(gameMeta.combo_2_quests),
  };
  const advancement = buildAdvancementForQuests(quests.length);
  const activeQuest: PreviewQuest | undefined = quests[selectedQuestIndex];

  // Map element id → preview text/visibility.
  function textForElement(el: LayoutElementInput): { show: boolean; text: string } {
    const id = el.id;
    // Admin-managed chrome labels (rendered above values/icons).
    if (id === 'score_label')
      return { show: true, text: resolveAdminLabel(adminLabels, 'score', lang, defaultLang) };
    if (id === 'malus_label')
      return { show: true, text: resolveAdminLabel(adminLabels, 'malus', lang, defaultLang) };
    if (id === 'late_malus_label')
      return { show: true, text: resolveAdminLabel(adminLabels, 'late_malus', lang, defaultLang) };
    if (id === 'combo_points_label')
      return { show: true, text: resolveAdminLabel(adminLabels, 'combo_points', lang, defaultLang) };
    // Active quest name beneath the central grid.
    if (id === 'animation_quest_name') {
      if (!activeQuest) return { show: false, text: '' };
      return {
        show: true,
        text: readLocalized(activeQuest.name) || `Quest ${selectedQuestIndex + 1}`,
      };
    }
    // Per-slot quest names in the right strip. Anchored regex so it does NOT
    // match animation_quest_name.
    const qn = id.match(/^quest_(\d+)_name$/);
    if (qn) {
      const idx = parseInt(qn[1], 10) - 1;
      if (idx >= quests.length) return { show: false, text: '' };
      return {
        show: true,
        text: readLocalized(quests[idx]?.name) || `Quest ${idx + 1}`,
      };
    }
    if (id === 'timer') {
      return { show: true, text: `${MOCK_TEAM_STRIP.timerHours}:${MOCK_TEAM_STRIP.timerMinutes}:${MOCK_TEAM_STRIP.timerSeconds}` };
    }
    if (id === 'team_name_text') return { show: true, text: MOCK_TEAM_STRIP.teamName };
    if (id === 'score') return { show: true, text: MOCK_TEAM_STRIP.score };
    if (id === 'malus_multiplicator') return { show: true, text: `x${MOCK_TEAM_STRIP.malusTimes}` };
    if (id === 'malus_points') return { show: true, text: `-${MOCK_TEAM_STRIP.malusPoints}` };
    if (id === 'late_malus_multiplicator') return { show: true, text: `x${MOCK_TEAM_STRIP.lateMalusTimes}` };
    if (id === 'late_malus_points') return { show: true, text: `-${MOCK_TEAM_STRIP.lateMalusPoints}` };
    if (id === 'combo_6_title') return { show: true, text: el.previewText ?? 'COMBO 6' };
    if (id === 'combo_6_multiplicator') return { show: true, text: `x${MOCK_TEAM_STRIP.combo6Times}` };
    if (id === 'combo_6_points') return {
      show: true,
      text: `${parseInt0(MOCK_TEAM_STRIP.combo6Times) * comboPts.pts6}`,
    };
    if (id === 'combo_4_title') return { show: true, text: el.previewText ?? 'COMBO 4' };
    if (id === 'combo_4_multiplicator') return { show: true, text: `x${MOCK_TEAM_STRIP.combo4Times}` };
    if (id === 'combo_4_points') return {
      show: true,
      text: `${parseInt0(MOCK_TEAM_STRIP.combo4Times) * comboPts.pts4}`,
    };
    if (id === 'combo_2_title') return { show: true, text: el.previewText ?? 'COMBO 2' };
    if (id === 'combo_2_multiplicator') return { show: true, text: `x${MOCK_TEAM_STRIP.combo2Times}` };
    if (id === 'combo_2_points') return {
      show: true,
      text: `${parseInt0(MOCK_TEAM_STRIP.combo2Times) * comboPts.pts2}`,
    };
    const qm = id.match(/^quest_(\d+)_multiplicator$/);
    if (qm) {
      const idx = parseInt(qm[1], 10) - 1;
      const adv = advancement[idx];
      const hidden = idx >= quests.length;
      return { show: !hidden, text: adv ? `x${adv.times}` : 'x0' };
    }
    const qp = id.match(/^quest_(\d+)_points$/);
    if (qp) {
      const idx = parseInt(qp[1], 10) - 1;
      const adv = advancement[idx];
      const hidden = idx >= quests.length;
      return { show: !hidden, text: adv ? adv.points : '0' };
    }
    return { show: true, text: el.previewText ?? '' };
  }

  function imageVisibleForElement(el: LayoutElementInput): boolean {
    const id = el.id;
    if (id === 'tagquest_template') return true;
    if (id === 'malus_icon') return parseInt0(MOCK_TEAM_STRIP.malusTimes) > 0 || showMalusOverlay;
    if (id === 'late_malus_icon') return parseInt0(MOCK_TEAM_STRIP.lateMalusTimes) > 0 || showLateMalusOverlay;
    const qi = id.match(/^quest_(\d+)_icon$/);
    if (qi) {
      // Preview shows every quest icon that has a defined main_image, so the
      // author can verify all 6 slots line up with the template artwork even
      // before any quest has been completed. (Runtime applies the
      // timesCompleted ≥ 1 gate.)
      const idx = parseInt(qi[1], 10) - 1;
      if (idx >= quests.length) return false;
      return !!quests[idx]?.main_image;
    }
    if (id === 'animation_quest_image') return quests.length > 0;
    return true;
  }

  /* ── Position editing ─────────────────────────────────────────────────────
   * One transparent box per element, stacked over the finished HUD. The drag
   * state lives in a ref (not state) so a mousemove does not re-render this
   * component before the parent's geometry update lands, which is what made an
   * earlier state-based version stutter on slow machines.
   *
   * Deltas are converted to PERCENT of the stage, because that is the unit the
   * layout is authored in - so a drag means the same thing at any preview size.
   * ───────────────────────────────────────────────────────────────────────── */
  const dragRef = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    baseW: number | null;
    baseH: number | null;
  } | null>(null);

  const beginDrag = useCallback(
    (e: React.MouseEvent, el: LayoutElementInput, mode: 'move' | 'resize') => {
      e.preventDefault();
      e.stopPropagation();
      onSelectElement?.(el.id);
      dragRef.current = {
        id: el.id,
        mode,
        startX: e.clientX,
        startY: e.clientY,
        baseX: el.x,
        baseY: el.y,
        baseW: typeof el.width === 'number' ? el.width : null,
        baseH: typeof el.height === 'number' ? el.height : null,
      };
    },
    [onSelectElement],
  );

  /**
   * Drag the corner of the main image's guide square to set its inner margin.
   * The square is CENTRED in its box, so moving the corner out by d grows the
   * side by 2d - i.e. the inset shrinks by d, which is why the delta is halved.
   */
  const beginMarginDrag = useCallback(
    (e: React.PointerEvent, boxShorterPx: number, startInsetPx: number) => {
      e.preventDefault();
      e.stopPropagation();
      if (boxShorterPx <= 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      function onMove(ev: PointerEvent) {
        const d = (ev.clientX - startX + (ev.clientY - startY)) / 2;
        const inset = startInsetPx - d;
        const pct = Math.max(
          0,
          Math.min(TAGQUEST_MAIN_IMAGE_MARGIN_MAX, (inset / boxShorterPx) * 100),
        );
        onMainImageMargin?.(Math.round(pct * 10) / 10);
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [onMainImageMargin],
  );

  useEffect(() => {
    if (!layoutEditMode) return;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    function onMove(ev: MouseEvent) {
      const d = dragRef.current;
      if (!d || stage.width <= 0 || stage.height <= 0) return;
      const dx = ((ev.clientX - d.startX) / stage.width) * 100;
      const dy = ((ev.clientY - d.startY) / stage.height) * 100;
      if (d.mode === 'move') {
        onElementGeometry?.(d.id, { x: round2(d.baseX + dx), y: round2(d.baseY + dy) });
        return;
      }
      // Resizing an element authored with a CSS keyword ('auto' on the malus
      // icons) would silently freeze its aspect ratio into a number, so the
      // handle is not offered for those and this guard matches it.
      if (d.baseW == null || d.baseH == null) return;
      onElementGeometry?.(d.id, {
        width: round2(Math.max(0.5, d.baseW + dx)),
        height: round2(Math.max(0.5, d.baseH + dy)),
      });
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [layoutEditMode, stage.width, stage.height, onElementGeometry]);

  return (
    <div
      ref={fitWrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0f172a',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Full-bleed background image */}
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt=""
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        />
      )}

      {/* 16:9 stage centered in the wrapper */}
      {stage.width > 0 && (
        <div
          ref={stageRef}
          style={{
            position: 'relative',
            width: `${stage.width}px`,
            height: `${stage.height}px`,
            fontFamily: scenarioFontFamily || 'Arial Black, Arial, sans-serif',
            color: gameMeta.font_color || '#ffffff',
          }}
        >
          {layoutElements.map((el, idx) => {
            const dimToCss = (v: number | string): string =>
              typeof v === 'string' ? v : `${v}%`;
            const styleBase: React.CSSProperties = {
              position: 'absolute',
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: dimToCss(el.width),
              height: dimToCss(el.height),
            };

            if (el.type === 'image') {
              if (el.id === 'animation_quest_image') {
                // Preview: render the active quest's 2x2 pieces grid or the
                // revealed main image.
                if (!imageVisibleForElement(el)) return null;
                // Inner margin of the COMPLETED image (admin "Default layouts"):
                // room for the status glow, which hugs the artwork's alpha and
                // otherwise bleeds past the box. Resolved through the shared
                // helper against the box in PIXELS, exactly like the runtime, so
                // the same percentage means the same inset in both. The pieces
                // grid is untouched - its quadrants are authored to meet.
                const mainInsetPx = tagquestMainImageInsetPx(
                  layoutOverrides,
                  typeof el.width === 'number' ? (el.width / 100) * stage.width : 0,
                  typeof el.height === 'number' ? (el.height / 100) * stage.height : 0,
                );
                return (
                  <div key={`${el.id}-${idx}`} style={{ ...styleBase, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {questView === 'pieces' && activeQuest && (
                      <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                        {(['image_1', 'image_2', 'image_3', 'image_4'] as const).map((k, i) => {
                          const f = activeQuest[k];
                          return (
                            <div key={k} style={{
                              width: '100%',
                              height: '100%',
                              // `contain`, not `cover` (#9/#13): the cells are not
                              // square while the artwork is, so `cover` cropped the
                              // top and bottom off every piece - the author could
                              // not judge the real rendering.
                              //
                              // Each piece is then anchored towards the CENTRE of
                              // the 2×2 block (top-left piece → bottom right, and
                              // so on) so the four quadrants meet in the middle
                              // instead of drifting apart with a gap between them.
                              background: f
                                ? `${QUEST_PIECE_POSITION[i]}/contain no-repeat url(${resolveMediaUrl(f)})`
                                : 'rgba(255,255,255,0.08)',
                            }} />
                          );
                        })}
                      </div>
                    )}
                    {questView === 'revealed' && activeQuest && activeQuest.main_image && (
                      // `contain` + no frame, matching the runtime: the green
                      // border was removed in-game (#100) and cropping the
                      // artwork to the box was removed with it (#61).
                      <img
                        src={resolveMediaUrl(activeQuest.main_image)}
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          padding: mainInsetPx > 0 ? `${mainInsetPx}px` : undefined,
                          boxSizing: 'border-box',
                        }}
                      />
                    )}
                    {questView === 'revealed' && activeQuest && !activeQuest.main_image && (
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
                        {readLocalized(activeQuest.name) || `Quest ${selectedQuestIndex + 1}`}
                      </div>
                    )}
                  </div>
                );
              }

              const src = resolvePreviewFilename(el.filename, gameMeta, quests, resolveMediaUrl);
              const visible = imageVisibleForElement(el);
              if (!src) {
                return <div key={`${el.id}-${idx}`} style={{ ...styleBase, display: visible ? 'block' : 'none' }} />;
              }
              // Retours #4 - the two malus icons showed up tiny, floating near
              // the middle of the stage instead of sitting in their frames.
              // Cause: they are the only elements authored with `width: 'auto'`
              // (height fixed, width from the artwork's own ratio). The wrapper
              // therefore had no definite width, while the <img> inside asked
              // for `width: 100%` of it - so the box shrink-fit to the image's
              // INTRINSIC width (hundreds of px) and `object-fit: contain` then
              // letterboxed the icon in the middle of that oversized box.
              //
              // An element with an `auto` dimension is now positioned directly
              // on the <img>: an absolutely-positioned replaced element with one
              // definite side derives the other from its aspect ratio, which is
              // exactly what 'auto' was authored to mean.
              const hasAutoDim = typeof el.width === 'string' || typeof el.height === 'string';
              if (hasAutoDim) {
                return (
                  <img
                    key={`${el.id}-${idx}`}
                    src={src}
                    alt={el.name}
                    style={{ ...styleBase, display: visible ? 'block' : 'none', objectFit: 'contain' }}
                  />
                );
              }
              return (
                <div key={`${el.id}-${idx}`} style={{ ...styleBase, display: visible ? 'block' : 'none' }}>
                  <img src={src} alt={el.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              );
            }

            // text
            const { show, text } = textForElement(el);
            if (!show) return null;
            // The author's per-role size percentage + colour (#1/#2) applied to
            // the element's authored values, then the stage scaling: fontSize
            // values in defaultLayout.ts are authored against a 1920-wide
            // canonical stage, so scaling by `stage.width / 1920` keeps the same
            // proportion against the template artwork at any actual stage size
            // (modal preview, fullscreen, mobile).
            const styled = resolveTagquestTextStyle(el.id, typography, el.fontSize, el.color);
            const fontSizePx = styled.fontSize != null
              ? styled.fontSize * (stage.width / 1920)
              : undefined;
            // Typography editing: the element stands in for its ROLE, so a
            // click anywhere on a combo number selects "combo data" and the
            // outline lights up on every element sharing that role.
            const catId = textEditMode ? tagquestTextCategoryFor(el.id) : null;
            const picked = catId != null && catId === selectedTextCategory;
            const hovered = catId != null && catId === hoveredCategory;
            return (
              <div
                key={`${el.id}-${idx}`}
                onClick={
                  catId
                    ? (e) => {
                        e.stopPropagation();
                        onSelectTextCategory?.(catId);
                      }
                    : undefined
                }
                onMouseEnter={catId ? () => setHoveredCategory(catId) : undefined}
                onMouseLeave={
                  catId
                    ? () => setHoveredCategory((c) => (c === catId ? null : c))
                    : undefined
                }
                style={{
                  ...styleBase,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: fontSizePx ? `${fontSizePx}px` : undefined,
                  fontFamily: scenarioFontFamily || el.fontFamily,
                  color: styled.color,
                  textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: catId ? 'pointer' : undefined,
                  outline: picked
                    ? '2px solid #3b82f6'
                    : catId
                      ? `1px dashed rgba(96,165,250,${hovered ? 0.95 : 0.45})`
                      : undefined,
                  // The author's plate (absent on every role by default), with
                  // the edit-mode highlight taking over while a role is picked.
                  background: picked
                    ? 'rgba(59,130,246,0.22)'
                    : hovered
                      ? 'rgba(59,130,246,0.12)'
                      : styled.background,
                }}
              >
                {text}
              </div>
            );
          })}

          {/* Drag/resize overlay. `tagquest_template` is deliberately absent:
              it is the full-stage artwork, so a box over it would swallow every
              click on empty template area and it is never meant to move. */}
          {layoutEditMode && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
              {layoutElements
                .filter((el) => el.id !== 'tagquest_template')
                .map((el) => {
                  const numericW = typeof el.width === 'number';
                  const numericH = typeof el.height === 'number';
                  const isSel = selectedElementId === el.id;
                  return (
                    <div
                      key={`edit-${el.id}`}
                      title={el.name}
                      onMouseDown={(e) => beginDrag(e, el, 'move')}
                      style={{
                        position: 'absolute',
                        left: `${el.x}%`,
                        top: `${el.y}%`,
                        width: numericW ? `${el.width as number}%` : '4%',
                        height: numericH ? `${el.height as number}%` : '4%',
                        cursor: 'move',
                        outline: isSel
                          ? '2px solid #f59e0b'
                          : '1px dashed rgba(251,191,36,0.5)',
                        outlineOffset: '-1px',
                        background: isSel ? 'rgba(245,158,11,0.18)' : 'transparent',
                      }}
                    >
                      {/* The completed main image is the one element with an
                          inner geometry of its own: show where its margin puts
                          it, so the admin can judge the number with no artwork
                          loaded on this page. */}
                      {el.id === 'animation_quest_image' &&
                        (() => {
                          const boxWpx =
                            typeof el.width === 'number' ? (el.width / 100) * stage.width : 0;
                          const boxHpx =
                            typeof el.height === 'number' ? (el.height / 100) * stage.height : 0;
                          const shorter = Math.min(boxWpx, boxHpx);
                          const inset = tagquestMainImageInsetPx(layoutOverrides, boxWpx, boxHpx);
                          const side = Math.max(1, shorter - 2 * inset);
                          return (
                            <div
                              style={{
                                position: 'absolute',
                                left: '50%',
                                top: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: `${side}px`,
                                height: `${side}px`,
                                border: '1px dashed rgba(96,165,250,0.9)',
                                pointerEvents: 'none',
                              }}
                            >
                              {/* Drag the corner to set the margin. Only handle
                                  on this layer that takes pointer events, so the
                                  guide itself never blocks moving the element. */}
                              <div
                                onPointerDown={(e) => beginMarginDrag(e, shorter, inset)}
                                title={el.name}
                                style={{
                                  position: 'absolute',
                                  right: '-5px',
                                  bottom: '-5px',
                                  width: '10px',
                                  height: '10px',
                                  background: '#60a5fa',
                                  border: '1px solid #ffffff',
                                  cursor: 'nwse-resize',
                                  pointerEvents: 'auto',
                                  touchAction: 'none',
                                }}
                              />
                            </div>
                          );
                        })()}
                      {isSel && numericW && numericH && (
                        <div
                          onMouseDown={(e) => beginDrag(e, el, 'resize')}
                          style={{
                            position: 'absolute',
                            right: '-5px',
                            bottom: '-5px',
                            width: '10px',
                            height: '10px',
                            background: '#f59e0b',
                            border: '1px solid #ffffff',
                            cursor: 'nwse-resize',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Localized labels - currently unused; kept in the surface to preserve
          the modal's label-injection API. */}
      <span style={{ display: 'none' }}>{labels.ptsSuffix}</span>
    </div>
  );
}
