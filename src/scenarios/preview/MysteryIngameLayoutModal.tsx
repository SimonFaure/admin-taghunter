/**
 * Mystery in-game / idle layout editor - full-screen modal launched from the
 * Mystery scenario editor. Four authoring modes, switched by a header toggle:
 *
 *   • Texts - place the 4 in-game text roles (enigma name, timer, score, team
 *     name) over the real in-game board; each box's dimensions drive its font
 *     size (long team names shrink to fit). Stored at `gameMeta.ingame_layout`.
 *   • Frames - place the timer / score / team-name plates and the bonus
 *     ("overscore") plate, independently of the text that sits in them. Stored
 *     at `gameMeta.ingame_frames`.
 *   • Gauge - "calage du remplissage": where the coloured fill starts and stops
 *     inside the author's own gauge artwork. The same four values the Gauge
 *     section holds (`gauge_fill_inset_*` / `gauge_fill_radius`), but dragged on
 *     the real gauge instead of typed blind.
 *   • Image - "fond de l'image principale": how big the square underlay (the
 *     coloured sub-frame) behind the centre enigma image is, and - separately -
 *     how big the image itself is, each dragged by its own corner handle.
 *     Stored at `gameMeta.enigma_underlay_scale` / `gameMeta.enigma_image_scale`.
 *     The underlay started life as a text field in the editor's "Cadre et
 *     habillage" section and was moved here for the same reason the gauge
 *     calibration was: a geometry value typed blind against artwork you cannot
 *     see is a guess.
 *   • Idle - place up to two fully styled text elements (scenario title +
 *     subtitle) over the background. This is the screen the playground shows
 *     between teams when "reveal results on Enter/click" is off. Each element
 *     carries its own font / explicit size / color and is independently
 *     togg-able. Stored at `gameMeta.idle_layout`.
 *
 * Reads live in-memory `gameMeta` via `useScenarioEditor` and writes positions
 * back, so changes persist through the normal Save flow and sync to the
 * playground. The board/background behind the draggable boxes is the real
 * `MysteryPreviewRenderer` (with its own text overlays hidden) so the author
 * sees exactly what the playground will show.
 *
 * Plan: C:\Users\faure\.claude\plans\giggly-weaving-gosling.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, RotateCcw, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { useScenarioEditor } from '../shell/useScenarioEditor';
import { getLocalized } from '../i18n/getLocalized';
import type { Lang } from '../i18n/types';
import { resolveFontFamily } from '../../fonts/resolveFontFamily';
import {
  MysteryPreviewRenderer,
  IDLE_SUBTITLE_SAMPLE,
  type EnigmaTileRect,
  type PreviewMysteryGameMeta,
} from './MysteryPreviewRenderer';
import {
  INGAME_ROLES,
  IDLE_ROLES,
  FRAME_ROLES,
  BONUS_FRAME_ROLE,
  MysteryLayoutBox,
  MysteryIdleBox,
  resolveIngameLayout,
  resolveIdleLayout,
  resolveIngameFrames,
  resolveMysteryUnderlayScale,
  resolveMysteryEnigmaImageScale,
  resolveMysteryUnderlayOffset,
  resolveMysteryEnigmaImageOffset,
  mysteryCenteredBox,
  type MysteryBoxOffset,
  type IngameAlign,
  type IngameBox,
  type IngameFrameKey,
  type IngameFrames,
  type IngameLayout,
  type IngameRoleKey,
  type IdleElement,
  type IdleLayout,
  type IdleRoleKey,
} from './mysteryIngameLayout';

interface MysteryIngameLayoutModalProps {
  open: boolean;
  onClose: () => void;
}

// Canonical authoring viewport - positions are stored as % of this.
const CANON_W = 1920;
const CANON_H = 1080;
const MIN_BOX = 4; // minimum box width/height in %

const DEFAULT_TEAM_SAMPLE = 'Les Aventuriers du Temps Perdu';

type EditorMode = 'ingame' | 'frames' | 'gauge' | 'underlay' | 'idle';

/** Bounds on the main-image underlay and on the image itself: below a tenth of
 *  the cell there is nothing left to look at, and 100 % is the historical
 *  full-height tile. */
const UNDERLAY_MIN_PCT = 10;
// Furthest a box can be moved from the centre, % of the square (either way).
const OFFSET_MAX_PCT = 50;
const UNDERLAY_MAX_PCT = 100;

/** Frame plates the author can place: the three text plates + the bonus plate
 *  (an image block, not a text role - see BONUS_FRAME_ROLE). */
const FRAME_EDIT_ROLES = [...FRAME_ROLES, BONUS_FRAME_ROLE];

/* ── Gauge geometry, in % of the CANONICAL stage ──────────────────────────────
 * The renderers lay the gauge out in flow: 2 % stage padding, then the bar
 * strip along the bottom (0.18 stage-height wrapper + 0.01 margin) with the
 * 0.08-high bar centred in it. The draggable handles have to sit on that exact
 * rectangle, so the numbers are mirrored here. Keep in sync with the gauge
 * block of MysteryPreviewRenderer / MysteryGameRenderer. */
const GAUGE_BAR_LEFT_PCT = 2;
const GAUGE_BAR_WIDTH_PCT = 96;
const GAUGE_BAR_HEIGHT_PCT = 8;
const GAUGE_BAR_TOP_PCT = 85; // 100 - 2 (padding) - 18 (strip) + 5 (centring)
/** Largest inset the handles allow, so the fill track can never invert. */
const GAUGE_MAX_INSET_PCT = 45;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Round to 1 decimal - the values are authored as strings in game_meta. */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Parse an authored gauge field; null on blank/garbage (= "legacy value"). */
function gaugeField(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export function MysteryIngameLayoutModal({ open, onClose }: MysteryIngameLayoutModalProps) {
  const { t } = useTranslation();
  const roleLabel = (key: IngameRoleKey | IngameFrameKey) =>
    t(`scenarioPreview:ingameLayout.roles.${key}`);
  const idleRoleLabel = (key: IdleRoleKey) => t(`scenarioPreview:ingameLayout.idleRoles.${key}`);
  const editor = useScenarioEditor();
  const meta = editor.gameMeta as PreviewMysteryGameMeta;
  const lang = editor.currentLanguage as Lang;
  const defaultLang = editor.defaultLanguage as Lang;

  const [mode, setMode] = useState<EditorMode>('ingame');

  // In-game layout state.
  const [layout, setLayout] = useState<Required<IngameLayout>>(() =>
    resolveIngameLayout(meta.ingame_layout),
  );
  const [selected, setSelected] = useState<IngameRoleKey>('enigma_name');
  const [teamSample, setTeamSample] = useState(DEFAULT_TEAM_SAMPLE);

  // Frame rectangles (timer / score / team name plates). Placed independently of
  // the text they sit behind, so an author can enlarge the score plate without
  // blowing up the score text with it (retour #42) and can position the newly
  // uploadable team-name frame (retour #36).
  const [frames, setFrames] = useState<Record<IngameFrameKey, IngameBox>>(() =>
    resolveIngameFrames(meta.ingame_frames),
  );
  const [selectedFrame, setSelectedFrame] = useState<IngameFrameKey>('timer');

  // Gauge "calage du remplissage" - the fill inset/radius values. Unlike the
  // boxes above these are written straight into gameMeta (they are the very
  // same four fields the Gauge section edits, so there is nothing to keep in
  // sync locally). `gaugeDemo` only drives the preview's fill %.
  const [gaugeDemo, setGaugeDemo] = useState(60);
  // What the author is currently TYPING in a gauge field, per key. Without it a
  // controlled numeric input rewrites "12." to "12" mid-keystroke and decimals
  // become unenterable. Dropped on blur, so the stored value wins again.
  const [gaugeDraft, setGaugeDraft] = useState<Record<string, string>>({});

  // Where the centre enigma square currently sits, measured and reported by the
  // backdrop renderer (the underlay mode hangs its two handles on it).
  const [enigmaTileRect, setEnigmaTileRect] = useState<EnigmaTileRect | null>(null);

  // Idle layout state.
  const [idleLayout, setIdleLayout] = useState<Required<IdleLayout>>(() =>
    resolveIdleLayout(meta.idle_layout),
  );
  const [selectedIdle, setSelectedIdle] = useState<IdleRoleKey>('title');
  const [subtitleSample, setSubtitleSample] = useState(IDLE_SUBTITLE_SAMPLE);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Re-seed from the scenario whenever the modal (re)opens, so external edits
  // to gameMeta are reflected.
  useEffect(() => {
    if (open) {
      setLayout(resolveIngameLayout(meta.ingame_layout));
      setIdleLayout(resolveIdleLayout(meta.idle_layout));
      setFrames(resolveIngameFrames(meta.ingame_frames));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Push every in-game change into the editor's live gameMeta so it persists.
  useEffect(() => {
    if (!open) return;
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), ingame_layout: layout }) as typeof m,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, open]);

  // Push every idle change into the editor's live gameMeta so it persists.
  useEffect(() => {
    if (!open) return;
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), idle_layout: idleLayout }) as typeof m,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleLayout, open]);

  // Same for the frame rectangles.
  useEffect(() => {
    if (!open) return;
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), ingame_frames: frames }) as typeof m,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, open]);

  // Fit a CANON_W×CANON_H stage inside the canvas wrapper, centred - identical
  // math to MysteryPreviewRenderer so our draggable layer aligns with the board.
  useEffect(() => {
    if (!open) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const TARGET = CANON_W / CANON_H;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const overlayFont = resolveFontFamily(meta.font) || 'Arial Black, Arial, sans-serif';
  const overlayColor = meta.font_color || '#ffffff';
  const scoreFullGame = meta.score_full_game ?? '100';
  const pointsUnits = meta.points_units ?? 'points';

  const firstEnigma = (meta.enigmas ?? [])[0];
  const enigmaSample = firstEnigma
    ? getLocalized(firstEnigma.text as never, lang, defaultLang) ||
      t('scenarioPreview:ingameLayout.sample.enigmaNumber', { number: firstEnigma.number ?? 1 })
    : t('scenarioPreview:ingameLayout.sample.enigmaName');

  const scenarioTitle =
    getLocalized(meta.title as never, lang, defaultLang) ||
    t('scenarioPreview:ingameLayout.sample.scenarioTitle');

  const textByRole: Record<IngameRoleKey, string> = useMemo(
    () => ({
      enigma_name: enigmaSample,
      timer: '88:88',
      // In points mode the board draws the bare score, never "60/100" - sizing
      // the box against a "sur X" string the postes de jeu never render made
      // every score plate come out too wide.
      score: pointsUnits === 'percentage' ? '100%' : `${scoreFullGame}`,
      team_name: teamSample || t('scenarioPreview:ingameLayout.sample.teamName'),
    }),
    [enigmaSample, pointsUnits, scoreFullGame, teamSample],
  );

  const idleTextByRole: Record<IdleRoleKey, string> = useMemo(
    () => ({
      title: scenarioTitle,
      subtitle: subtitleSample || IDLE_SUBTITLE_SAMPLE,
    }),
    [scenarioTitle, subtitleSample],
  );

  function updateBox(role: IngameRoleKey, patch: Partial<IngameBox>) {
    setLayout((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));
  }

  function updateIdle(role: IdleRoleKey, patch: Partial<IdleElement>) {
    setIdleLayout((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));
  }

  function updateFrame(role: IngameFrameKey, patch: Partial<IngameBox>) {
    setFrames((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));
  }

  // Shared pointer drag (move) / resize (bottom-right handle): deltas px → %.
  function dragBox(
    e: React.PointerEvent,
    dragMode: 'move' | 'resize',
    start: { left: number; top: number; width: number; height: number },
    apply: (patch: { left?: number; top?: number; width?: number; height?: number }) => void,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const sw = stage.width || 1;
    const sh = stage.height || 1;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    function onMove(ev: PointerEvent) {
      const dxPct = ((ev.clientX - startX) / sw) * 100;
      const dyPct = ((ev.clientY - startY) / sh) * 100;
      if (dragMode === 'move') {
        apply({
          left: clamp(start.left + dxPct, 0, 100 - start.width),
          top: clamp(start.top + dyPct, 0, 100 - start.height),
        });
      } else {
        apply({
          width: clamp(start.width + dxPct, MIN_BOX, 100 - start.left),
          height: clamp(start.height + dyPct, MIN_BOX, 100 - start.top),
        });
      }
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startDrag(e: React.PointerEvent, role: IngameRoleKey, dragMode: 'move' | 'resize') {
    setSelected(role);
    dragBox(e, dragMode, layout[role], (patch) => updateBox(role, patch));
  }

  function startIdleDrag(e: React.PointerEvent, role: IdleRoleKey, dragMode: 'move' | 'resize') {
    setSelectedIdle(role);
    dragBox(e, dragMode, idleLayout[role], (patch) => updateIdle(role, patch));
  }

  function startFrameDrag(e: React.PointerEvent, role: IngameFrameKey, dragMode: 'move' | 'resize') {
    setSelectedFrame(role);
    dragBox(e, dragMode, frames[role], (patch) => updateFrame(role, patch));
  }

  /* ── Gauge fill geometry ─────────────────────────────────────────────────
   * The four values are stored as strings on gameMeta, blank meaning "keep the
   * historical value". The historical value is a px inset derived from the bar
   * height, so it is resolution-dependent - the seeds below convert it to the
   * equivalent % on this stage, which is exactly what the handles then write.
   */
  const gaugeBarWidthPx = (GAUGE_BAR_WIDTH_PCT / 100) * stage.width;
  const gaugeBarHeightPx = (GAUGE_BAR_HEIGHT_PCT / 100) * stage.height;
  // Mirrors resolveMysteryGaugeGeometry: half an icon (bar height - 14) plus
  // 8 px of breathing room horizontally, a flat 7 px vertically.
  const legacyInsetPx = (gaugeBarHeightPx - 14) / 2 + 8;
  const legacyInsetXPct = gaugeBarWidthPx > 0 ? round1((legacyInsetPx / gaugeBarWidthPx) * 100) : 0;
  const legacyInsetYPct = gaugeBarHeightPx > 0 ? round1((7 / gaugeBarHeightPx) * 100) : 0;

  const insetLeftPct = gaugeField(meta.gauge_fill_inset_left) ?? legacyInsetXPct;
  const insetRightPct = gaugeField(meta.gauge_fill_inset_right) ?? legacyInsetXPct;
  const insetYPct = gaugeField(meta.gauge_fill_inset_y) ?? legacyInsetYPct;
  const fillRadiusPx = gaugeField(meta.gauge_fill_radius) ?? 6;

  function setGaugeField(key: string, value: number | '') {
    editor.setGameMeta(
      (m) => ({ ...(m as Record<string, unknown>), [key]: value === '' ? '' : String(value) }) as typeof m,
    );
  }

  /** Drag one edge of the fill track. Deltas px → % of the gauge BAR (which is
   *  what resolveMysteryGaugeGeometry's percentages are relative to). */
  function startGaugeDrag(e: React.PointerEvent, edge: 'left' | 'right' | 'y') {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const barW = gaugeBarWidthPx || 1;
    const barH = gaugeBarHeightPx || 1;
    const start = { left: insetLeftPct, right: insetRightPct, y: insetYPct };
    (e.target as Element).setPointerCapture?.(e.pointerId);

    function onMove(ev: PointerEvent) {
      const dxPct = ((ev.clientX - startX) / barW) * 100;
      const dyPct = ((ev.clientY - startY) / barH) * 100;
      if (edge === 'left') {
        setGaugeField('gauge_fill_inset_left', round1(clamp(start.left + dxPct, 0, GAUGE_MAX_INSET_PCT)));
      } else if (edge === 'right') {
        setGaugeField('gauge_fill_inset_right', round1(clamp(start.right - dxPct, 0, GAUGE_MAX_INSET_PCT)));
      } else {
        setGaugeField('gauge_fill_inset_y', round1(clamp(start.y + dyPct, 0, GAUGE_MAX_INSET_PCT)));
      }
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /* ── Main-image underlay ("fond de l'image principale") + image size ───────
   * Two numbers, each a % of the square available to the centre enigma image:
   * `enigma_underlay_scale` (the coloured sub-frame) and `enigma_image_scale`
   * (the picture). They used to be one - the image filled the underlay - so
   * resizing the frame resized the image and the frame always hugged it
   * (retour 2026-09-16). The square is positioned by the board's flex layout,
   * so instead of mirroring that layout here the renderer MEASURES it and
   * reports its rectangle - `onEnigmaTileRect`.
   * ───────────────────────────────────────────────────────────────────────── */
  const underlayScale = resolveMysteryUnderlayScale(meta);
  const imageScale = resolveMysteryEnigmaImageScale(meta);
  // Positions (retours sept. 2026 #38): each box can also be moved off-centre,
  // by % of the same square. Blank = centred.
  const underlayOffset = resolveMysteryUnderlayOffset(meta);
  const imageOffset = resolveMysteryEnigmaImageOffset(meta);
  const reportEnigmaTileRect = useCallback((rect: EnigmaTileRect | null) => {
    setEnigmaTileRect((prev) => {
      if (prev === rect) return prev;
      if (
        prev &&
        rect &&
        Math.abs(prev.left - rect.left) < 0.01 &&
        Math.abs(prev.top - rect.top) < 0.01 &&
        Math.abs(prev.width - rect.width) < 0.01 &&
        Math.abs(prev.height - rect.height) < 0.01
      ) {
        // Same rectangle: bail out so a measure pass cannot drive a render loop.
        return prev;
      }
      return rect;
    });
  }, []);

  function setUnderlayScale(value: number | '') {
    editor.setGameMeta((m) => {
      const cur = m as Record<string, unknown>;
      const next: Record<string, unknown> = {
        ...cur,
        enigma_underlay_scale: value === '' ? '' : String(value),
      };
      // A blank image size means "same as the underlay" (how scenarios drew
      // before the split). Pin it to what is on screen before the underlay
      // moves, otherwise the picture would follow the frame again.
      if (value !== '' && String(cur.enigma_image_scale ?? '').trim() === '') {
        next.enigma_image_scale = String(resolveMysteryEnigmaImageScale(cur));
      }
      return next as typeof m;
    });
  }

  function setImageScale(value: number | '') {
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          enigma_image_scale: value === '' ? '' : String(value),
        }) as typeof m,
    );
  }

  /** Write one box's position (% of the square). 0 is stored blank = centred. */
  function setOffset(target: 'underlay' | 'image', axis: 'x' | 'y', value: number | '') {
    const key = `enigma_${target}_offset_${axis}`;
    editor.setGameMeta(
      (m) =>
        ({
          ...(m as Record<string, unknown>),
          [key]: value === '' || value === 0 ? '' : String(value),
        }) as typeof m,
    );
  }

  /**
   * Drag a box's move handle: the box follows the pointer, stored as % of the
   * measured square (the unit the renderers position it in).
   */
  function startMoveDrag(e: React.PointerEvent, target: 'underlay' | 'image') {
    e.preventDefault();
    e.stopPropagation();
    if (!enigmaTileRect || stage.height <= 0) return;
    const fullSidePx = (enigmaTileRect.height / 100) * stage.height;
    if (fullSidePx <= 0) return;
    const base: MysteryBoxOffset = target === 'underlay' ? underlayOffset : imageOffset;
    const startX = e.clientX;
    const startY = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    function onMove(ev: PointerEvent) {
      const x = round1(clamp(base.x + ((ev.clientX - startX) / fullSidePx) * 100, -OFFSET_MAX_PCT, OFFSET_MAX_PCT));
      const y = round1(clamp(base.y + ((ev.clientY - startY) / fullSidePx) * 100, -OFFSET_MAX_PCT, OFFSET_MAX_PCT));
      setOffset(target, 'x', x);
      setOffset(target, 'y', y);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /**
   * Drag a corner of the underlay (bottom-right handle) or of the image
   * (top-left handle - the two boxes can be the same size, and their handles
   * must not land on the same spot). Both boxes are CENTRED in the measured
   * square, so moving a corner outwards by d grows the side by 2d - hence the
   * halved delta; "outwards" is down-right for one handle, up-left for the other.
   */
  function startScaleDrag(e: React.PointerEvent, target: 'underlay' | 'image') {
    e.preventDefault();
    e.stopPropagation();
    if (!enigmaTileRect || stage.height <= 0) return;
    const fullSidePx = (enigmaTileRect.height / 100) * stage.height;
    if (fullSidePx <= 0) return;
    const startSidePx = fullSidePx * ((target === 'underlay' ? underlayScale : imageScale) / 100);
    const apply = target === 'underlay' ? setUnderlayScale : setImageScale;
    const startX = e.clientX;
    const startY = e.clientY;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    function onMove(ev: PointerEvent) {
      const outward = target === 'underlay' ? 1 : -1;
      const d = (outward * (ev.clientX - startX + (ev.clientY - startY))) / 2;
      const side = startSidePx + 2 * d;
      apply(round1(clamp((side / fullSidePx) * 100, UNDERLAY_MIN_PCT, UNDERLAY_MAX_PCT)));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  if (!open) return null;

  const sel = layout[selected];
  const selIdle = idleLayout[selectedIdle];
  const selFrame = frames[selectedFrame];

  // gameMeta for the backdrop: live meta + our in-progress layouts, with text
  // overlays suppressed (we draw our own draggable copies on top).
  const backdropMeta: PreviewMysteryGameMeta = {
    ...meta,
    ingame_layout: layout,
    ingame_frames: frames as IngameFrames,
    idle_layout: idleLayout,
  };

  const modeBtn = (m: EditorMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`px-3 py-1 text-xs font-medium rounded ${
        mode === m ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-white shadow-2xl flex flex-col overflow-hidden w-screen h-screen"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-slate-50">
          <h2 className="text-sm font-semibold text-gray-900">
            {t(`scenarioPreview:ingameLayout.title.${mode}`)}
          </h2>
          {/* Mode toggle */}
          <div className="flex items-center gap-0.5 p-0.5 bg-gray-100 rounded border border-gray-200">
            {modeBtn('ingame', t('scenarioPreview:ingameLayout.mode.ingame'))}
            {modeBtn('frames', t('scenarioPreview:ingameLayout.mode.frames'))}
            {modeBtn('gauge', t('scenarioPreview:ingameLayout.mode.gauge'))}
            {modeBtn('underlay', t('scenarioPreview:ingameLayout.mode.underlay'))}
            {modeBtn('idle', t('scenarioPreview:ingameLayout.mode.idle'))}
          </div>
          <span className="text-xs text-gray-500">
            {t(`scenarioPreview:ingameLayout.hint.${mode}`)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => editor.save()}
              disabled={editor.isSaving}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {editor.isSaving
                ? t('scenarioPreview:ingameLayout.saving')
                : t('scenarioPreview:ingameLayout.save')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-200"
              aria-label={t('scenarioPreview:ingameLayout.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Sidebar */}
          <div className="w-72 shrink-0 border-r border-gray-200 bg-white overflow-y-auto p-3 space-y-4">
            {mode === 'frames' ? (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">{t('scenarioPreview:ingameLayout.elements')}</p>
                  <div className="space-y-1">
                    {FRAME_EDIT_ROLES.map((role) => {
                      const hasImage = !!meta[role.frameImageKey];
                      return (
                        <button
                          key={role.key}
                          type="button"
                          onClick={() => setSelectedFrame(role.key as IngameFrameKey)}
                          className={`w-full text-left px-2.5 py-1.5 text-sm rounded border ${
                            selectedFrame === role.key
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {roleLabel(role.key)}
                          {!hasImage && (
                            <span className="ml-1 text-[11px] text-gray-400">
                              {t('scenarioPreview:ingameLayout.noFrameImage')}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t('scenarioPreview:ingameLayout.framesHint')}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {(['left', 'top', 'width', 'height'] as const).map((field) => (
                      <label key={field} className="text-xs text-gray-600">
                        <span className="capitalize">{t(`scenarioPreview:ingameLayout.field.${field}`)}</span>
                        <input
                          type="number"
                          value={Math.round(selFrame[field])}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            if (!isFinite(n)) return;
                            updateFrame(selectedFrame, { [field]: clamp(n, 0, 100) } as Partial<IngameBox>);
                          }}
                          className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFrames(resolveIngameFrames(undefined))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> {t('scenarioPreview:ingameLayout.resetDefaults')}
                </button>
              </>
            ) : mode === 'gauge' ? (
              <>
                <p className="text-[11px] text-gray-500 leading-snug">
                  {t('scenarioPreview:ingameLayout.gaugeHelp')}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['gauge_fill_inset_left', insetLeftPct, 'fillInsetLeft'],
                    ['gauge_fill_inset_right', insetRightPct, 'fillInsetRight'],
                    ['gauge_fill_inset_y', insetYPct, 'fillInsetY'],
                  ] as Array<[string, number, string]>).map(([key, value, labelKey]) => (
                    <label key={key} className="text-xs text-gray-600">
                      <span>{t(`scenarioPreview:ingameLayout.${labelKey}`)}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={gaugeDraft[key] ?? String(value)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setGaugeDraft((d) => ({ ...d, [key]: raw }));
                          const n = parseFloat(raw);
                          if (!isFinite(n)) return;
                          setGaugeField(key, round1(clamp(n, 0, GAUGE_MAX_INSET_PCT)));
                        }}
                        onBlur={() =>
                          setGaugeDraft((d) => {
                            const rest = { ...d };
                            delete rest[key];
                            return rest;
                          })
                        }
                        className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </label>
                  ))}
                  <label className="text-xs text-gray-600">
                    <span>{t('scenarioPreview:ingameLayout.fillRadius')}</span>
                    <input
                      type="number"
                      step={1}
                      min={0}
                      value={fillRadiusPx}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        if (!isFinite(n)) return;
                        setGaugeField('gauge_fill_radius', Math.max(0, Math.round(n)));
                      }}
                      className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  </label>
                </div>

                {/* Preview-only: how full the gauge is drawn while calibrating. */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">
                    {t('scenarioPreview:ingameLayout.gaugeDemo', { percent: gaugeDemo })}
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={gaugeDemo}
                    onChange={(e) => setGaugeDemo(parseInt(e.target.value, 10))}
                    className="w-full accent-blue-600"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t('scenarioPreview:ingameLayout.gaugeDemoHint')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setGaugeField('gauge_fill_inset_left', '');
                    setGaugeField('gauge_fill_inset_right', '');
                    setGaugeField('gauge_fill_inset_y', '');
                    setGaugeField('gauge_fill_radius', '');
                    setGaugeDraft({});
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> {t('scenarioPreview:ingameLayout.resetDefaults')}
                </button>
              </>
            ) : mode === 'underlay' ? (
              <>
                <p className="text-[11px] text-gray-500 leading-snug">
                  {t('scenarioPreview:ingameLayout.underlayHelp')}
                </p>

                <label className="block text-xs text-gray-600">
                  <span>{t('scenarioPreview:ingameLayout.underlayScale')}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={gaugeDraft.enigma_underlay_scale ?? String(underlayScale)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setGaugeDraft((d) => ({ ...d, enigma_underlay_scale: raw }));
                      const n = parseFloat(raw);
                      if (!isFinite(n)) return;
                      setUnderlayScale(round1(clamp(n, UNDERLAY_MIN_PCT, UNDERLAY_MAX_PCT)));
                    }}
                    onBlur={() =>
                      setGaugeDraft((d) => {
                        const rest = { ...d };
                        delete rest.enigma_underlay_scale;
                        return rest;
                      })
                    }
                    className="mt-0.5 w-full px-2 py-1 border border-blue-300 rounded text-sm"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {(['x', 'y'] as const).map((axis) => {
                    const draftKey = `enigma_underlay_offset_${axis}`;
                    const current = underlayOffset[axis];
                    return (
                      <label key={axis} className="block text-xs text-gray-600">
                        <span>{t(`scenarioPreview:ingameLayout.underlayOffset_${axis}`)}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={gaugeDraft[draftKey] ?? String(current)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setGaugeDraft((d) => ({ ...d, [draftKey]: raw }));
                            const n = parseFloat(raw);
                            if (raw.trim() === '') { setOffset('underlay', axis, ''); return; }
                            if (!isFinite(n)) return;
                            setOffset('underlay', axis, round1(clamp(n, -OFFSET_MAX_PCT, OFFSET_MAX_PCT)));
                          }}
                          onBlur={() =>
                            setGaugeDraft((d) => {
                              const rest = { ...d };
                              delete rest[draftKey];
                              return rest;
                            })
                          }
                          className="mt-0.5 w-full px-2 py-1 border border-blue-300 rounded text-sm"
                        />
                      </label>
                    );
                  })}
                </div>

                <label className="block text-xs text-gray-600">
                  <span>{t('scenarioPreview:ingameLayout.imageScale')}</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={gaugeDraft.enigma_image_scale ?? String(imageScale)}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setGaugeDraft((d) => ({ ...d, enigma_image_scale: raw }));
                      const n = parseFloat(raw);
                      if (!isFinite(n)) return;
                      setImageScale(round1(clamp(n, UNDERLAY_MIN_PCT, UNDERLAY_MAX_PCT)));
                    }}
                    onBlur={() =>
                      setGaugeDraft((d) => {
                        const rest = { ...d };
                        delete rest.enigma_image_scale;
                        return rest;
                      })
                    }
                    className="mt-0.5 w-full px-2 py-1 border border-amber-300 rounded text-sm"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {(['x', 'y'] as const).map((axis) => {
                    const draftKey = `enigma_image_offset_${axis}`;
                    const current = imageOffset[axis];
                    return (
                      <label key={axis} className="block text-xs text-gray-600">
                        <span>{t(`scenarioPreview:ingameLayout.imageOffset_${axis}`)}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={gaugeDraft[draftKey] ?? String(current)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setGaugeDraft((d) => ({ ...d, [draftKey]: raw }));
                            const n = parseFloat(raw);
                            if (raw.trim() === '') { setOffset('image', axis, ''); return; }
                            if (!isFinite(n)) return;
                            setOffset('image', axis, round1(clamp(n, -OFFSET_MAX_PCT, OFFSET_MAX_PCT)));
                          }}
                          onBlur={() =>
                            setGaugeDraft((d) => {
                              const rest = { ...d };
                              delete rest[draftKey];
                              return rest;
                            })
                          }
                          className="mt-0.5 w-full px-2 py-1 border border-amber-300 rounded text-sm"
                        />
                      </label>
                    );
                  })}
                </div>

                <p className="text-[11px] text-gray-400 leading-snug">
                  {t('scenarioPreview:ingameLayout.underlayNote')}
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setUnderlayScale('');
                    setImageScale('');
                    setOffset('underlay', 'x', '');
                    setOffset('underlay', 'y', '');
                    setOffset('image', 'x', '');
                    setOffset('image', 'y', '');
                    setGaugeDraft({});
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> {t('scenarioPreview:ingameLayout.resetDefaults')}
                </button>
              </>
            ) : mode === 'ingame' ? (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">{t('scenarioPreview:ingameLayout.elements')}</p>
                  <div className="space-y-1">
                    {INGAME_ROLES.map((role) => (
                      <button
                        key={role.key}
                        type="button"
                        onClick={() => setSelected(role.key)}
                        className={`w-full text-left px-2.5 py-1.5 text-sm rounded border ${
                          selected === role.key
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {roleLabel(role.key)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected element controls */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-700">
                    {t('scenarioPreview:ingameLayout.alignmentLabel', { element: roleLabel(selected) })}
                  </p>
                  <div className="flex items-center gap-1">
                    {([
                      ['left', AlignLeft],
                      ['center', AlignCenter],
                      ['right', AlignRight],
                    ] as Array<[IngameAlign, typeof AlignLeft]>).map(([a, Icon]) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => updateBox(selected, { align: a })}
                        className={`p-1.5 rounded border ${
                          (sel.align ?? 'center') === a
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                        aria-label={t(`scenarioPreview:ingameLayout.align.${a}`)}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {(['left', 'top', 'width', 'height'] as const).map((field) => (
                      <label key={field} className="text-xs text-gray-600">
                        <span className="capitalize">{t(`scenarioPreview:ingameLayout.field.${field}`)}</span>
                        <input
                          type="number"
                          value={Math.round(sel[field])}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            if (!isFinite(n)) return;
                            updateBox(selected, { [field]: clamp(n, 0, 100) } as Partial<IngameBox>);
                          }}
                          className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-500 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 leading-snug">
                    <Trans
                      t={t}
                      i18nKey="scenarioPreview:ingameLayout.autoFitNote"
                      components={{ b: <strong /> }}
                    />
                  </p>
                </div>

                {/* Stress-test team name */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">{t('scenarioPreview:ingameLayout.previewTeamName')}</p>
                  <input
                    value={teamSample}
                    onChange={(e) => setTeamSample(e.target.value)}
                    placeholder={t('scenarioPreview:ingameLayout.teamNamePlaceholder')}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t('scenarioPreview:ingameLayout.teamNameHint')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setLayout(resolveIngameLayout(undefined))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> {t('scenarioPreview:ingameLayout.resetDefaults')}
                </button>
              </>
            ) : (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">{t('scenarioPreview:ingameLayout.elements')}</p>
                  <div className="space-y-1">
                    {IDLE_ROLES.map((role) => {
                      const el = idleLayout[role.key];
                      return (
                        <div
                          key={role.key}
                          className={`flex items-center gap-2 px-2.5 py-1.5 text-sm rounded border ${
                            selectedIdle === role.key
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={el.enabled}
                            onChange={(e) => updateIdle(role.key, { enabled: e.target.checked })}
                            className="w-4 h-4 accent-blue-600"
                            aria-label={t('scenarioPreview:ingameLayout.showElement', { element: idleRoleLabel(role.key) })}
                          />
                          <button
                            type="button"
                            onClick={() => setSelectedIdle(role.key)}
                            className={`flex-1 text-left ${
                              selectedIdle === role.key ? 'text-blue-700' : 'text-gray-700'
                            } ${el.enabled ? '' : 'opacity-50'}`}
                          >
                            {idleRoleLabel(role.key)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t('scenarioPreview:ingameLayout.idleTickHint')}
                  </p>
                </div>

                {/* Selected idle element controls */}
                {selIdle.enabled ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-700">
                      {t('scenarioPreview:ingameLayout.alignmentLabel', { element: idleRoleLabel(selectedIdle) })}
                    </p>
                    <div className="flex items-center gap-1">
                      {([
                        ['left', AlignLeft],
                        ['center', AlignCenter],
                        ['right', AlignRight],
                      ] as Array<[IngameAlign, typeof AlignLeft]>).map(([a, Icon]) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => updateIdle(selectedIdle, { align: a })}
                          className={`p-1.5 rounded border ${
                            (selIdle.align ?? 'center') === a
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                          aria-label={a}
                        >
                          <Icon className="w-4 h-4" />
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {(['left', 'top', 'width', 'height'] as const).map((field) => (
                        <label key={field} className="text-xs text-gray-600">
                          <span className="capitalize">{t(`scenarioPreview:ingameLayout.field.${field}`)}</span>
                          <input
                            type="number"
                            value={Math.round(selIdle[field])}
                            onChange={(e) => {
                              const n = parseFloat(e.target.value);
                              if (!isFinite(n)) return;
                              updateIdle(selectedIdle, { [field]: clamp(n, 0, 100) } as Partial<IdleElement>);
                            }}
                            className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        </label>
                      ))}
                    </div>

                    {/* Typography: size / color. The idle text always uses the
                        scenario font (same as the in-game HUD UI strings) - no
                        per-element font override. */}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs text-gray-600">
                        <span>{t('scenarioPreview:ingameLayout.fontSize')}</span>
                        <input
                          type="number"
                          min={1}
                          max={40}
                          step={0.5}
                          value={selIdle.fontSizePct ?? 5}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value);
                            if (!isFinite(n)) return;
                            updateIdle(selectedIdle, { fontSizePct: clamp(n, 1, 40) });
                          }}
                          className="mt-0.5 w-full px-2 py-1 border border-gray-300 rounded text-sm"
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        <span>{t('scenarioPreview:ingameLayout.color')}</span>
                        <input
                          type="color"
                          value={selIdle.color || overlayColor}
                          onChange={(e) => updateIdle(selectedIdle, { color: e.target.value })}
                          className="mt-0.5 w-full h-[34px] border border-gray-300 rounded"
                        />
                      </label>
                    </div>
                    {selIdle.color ? (
                      <button
                        type="button"
                        onClick={() => updateIdle(selectedIdle, { color: '' })}
                        className="text-[11px] text-blue-600 hover:underline"
                      >
                        {t('scenarioPreview:ingameLayout.useScenarioColor')}
                      </button>
                    ) : (
                      <p className="text-[11px] text-gray-400">{t('scenarioPreview:ingameLayout.inheritingColor')}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-400">
                    {t('scenarioPreview:ingameLayout.elementHidden', { element: idleRoleLabel(selectedIdle) })}
                  </p>
                )}

                {/* Preview subtitle text (the real text is set per-launch). */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">{t('scenarioPreview:ingameLayout.previewSubtitle')}</p>
                  <input
                    value={subtitleSample}
                    onChange={(e) => setSubtitleSample(e.target.value)}
                    placeholder={IDLE_SUBTITLE_SAMPLE}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t('scenarioPreview:ingameLayout.subtitleHint')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIdleLayout(resolveIdleLayout(undefined))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-700 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> {t('scenarioPreview:ingameLayout.resetDefaults')}
                </button>
              </>
            )}
          </div>

          {/* Canvas */}
          <div className="flex-1 min-w-0 bg-slate-900 relative" ref={wrapperRef}>
            {/* Real board/background backdrop (text overlays hidden) */}
            <div className="absolute inset-0 flex items-center justify-center">
              <MysteryPreviewRenderer
                gameMeta={backdropMeta}
                resolveMediaUrl={editor.getMediaUrl}
                readLocalized={(value) => getLocalized(value as never, lang, defaultLang)}
                enigmaView="revealed"
                gaugePercent={mode === 'gauge' ? gaugeDemo : 60}
                overscoreStage={0}
                selectedEnigmaIndex={0}
                screen={mode === 'idle' ? 'idle' : 'ingame'}
                canonicalWidth={CANON_W}
                canonicalHeight={CANON_H}
                lang={lang}
                defaultLang={defaultLang}
                hideIngameTextOverlays
                onEnigmaTileRect={mode === 'underlay' ? reportEnigmaTileRect : undefined}
              />
            </div>

            {/* Draggable boxes - centred stage matching the preview's. */}
            {stage.width > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: `${stage.width}px`,
                  height: `${stage.height}px`,
                }}
              >
                {mode === 'frames'
                  ? FRAME_EDIT_ROLES.map((role) => {
                      const key = role.key as IngameFrameKey;
                      const box = frames[key];
                      const isSel = selectedFrame === key;
                      return (
                        <div
                          key={role.key}
                          onPointerDown={(e) => startFrameDrag(e, key, 'move')}
                          style={{
                            position: 'absolute',
                            left: `${box.left}%`,
                            top: `${box.top}%`,
                            width: `${box.width}%`,
                            height: `${box.height}%`,
                            cursor: 'move',
                            outline: isSel ? '2px solid #3b82f6' : '1px dashed rgba(255,255,255,0.55)',
                            outlineOffset: '0px',
                            // No fill: the real frame image is drawn underneath
                            // by the backdrop renderer, and tinting it would
                            // defeat the point of placing it visually.
                            background: isSel ? 'rgba(59,130,246,0.10)' : 'transparent',
                            boxSizing: 'border-box',
                          }}
                        >
                          {/* Resize handle (bottom-right) */}
                          <div
                            onPointerDown={(e) => startFrameDrag(e, key, 'resize')}
                            style={{
                              position: 'absolute',
                              right: -6,
                              bottom: -6,
                              width: 12,
                              height: 12,
                              borderRadius: 2,
                              background: '#3b82f6',
                              border: '2px solid #fff',
                              cursor: 'nwse-resize',
                            }}
                          />
                          {/* Role label */}
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 'calc(100% + 2px)',
                              fontSize: 11,
                              lineHeight: '16px',
                              padding: '0 4px',
                              color: '#fff',
                              background: isSel ? '#3b82f6' : 'rgba(0,0,0,0.55)',
                              borderRadius: 3,
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                            }}
                          >
                            {roleLabel(role.key)}
                          </div>
                        </div>
                      );
                    })
                  : mode === 'gauge'
                  ? (() => {
                      // Handles on the gauge bar itself: the two vertical fill
                      // edges and the top/bottom inset (symmetric, so one
                      // handle drives both). The coloured fill under them is
                      // the real one, drawn by the backdrop renderer.
                      const barStyle: React.CSSProperties = {
                        position: 'absolute',
                        left: `${GAUGE_BAR_LEFT_PCT}%`,
                        top: `${GAUGE_BAR_TOP_PCT}%`,
                        width: `${GAUGE_BAR_WIDTH_PCT}%`,
                        height: `${GAUGE_BAR_HEIGHT_PCT}%`,
                      };
                      const handleBase: React.CSSProperties = {
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        width: 10,
                        marginLeft: -5,
                        cursor: 'ew-resize',
                        background: 'rgba(59,130,246,0.35)',
                        borderLeft: '2px solid #3b82f6',
                        borderRight: '2px solid #3b82f6',
                        boxSizing: 'border-box',
                        touchAction: 'none',
                      };
                      return (
                        <div style={{ ...barStyle, outline: '1px dashed rgba(255,255,255,0.55)' }}>
                          <div
                            onPointerDown={(e) => startGaugeDrag(e, 'left')}
                            title={t('scenarioPreview:ingameLayout.fillInsetLeft')}
                            style={{ ...handleBase, left: `${insetLeftPct}%` }}
                          />
                          <div
                            onPointerDown={(e) => startGaugeDrag(e, 'right')}
                            title={t('scenarioPreview:ingameLayout.fillInsetRight')}
                            style={{ ...handleBase, left: `${100 - insetRightPct}%` }}
                          />
                          <div
                            onPointerDown={(e) => startGaugeDrag(e, 'y')}
                            title={t('scenarioPreview:ingameLayout.fillInsetY')}
                            style={{
                              position: 'absolute',
                              left: `${insetLeftPct}%`,
                              right: `${insetRightPct}%`,
                              top: `${insetYPct}%`,
                              height: 8,
                              marginTop: -4,
                              cursor: 'ns-resize',
                              background: 'rgba(59,130,246,0.35)',
                              borderTop: '2px solid #3b82f6',
                              borderBottom: '2px solid #3b82f6',
                              boxSizing: 'border-box',
                              touchAction: 'none',
                            }}
                          />
                          {/* Mirror of the top inset - not draggable itself,
                              it just shows where the fill actually stops. */}
                          <div
                            style={{
                              position: 'absolute',
                              left: `${insetLeftPct}%`,
                              right: `${insetRightPct}%`,
                              bottom: `${insetYPct}%`,
                              height: 0,
                              borderTop: '2px dashed rgba(59,130,246,0.8)',
                              pointerEvents: 'none',
                            }}
                          />
                        </div>
                      );
                    })()
                  : mode === 'underlay'
                  ? (() => {
                      // Two handles, one per centred box inside the centre
                      // square: blue = the underlay (coloured sub-frame), amber
                      // = the image. The square's rectangle is MEASURED by the
                      // backdrop renderer rather than recomputed here, so this
                      // layer cannot drift from the board's flex layout the way
                      // the gauge constants above can.
                      if (!enigmaTileRect) return null;
                      const scaleBox = (
                        target: 'underlay' | 'image',
                        scale: number,
                        offset: MysteryBoxOffset,
                        color: string,
                        title: string,
                      ) => (
                        <div
                          style={{
                            ...mysteryCenteredBox(scale, offset),
                            outline: `2px ${target === 'image' ? 'dashed' : 'solid'} ${color}`,
                            outlineOffset: '-1px',
                            boxSizing: 'border-box',
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            onPointerDown={(e) => startScaleDrag(e, target)}
                            title={title}
                            style={{
                              position: 'absolute',
                              ...(target === 'image'
                                ? { left: -6, top: -6 }
                                : { right: -6, bottom: -6 }),
                              width: 12,
                              height: 12,
                              background: color,
                              border: '2px solid #ffffff',
                              cursor: 'nwse-resize',
                              pointerEvents: 'auto',
                              touchAction: 'none',
                            }}
                          />
                          {/* Move handle, on the corner the resize handle and
                              the label leave free (image: top-right, sub-frame:
                              bottom-left), so the two boxes stay grabbable even
                              when they are the same size. */}
                          <div
                            onPointerDown={(e) => startMoveDrag(e, target)}
                            title={t('scenarioPreview:ingameLayout.moveHandle', { name: title })}
                            style={{
                              position: 'absolute',
                              ...(target === 'image'
                                ? { right: -8, top: -8 }
                                : { left: -8, bottom: -8 }),
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              background: color,
                              border: '2px solid #ffffff',
                              cursor: 'move',
                              pointerEvents: 'auto',
                              touchAction: 'none',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              // Image label above the box (next to its handle),
                              // underlay label below it, so they never overlap.
                              ...(target === 'image'
                                ? { left: 10, bottom: 'calc(100% + 2px)' }
                                : { right: 0, top: 'calc(100% + 2px)' }),
                              fontSize: 11,
                              lineHeight: '16px',
                              padding: '0 4px',
                              color: '#fff',
                              background: color,
                              borderRadius: 3,
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                            }}
                          >
                            {title} · {scale} %
                          </div>
                        </div>
                      );
                      return (
                        <div
                          style={{
                            position: 'absolute',
                            left: `${enigmaTileRect.left}%`,
                            top: `${enigmaTileRect.top}%`,
                            width: `${enigmaTileRect.width}%`,
                            height: `${enigmaTileRect.height}%`,
                            pointerEvents: 'none',
                          }}
                        >
                          {scaleBox(
                            'underlay',
                            underlayScale,
                            underlayOffset,
                            '#3b82f6',
                            t('scenarioPreview:ingameLayout.underlayHandle'),
                          )}
                          {scaleBox(
                            'image',
                            imageScale,
                            imageOffset,
                            '#f59e0b',
                            t('scenarioPreview:ingameLayout.imageHandle'),
                          )}
                        </div>
                      );
                    })()
                  : mode === 'ingame'
                  ? INGAME_ROLES.map((role) => {
                      const box = layout[role.key];
                      const isSel = selected === role.key;
                      return (
                        <div
                          key={role.key}
                          onPointerDown={(e) => startDrag(e, role.key, 'move')}
                          style={{
                            position: 'absolute',
                            left: `${box.left}%`,
                            top: `${box.top}%`,
                            width: `${box.width}%`,
                            height: `${box.height}%`,
                            cursor: 'move',
                            outline: isSel ? '2px solid #3b82f6' : '1px dashed rgba(255,255,255,0.55)',
                            outlineOffset: '0px',
                            background: isSel ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.04)',
                            boxSizing: 'border-box',
                          }}
                        >
                          <MysteryLayoutBox
                            box={{ ...box, left: 0, top: 0, width: 100, height: 100 }}
                            stageWidth={(box.width / 100) * stage.width}
                            stageHeight={(box.height / 100) * stage.height}
                            text={textByRole[role.key]}
                            fontFamily={overlayFont}
                            color={overlayColor}
                          />
                          {/* Resize handle (bottom-right) */}
                          <div
                            onPointerDown={(e) => startDrag(e, role.key, 'resize')}
                            style={{
                              position: 'absolute',
                              right: -6,
                              bottom: -6,
                              width: 12,
                              height: 12,
                              borderRadius: 2,
                              background: '#3b82f6',
                              border: '2px solid #fff',
                              cursor: 'nwse-resize',
                            }}
                          />
                          {/* Role label */}
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 'calc(100% + 2px)',
                              fontSize: 11,
                              lineHeight: '16px',
                              padding: '0 4px',
                              color: '#fff',
                              background: isSel ? '#3b82f6' : 'rgba(0,0,0,0.55)',
                              borderRadius: 3,
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                            }}
                          >
                            {roleLabel(role.key)}
                          </div>
                        </div>
                      );
                    })
                  : IDLE_ROLES.map((role) => {
                      const el = idleLayout[role.key];
                      if (!el.enabled) return null;
                      const isSel = selectedIdle === role.key;
                      return (
                        <div
                          key={role.key}
                          onPointerDown={(e) => startIdleDrag(e, role.key, 'move')}
                          style={{
                            position: 'absolute',
                            left: `${el.left}%`,
                            top: `${el.top}%`,
                            width: `${el.width}%`,
                            height: `${el.height}%`,
                            cursor: 'move',
                            outline: isSel ? '2px solid #3b82f6' : '1px dashed rgba(255,255,255,0.55)',
                            outlineOffset: '0px',
                            background: isSel ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.04)',
                            boxSizing: 'border-box',
                          }}
                        >
                          <MysteryIdleBox
                            element={{ ...el, left: 0, top: 0, width: 100, height: 100 }}
                            stageHeight={stage.height}
                            text={idleTextByRole[role.key]}
                            fallbackFontFamily={overlayFont}
                            fallbackColor={overlayColor}
                            resolveFont={resolveFontFamily}
                          />
                          {/* Resize handle (bottom-right) */}
                          <div
                            onPointerDown={(e) => startIdleDrag(e, role.key, 'resize')}
                            style={{
                              position: 'absolute',
                              right: -6,
                              bottom: -6,
                              width: 12,
                              height: 12,
                              borderRadius: 2,
                              background: '#3b82f6',
                              border: '2px solid #fff',
                              cursor: 'nwse-resize',
                            }}
                          />
                          {/* Role label */}
                          <div
                            style={{
                              position: 'absolute',
                              left: 0,
                              top: 'calc(100% + 2px)',
                              fontSize: 11,
                              lineHeight: '16px',
                              padding: '0 4px',
                              color: '#fff',
                              background: isSel ? '#3b82f6' : 'rgba(0,0,0,0.55)',
                              borderRadius: 3,
                              whiteSpace: 'nowrap',
                              pointerEvents: 'none',
                            }}
                          >
                            {idleRoleLabel(role.key)}
                          </div>
                        </div>
                      );
                    })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
