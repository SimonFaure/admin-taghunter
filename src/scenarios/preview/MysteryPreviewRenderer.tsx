/**
 * Mystery preview renderer - single 16:9 main-game screen with the canonical
 * 3-column layout (timer+score | enigmas grid | team-name+recap) and a level
 * gauge along the bottom edge.
 *
 * Mirrors `MysteryGamePage.tsx` enigmas-grid markup without orchestrating a
 * runtime: blur class is controlled by the `enigmaView` prop instead of the
 * `completedEnigmas` set, and the gauge fill % is driven by `gaugePercent`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from '../i18n/types';
import { resolveFontFamily } from '../../fonts/resolveFontFamily';
import { registerStudioCustomFonts } from '../../fonts/registerStudioCustomFonts';
import type { CustomFont, Enigma, Overscore } from '../../types/scenario-data';
import { MOCK_MYSTERY_STATE } from './mockMysteryState';
import {
  IDLE_ROLES,
  INGAME_ROLES,
  MYSTERY_STATUS_NEUTRAL,
  MysteryFixedFrames,
  MysteryIdleBox,
  MysteryLayoutBox,
  MysteryStatusPlate,
  resolveIdleLayout,
  resolveIngameLayout,
  resolveMysteryBonusBox,
  resolveMysteryGaugeGeometry,
  resolveMysteryStatusFrame,
  resolveMysteryUnderlayScale,
  type IdleLayout,
  type IngameFrames,
  type IngameLayout,
  type IngameRoleKey,
} from './mysteryIngameLayout';

type Localized = Record<string, string>;

export type EnigmaView = 'locked' | 'revealed';
export type MysteryScreen = 'ingame' | 'endgame' | 'idle';

/** Mock subtitle shown for the idle 'subtitle' element in the studio preview/
 *  layout editor (the real text is a per-launch field in the playground). */
export const IDLE_SUBTITLE_SAMPLE = 'Centre Aéré des Collines';

export interface PreviewMysteryGameMeta {
  background_image?: string;
  team_name_background_image?: string;
  time_background_image?: string;
  score_background_image?: string;
  steps_container_image?: string;
  enigmas_header_image?: string;
  levels_gauge_image?: string;
  levels_gauge_image_with_content?: string;
  levels_gauge_player_icon_image?: string;
  levels_gauge_level_icon_image?: string;
  gauge_filling?: string;
  /** Author-tunable gauge fill geometry (see resolveMysteryGaugeGeometry). */
  gauge_fill_inset_left?: string;
  gauge_fill_inset_right?: string;
  gauge_fill_inset_y?: string;
  gauge_fill_radius?: string;
  /** Author-tunable result sub-frame (see resolveMysteryStatusFrame). */
  status_frame_scale?: string;
  status_frame_radius?: string;
  status_frame_over_image?: string;
  /** Size of the main-image underlay (see resolveMysteryUnderlayScale). */
  enigma_underlay_scale?: string;
  game_refresh_button_image?: string;
  game_refresh_button_hover_image?: string;
  font?: string;
  font_color?: string;
  level_font_color?: string;
  points_units?: string;
  score_full_game?: string;
  enigmas?: Enigma[];
  overscores?: Overscore[];
  levels?: Record<string, { points?: string; name?: Localized | string; description?: Localized | string }>;
  custom_fonts?: CustomFont[];
  /** Author-placed positions for the 4 in-game text roles. Absent → defaults. */
  ingame_layout?: IngameLayout;
  /** Author-placed rectangles for the timer/score/team-name frame images.
   *  Absent → the historical fixed positions. */
  ingame_frames?: IngameFrames;
  /** Author-placed styled title/subtitle for the idle (between-teams) screen. */
  idle_layout?: IdleLayout;
  [key: string]: unknown;
}

export interface MysteryPreviewRendererProps {
  gameMeta: PreviewMysteryGameMeta;
  resolveMediaUrl: (filename: string) => string;
  readLocalized: (value: Localized | string | undefined) => string;
  enigmaView: EnigmaView;
  gaugePercent: number;
  /** 0 = none; 1+ = the index into overscores[] (1-based). */
  overscoreStage: number;
  /** Which enigma to feature in the center column (0-based). */
  selectedEnigmaIndex: number;
  /** Which screen of the game flow to render. */
  screen: MysteryScreen;
  /** Canonical viewport - drives the stage aspect ratio. */
  canonicalWidth: number;
  canonicalHeight: number;
  /** Active editor language (for admin label resolution). */
  lang: Lang;
  defaultLang: Lang;
  /** When true, the 4 in-game text overlays are NOT drawn - the in-game layout
   *  editor uses this so the preview is a clean backdrop under its own
   *  draggable boxes. */
  hideIngameTextOverlays?: boolean;
  /** Verdict tint painted on the enigma tiles, so the author can size the result
   *  sub-frame against their own artwork (retour #85). Empty ⇒ the neutral
   *  plate, i.e. an enigma no one has answered yet. */
  statusColor?: string;
  /**
   * Reports where the centre enigma tile lands, as percentages of the stage.
   *
   * The in-game layout editor needs that rectangle to hang a drag handle on the
   * main-image underlay, and the tile is positioned by this file's flex layout -
   * not by a stored box. Measuring and reporting it beats mirroring the layout
   * in constants on the editor side (which is what the gauge handles had to do,
   * and which their own comment flags as a sync hazard).
   *
   * Must be a STABLE callback - it is an effect dependency here.
   */
  onEnigmaTileRect?: (rect: EnigmaTileRect | null) => void;
}

/** Rectangle of the centre enigma tile, in % of the stage box. */
export interface EnigmaTileRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function MysteryPreviewRenderer({
  gameMeta,
  resolveMediaUrl,
  readLocalized,
  enigmaView,
  gaugePercent,
  overscoreStage,
  selectedEnigmaIndex,
  screen,
  canonicalWidth,
  canonicalHeight,
  hideIngameTextOverlays,
  statusColor,
  onEnigmaTileRect,
}: MysteryPreviewRendererProps) {
  const fitWrapperRef = useRef<HTMLDivElement>(null);
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const enigmaTileRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const scenarioFontFamily = resolveFontFamily(gameMeta.font);

  useEffect(() => {
    registerStudioCustomFonts(gameMeta.custom_fonts, resolveMediaUrl);
  }, [gameMeta.custom_fonts, resolveMediaUrl]);

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

  const backgroundUrl = gameMeta.background_image ? resolveMediaUrl(gameMeta.background_image) : '';
  const enigmas = useMemo(() => gameMeta.enigmas ?? [], [gameMeta.enigmas]);
  const overscores = gameMeta.overscores ?? [];
  const activeOverscore = overscoreStage > 0 ? overscores[overscoreStage - 1] : undefined;
  const overscoreImageUrl =
    activeOverscore?.image_overscore_step
      ? resolveMediaUrl(activeOverscore.image_overscore_step)
      : '';
  // The "empty bonus" plate sits under the tier images and is visible from the
  // first second of the game - the preview showed neither it nor the tier
  // artwork before (retour #34).
  const emptyBonusUrl = gameMeta.steps_container_image
    ? resolveMediaUrl(gameMeta.steps_container_image)
    : '';
  // Where the bonus plate sits - author-placed like the element frames, default
  // = the board grid's left cell (its former fixed home).
  const bonusBox = resolveMysteryBonusBox(gameMeta.ingame_frames);

  const pointsUnits = gameMeta.points_units ?? 'points';
  const scoreFullGame = gameMeta.score_full_game ?? '100';

  // Gauge geometry - shared by the gradient bar, level icons, and player
  // icon so they stay perfectly aligned, and tunable per scenario via the
  // gauge_fill_* fields (retour #31).
  const gauge = resolveMysteryGaugeGeometry(gameMeta, stage.height);

  // Result sub-frame geometry - the same resolver the playground board uses, so
  // the size/rounding an author sets here is what the postes de jeu draw
  // (retours #83 + #85).
  const statusFrame = resolveMysteryStatusFrame(gameMeta);

  // Size of the square underlay the centre enigma image sits on. Same resolver
  // the playground board uses, so the size an author sets here is the one the
  // postes de jeu draw - except that the board never PAINTS the neutral
  // underlay, while the preview does so the author can see what they size.
  const underlayScale = resolveMysteryUnderlayScale(gameMeta);

  // Measure the centre tile for the layout editor's underlay handle. Observing
  // both the stage and the tile covers every way the rectangle can move: the
  // modal resizing, and the author changing the scale.
  useEffect(() => {
    if (!onEnigmaTileRect) return;
    const report = () => {
      const stageEl = stageBoxRef.current;
      const tileEl = enigmaTileRef.current;
      if (!stageEl || !tileEl) {
        onEnigmaTileRect(null);
        return;
      }
      const sr = stageEl.getBoundingClientRect();
      const tr = tileEl.getBoundingClientRect();
      if (sr.width <= 0 || sr.height <= 0) {
        onEnigmaTileRect(null);
        return;
      }
      onEnigmaTileRect({
        left: ((tr.left - sr.left) / sr.width) * 100,
        top: ((tr.top - sr.top) / sr.height) * 100,
        width: (tr.width / sr.width) * 100,
        height: (tr.height / sr.height) * 100,
      });
    };
    report();
    const ro = new ResizeObserver(report);
    if (stageBoxRef.current) ro.observe(stageBoxRef.current);
    if (enigmaTileRef.current) ro.observe(enigmaTileRef.current);
    return () => ro.disconnect();
  }, [onEnigmaTileRect, stage.width, stage.height, underlayScale, screen, selectedEnigmaIndex]);

  return (
    <div
      ref={fitWrapperRef}
      className="mystery-preview-scope"
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

      {stage.width > 0 && (
        <div
          ref={stageBoxRef}
          style={{
            position: 'relative',
            width: `${stage.width}px`,
            height: `${stage.height}px`,
            fontFamily: scenarioFontFamily || 'Arial Black, Arial, sans-serif',
            color: gameMeta.font_color || '#ffffff',
            padding: `${stage.height * 0.02}px ${stage.width * 0.02}px`,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {screen === 'ingame' && (
          <>
          {/* Top band reserved for the title elements (enigma name centre, team
              name right, timer/score left). The board below starts under them:
              enigma image under the enigma title, recap list under the team
              title. */}
          <div style={{ height: `${stage.height * 0.12}px`, flexShrink: 0 }} />

          {/* Board row: centre = enigma image (under enigma title),
              right = recap list (under team title). */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr 1fr',
              gap: `${stage.width * 0.015}px`,
              flex: 1,
              minHeight: 0,
            }}
          >
            {/* Left column: an empty spacer. The bonus plate that used to live
                here is now an author-placed overlay (drawn after the board,
                below) - the cell stays so the centre enigma image and the right
                recap keep their fixed positions. */}
            <div />

            {/* Center column: ONE big enigma - text on top, image below. */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: `${stage.height * 0.02}px`,
                overflow: 'hidden',
                minHeight: 0,
              }}
            >
              {(() => {
                const enigma = enigmas[selectedEnigmaIndex];
                if (!enigma) {
                  return (
                    <div style={{ fontSize: `${stage.height * 0.025}px`, opacity: 0.5, textAlign: 'center' }}>
                      No enigma to preview
                    </div>
                  );
                }
                const imgSrc = enigma.good_answer_image ? resolveMediaUrl(enigma.good_answer_image) : '';
                const text =
                  readLocalized(enigma.text as Localized | string | undefined) ||
                  `Enigma ${enigma.number ?? selectedEnigmaIndex + 1}`;
                return (
                  <>
                    {/* Enigma name is now an author-placed overlay (below); the
                        centre column shows only the featured image. */}
                    {/* Flexible area centring a SQUARE tile, exactly like the
                        playground board - so the result sub-frame an author
                        sizes here is the one the postes de jeu draw. */}
                    <div
                      style={{
                        flex: '1 1 0',
                        width: '100%',
                        minHeight: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <div
                        ref={enigmaTileRef}
                        style={{
                          position: 'relative',
                          height: `${underlayScale}%`,
                          aspectRatio: '1 / 1',
                          maxWidth: `${underlayScale}%`,
                          overflow: 'hidden',
                          // Authoring aid: the neutral plate alone is a 6 % white
                          // wash, too faint to judge a size against. Outline the
                          // underlay while it has no verdict colour of its own.
                          outline: statusColor ? undefined : '1px dashed rgba(255,255,255,0.35)',
                          outlineOffset: '-1px',
                        }}
                      >
                        {/* The underlay. In-game the neutral (no-verdict) layer
                            is not painted at all - no white slab behind the
                            artwork - but the preview always paints it so the
                            author can see the box `enigma_underlay_scale`
                            sizes. */}
                        <MysteryStatusPlate
                          color={statusColor || MYSTERY_STATUS_NEUTRAL}
                          frame={statusFrame}
                          legacyRadius={12}
                        />
                        {imgSrc && (
                          <img
                            src={imgSrc}
                            alt={text}
                            className={enigmaView === 'locked' ? 'mystery-preview-blur' : ''}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                            }}
                          />
                        )}
                        {statusColor && (
                          <MysteryStatusPlate
                            color={statusColor}
                            frame={statusFrame}
                            legacyRadius={12}
                            over
                          />
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Right column: enigmas header + recap grid. Team name is now an
                author-placed overlay (see below). */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: `${stage.height * 0.012}px`, minHeight: 0 }}>
              {gameMeta.enigmas_header_image && (
                <div style={{ width: '100%', position: 'relative', aspectRatio: '5 / 1' }}>
                  <img
                    src={resolveMediaUrl(gameMeta.enigmas_header_image)}
                    alt=""
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
              )}

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: `${stage.height * 0.008}px`,
                  flex: 1,
                  alignContent: 'start',
                  overflow: 'hidden',
                }}
              >
                {enigmas.map((enigma, idx) => {
                  const imgSrc = enigma.good_answer_image ? resolveMediaUrl(enigma.good_answer_image) : '';
                  return (
                    <div
                      key={`recap-${enigma.number ?? idx}`}
                      style={{
                        width: '100%',
                        aspectRatio: '1 / 1',
                        position: 'relative',
                        overflow: 'hidden',
                      }}
                    >
                      <MysteryStatusPlate
                        color={statusColor || MYSTERY_STATUS_NEUTRAL}
                        frame={statusFrame}
                        legacyRadius={4}
                      />
                      {imgSrc && (
                        <img
                          src={imgSrc}
                          alt=""
                          className={enigmaView === 'locked' ? 'mystery-preview-blur' : ''}
                          style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                      )}
                      {statusColor && (
                        <MysteryStatusPlate
                          color={statusColor}
                          frame={statusFrame}
                          legacyRadius={4}
                          over
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* The bonus plate, placed by the author (ingame_frames.bonus,
              default = the board's left cell). The empty-bonus image is on
              screen permanently; each overscore tier REPLACES what is showing
              rather than stacking next to it (legacy
              `.team_bonus_container_empty` + absolutely-stacked
              `.team_bonus_container`). The modal's stage selector picks which
              tier is on top. Absolutely positioned over the stage, so moving or
              resizing it never disturbs the board columns. */}
          {(emptyBonusUrl || overscoreImageUrl) && (
            <div
              style={{
                position: 'absolute',
                left: `${bonusBox.left}%`,
                top: `${bonusBox.top}%`,
                width: `${bonusBox.width}%`,
                height: `${bonusBox.height}%`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              {emptyBonusUrl && (
                <img
                  src={emptyBonusUrl}
                  alt=""
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                />
              )}
              {overscoreImageUrl && (
                <img
                  src={overscoreImageUrl}
                  alt=""
                  style={{
                    // Same share of the plate the playground gives a tier image
                    // (37 %), centred - the preview used to stretch it over the
                    // whole cell, which is not what a poste de jeu draws.
                    position: 'relative',
                    maxWidth: '100%',
                    maxHeight: '37%',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                  }}
                />
              )}
            </div>
          )}

          {/* Bottom: level gauge. The outer wrapper is taller than the gauge
              bar itself so level icons + labels that stick out above/below
              the bar stay visible without clipping. The inner div IS the
              gauge bar (where the frame, gradient, icons are positioned). */}
          <div
            style={{
              position: 'relative',
              height: `${stage.height * 0.18}px`,
              marginTop: `${stage.height * 0.01}px`,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ position: 'relative', width: '100%', height: `${gauge.barHeight}px` }}>
              {gameMeta.levels_gauge_image && (
                <img
                  src={resolveMediaUrl(gameMeta.levels_gauge_image)}
                  alt=""
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                  }}
                />
              )}
              <div
                style={{
                  position: 'absolute',
                  left: gauge.insetLeft,
                  top: gauge.insetY,
                  height: gauge.trackHeight,
                  width: gauge.trackWidth(Math.max(0, Math.min(100, gaugePercent)) / 100),
                  background: gameMeta.gauge_filling || 'linear-gradient(90deg, #ffc700 0%, #fee300 100%)',
                  opacity: 0.85,
                  borderRadius: gauge.radius,
                }}
              />
              {gameMeta.levels_gauge_image_with_content && (
                <img
                  src={resolveMediaUrl(gameMeta.levels_gauge_image_with_content)}
                  alt=""
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'fill',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Level markers - one icon + name per entry in gameMeta.levels,
                  positioned by level.points / score_full_game. Names alternate
                  top/bottom (1st on top, 2nd on bottom, …) to avoid overlap. */}
              {(() => {
                const fullGame = parseFloat(scoreFullGame) || 0;
                if (fullGame <= 0) return null;
                const iconUrl = gameMeta.levels_gauge_level_icon_image
                  ? resolveMediaUrl(gameMeta.levels_gauge_level_icon_image)
                  : '';
                // Same as gradient bar height + same inset, so 0%/100% icons
                // sit just inside the gauge frame instead of overflowing.
                const iconHeight = gauge.iconHeight;
                const fontSize = stage.height * 0.018;
                const barHeight = stage.height * 0.012;
                const labelOffset = iconHeight / 2 + barHeight;
                const levelTextColor = gameMeta.level_font_color || '#ffffff';
                const entries = Object.entries(gameMeta.levels ?? {});
                // Emit each marker as 3 sibling elements (icon, bar, label).
                // No nested 0×0 wrapper - some browsers refuse to render
                // absolutely-positioned children of a collapsed parent.
                const nodes: React.ReactNode[] = [];
                entries.forEach(([key, level], idx) => {
                  const pts = parseFloat(level?.points ?? '0') || 0;
                  const clamped = Math.max(0, Math.min(fullGame, pts));
                  const fraction = clamped / fullGame;
                  const isTop = idx % 2 === 0;
                  const name = level?.name
                    ? readLocalized(level.name as Localized | string | undefined)
                    : '';
                  const leftCalc = gauge.trackLeft(fraction);

                  // Icon (or fallback dot)
                  if (iconUrl) {
                    nodes.push(
                      <img
                        key={`lvl-icon-${key}`}
                        src={iconUrl}
                        alt=""
                        style={{
                          position: 'absolute',
                          left: leftCalc,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          height: `${iconHeight}px`,
                          width: 'auto',
                          pointerEvents: 'none',
                          zIndex: 2,
                        }}
                      />,
                    );
                  } else {
                    nodes.push(
                      <div
                        key={`lvl-dot-${key}`}
                        style={{
                          position: 'absolute',
                          left: leftCalc,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          width: `${iconHeight}px`,
                          height: `${iconHeight}px`,
                          borderRadius: '50%',
                          background: levelTextColor,
                          opacity: 0.85,
                          pointerEvents: 'none',
                          zIndex: 2,
                        }}
                      />,
                    );
                  }

                  if (name) {
                    // Connector bar
                    nodes.push(
                      <div
                        key={`lvl-bar-${key}`}
                        style={{
                          position: 'absolute',
                          left: leftCalc,
                          top: isTop
                            ? `calc(50% - ${iconHeight / 2 + barHeight}px)`
                            : `calc(50% + ${iconHeight / 2}px)`,
                          width: 2,
                          height: `${barHeight}px`,
                          transform: 'translateX(-50%)',
                          background: levelTextColor,
                          opacity: 0.9,
                          pointerEvents: 'none',
                          zIndex: 2,
                        }}
                      />,
                    );
                    // Label
                    nodes.push(
                      <div
                        key={`lvl-label-${key}`}
                        style={{
                          position: 'absolute',
                          left: leftCalc,
                          top: isTop
                            ? `calc(50% - ${labelOffset + fontSize * 1.1}px)`
                            : `calc(50% + ${labelOffset}px)`,
                          transform: 'translateX(-50%)',
                          fontSize: `${fontSize}px`,
                          whiteSpace: 'nowrap',
                          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                          color: levelTextColor,
                          lineHeight: 1.1,
                          pointerEvents: 'none',
                          zIndex: 2,
                        }}
                      >
                        {name}
                      </div>,
                    );
                  }
                });
                return nodes;
              })()}

              {/* Player icon - follows the gauge fill (trailing edge of
                  gradient). Height matches the gradient bar (gauge container
                  height minus 14px top+bottom inset). */}
              {gameMeta.levels_gauge_player_icon_image && (() => {
                const fraction = Math.max(0, Math.min(100, gaugePercent)) / 100;
                return (
                  <img
                    src={resolveMediaUrl(gameMeta.levels_gauge_player_icon_image)}
                    alt=""
                    style={{
                      position: 'absolute',
                      left: gauge.trackLeft(fraction),
                      top: gauge.insetY,
                      height: gauge.trackHeight,
                      width: 'auto',
                      transform: 'translateX(-50%)',
                      pointerEvents: 'none',
                      zIndex: 3,
                    }}
                  />
                );
              })()}
            </div>
          </div>

          {/* Element frame images, drawn behind the author-placed text at the
              rectangles stored in `ingame_frames`. Shown even when text overlays
              are hidden (the in-game layout editor uses this as its backdrop). */}
          {(() => {
            const frameUrls: Partial<Record<IngameRoleKey, string>> = {};
            for (const role of INGAME_ROLES) {
              const file = role.frameImageKey
                ? (gameMeta[role.frameImageKey] as string | undefined)
                : undefined;
              if (file) frameUrls[role.key] = resolveMediaUrl(file);
            }
            return <MysteryFixedFrames frameUrls={frameUrls} frames={gameMeta.ingame_frames} />;
          })()}

          {/* Author-placed text overlays - the 4 in-game roles positioned via
              game_meta.ingame_layout, each auto-fitting its box. */}
          {!hideIngameTextOverlays && (() => {
            const layout = resolveIngameLayout(gameMeta.ingame_layout);
            const overlayFont = scenarioFontFamily || 'Arial Black, Arial, sans-serif';
            const overlayColor = gameMeta.font_color || '#ffffff';
            const featured = enigmas[selectedEnigmaIndex];
            const enigmaName = featured
              ? readLocalized(featured.text as Localized | string | undefined) ||
                `Enigma ${featured.number ?? selectedEnigmaIndex + 1}`
              : '';
            // In points mode the board shows the bare score - NOT "60/100". The
            // playground has never drawn the "sur X" half (MysteryGamePage
            // .formatScore); the preview did, so an author sized the score box
            // for a string the postes de jeu never render.
            const scoreText = `${MOCK_MYSTERY_STATE.score}${pointsUnits === 'percentage' ? '%' : ''}`;
            const textByRole: Record<string, string> = {
              enigma_name: enigmaName,
              timer: MOCK_MYSTERY_STATE.timer,
              score: scoreText,
              team_name: MOCK_MYSTERY_STATE.teamName,
            };
            return INGAME_ROLES.map((role) => (
              <MysteryLayoutBox
                key={role.key}
                box={layout[role.key]}
                stageWidth={stage.width}
                stageHeight={stage.height}
                text={textByRole[role.key]}
                fontFamily={overlayFont}
                color={overlayColor}
              />
            ));
          })()}
          </>
          )}

          {/* Idle screen - background only (drawn at the root) plus the enabled
              author-placed title/subtitle. The layout editor passes
              `hideIngameTextOverlays` so its draggable copies sit alone on top. */}
          {screen === 'idle' && !hideIngameTextOverlays && (() => {
            const idle = resolveIdleLayout(gameMeta.idle_layout);
            const fallbackFont = scenarioFontFamily || 'Arial Black, Arial, sans-serif';
            const fallbackColor = gameMeta.font_color || '#ffffff';
            const scenarioTitle = readLocalized(gameMeta.title as Localized | string | undefined) || '';
            const textByRole: Record<string, string> = {
              title: scenarioTitle,
              subtitle: IDLE_SUBTITLE_SAMPLE,
            };
            return IDLE_ROLES.map((role) => {
              const el = idle[role.key];
              if (!el.enabled) return null;
              return (
                <MysteryIdleBox
                  key={role.key}
                  element={el}
                  stageHeight={stage.height}
                  text={textByRole[role.key]}
                  fallbackFontFamily={fallbackFont}
                  fallbackColor={fallbackColor}
                  resolveFont={resolveFontFamily}
                />
              );
            });
          })()}

          {screen === 'endgame' && (() => {
            const fullGameNum = parseFloat(scoreFullGame) || 100;
            const currentScore = (Math.max(0, Math.min(100, gaugePercent)) / 100) * fullGameNum;
            // Highest level whose points threshold is ≤ currentScore.
            let reachedLevel: { points?: string; name?: Localized | string; description?: Localized | string } | null = null;
            let reachedPts = -Infinity;
            for (const lvl of Object.values(gameMeta.levels ?? {})) {
              const pts = parseFloat(lvl?.points ?? '0') || 0;
              if (pts <= currentScore && pts > reachedPts) {
                reachedLevel = lvl;
                reachedPts = pts;
              }
            }
            const levelName = reachedLevel?.name
              ? readLocalized(reachedLevel.name as Localized | string | undefined)
              : '';
            const levelDesc = reachedLevel?.description
              ? readLocalized(reachedLevel.description as Localized | string | undefined)
              : '';
            const refreshImg = gameMeta.game_refresh_button_image
              ? resolveMediaUrl(gameMeta.game_refresh_button_image)
              : '';
            const refreshHoverImg = gameMeta.game_refresh_button_hover_image
              ? resolveMediaUrl(gameMeta.game_refresh_button_hover_image)
              : '';
            // Bare score in points mode, like the in-game board and like the
            // playground's own end screen (MysteryGamePage.finalScoreText).
            const scoreDisplay = pointsUnits === 'percentage'
              ? `${Math.round(currentScore)}%`
              : `${Math.round(currentScore)}`;
            return (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: `${stage.height * 0.025}px`,
                  textAlign: 'center',
                  padding: `${stage.height * 0.04}px ${stage.width * 0.06}px`,
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                }}
              >
                <div style={{ fontSize: `${stage.height * 0.04}px`, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                  Your final score:
                </div>
                <div
                  style={{
                    fontSize: `${stage.height * 0.12}px`,
                    fontWeight: 'bold',
                    color: '#4ade80',
                    textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                    lineHeight: 1,
                  }}
                >
                  {scoreDisplay}
                </div>
                {levelName && (
                  <div
                    style={{
                      fontSize: `${stage.height * 0.045}px`,
                      fontWeight: 'bold',
                      color: gameMeta.level_font_color || '#ffffff',
                      textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                    }}
                  >
                    {levelName}
                  </div>
                )}
                {levelDesc && (
                  <div
                    style={{
                      fontSize: `${stage.height * 0.022}px`,
                      maxWidth: `${stage.width * 0.7}px`,
                      lineHeight: 1.3,
                      textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                      opacity: 0.95,
                    }}
                  >
                    {levelDesc}
                  </div>
                )}
                {(refreshImg || refreshHoverImg) && (
                  <div
                    className="mystery-preview-instructions-button"
                    style={{
                      position: 'relative',
                      width: `${stage.height * 0.14}px`,
                      height: `${stage.height * 0.14}px`,
                      marginTop: `${stage.height * 0.02}px`,
                    }}
                  >
                    {refreshImg && (
                      <img
                        src={refreshImg}
                        alt="refresh"
                        className="mystery-preview-button-default"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    )}
                    {refreshHoverImg && (
                      <img
                        src={refreshHoverImg}
                        alt="refresh"
                        className="mystery-preview-button-hover"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0 }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}
