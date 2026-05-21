/**
 * Mystery preview renderer — single 16:9 main-game screen with the canonical
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

type Localized = Record<string, string>;

export type EnigmaView = 'locked' | 'revealed';
export type MysteryScreen = 'instructions' | 'ingame' | 'endgame';

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
  font?: string;
  font_color?: string;
  level_font_color?: string;
  points_units?: string;
  score_full_game?: string;
  enigmas?: Enigma[];
  overscores?: Overscore[];
  levels?: Record<string, { points?: string; name?: Localized | string; description?: Localized | string }>;
  custom_fonts?: CustomFont[];
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
  /** Canonical viewport — drives the stage aspect ratio. */
  canonicalWidth: number;
  canonicalHeight: number;
  /** Active editor language (for admin label resolution). */
  lang: Lang;
  defaultLang: Lang;
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
}: MysteryPreviewRendererProps) {
  const fitWrapperRef = useRef<HTMLDivElement>(null);
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

  const pointsUnits = gameMeta.points_units ?? 'points';
  const scoreFullGame = gameMeta.score_full_game ?? '100';

  // Gauge geometry — shared by the gradient bar, level icons, and player
  // icon so they stay perfectly aligned. The inset keeps icons at 0%/100%
  // inside the gauge frame instead of overflowing the gauge image edges.
  const gaugeBarHeight = stage.height * 0.08;
  const gaugeIconHeight = gaugeBarHeight - 14; // same as gradient bar height
  const gaugeInset = gaugeIconHeight / 2 + 8;
  const gaugeInsetPx = `${gaugeInset}px`;
  const gaugeDoubleInsetPx = `${gaugeInset * 2}px`;

  const cardStyle: React.CSSProperties = {
    width: '100%',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: gameMeta.font_color || '#ffffff',
    textShadow: '0 1px 4px rgba(0,0,0,0.7)',
  };

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
          {/* Top 3-column row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr 1fr',
              gap: `${stage.width * 0.015}px`,
              flex: 1,
              minHeight: 0,
            }}
          >
            {/* Left column: timer, score, overscore image */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: `${stage.height * 0.02}px` }}>
              <div style={{ ...cardStyle, aspectRatio: '4 / 1' }}>
                {gameMeta.time_background_image && (
                  <img
                    src={resolveMediaUrl(gameMeta.time_background_image)}
                    alt=""
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
                <div style={{ position: 'relative', fontSize: `${stage.height * 0.045}px`, fontWeight: 'bold' }}>
                  {MOCK_MYSTERY_STATE.timer}
                </div>
              </div>

              <div style={{ ...cardStyle, aspectRatio: '4 / 1' }}>
                {gameMeta.score_background_image && (
                  <img
                    src={resolveMediaUrl(gameMeta.score_background_image)}
                    alt=""
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
                <div style={{ position: 'relative', fontSize: `${stage.height * 0.045}px`, fontWeight: 'bold' }}>
                  {MOCK_MYSTERY_STATE.score}
                  {pointsUnits === 'percentage' ? '%' : `/${scoreFullGame}`}
                </div>
              </div>

              {/* Overscore display — shown when the modal selects a stage. */}
              {overscoreImageUrl && (
                <div
                  style={{
                    flex: 1,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 0,
                  }}
                >
                  <img
                    src={overscoreImageUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>
              )}
            </div>

            {/* Center column: ONE big enigma — text on top, image below. */}
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
                    <div
                      style={{
                        fontSize: `${stage.height * 0.05}px`,
                        fontWeight: 'bold',
                        textAlign: 'center',
                        textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                        padding: `0 ${stage.width * 0.01}px`,
                        flexShrink: 0,
                      }}
                    >
                      {text}
                    </div>
                    <div
                      style={{
                        flex: '1 1 0',
                        width: '100%',
                        minHeight: 0,
                        position: 'relative',
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 12,
                        overflow: 'hidden',
                      }}
                    >
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
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Right column: team name + enigmas header + recap grid */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: `${stage.height * 0.012}px`, minHeight: 0 }}>
              <div style={{ ...cardStyle, aspectRatio: '4 / 1' }}>
                {gameMeta.team_name_background_image && (
                  <img
                    src={resolveMediaUrl(gameMeta.team_name_background_image)}
                    alt=""
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
                <div style={{ position: 'relative', fontSize: `${stage.height * 0.04}px`, fontWeight: 'bold' }}>
                  {MOCK_MYSTERY_STATE.teamName}
                </div>
              </div>

              {gameMeta.enigmas_header_image && (
                <div style={{ ...cardStyle, aspectRatio: '5 / 1' }}>
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
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      {imgSrc && (
                        <img
                          src={imgSrc}
                          alt=""
                          className={enigmaView === 'locked' ? 'mystery-preview-blur' : ''}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

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
            <div style={{ position: 'relative', width: '100%', height: `${stage.height * 0.08}px` }}>
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
                  left: gaugeInsetPx,
                  top: 7,
                  bottom: 7,
                  width: `calc((100% - ${gaugeDoubleInsetPx}) * ${Math.max(0, Math.min(100, gaugePercent)) / 100})`,
                  background: gameMeta.gauge_filling || 'linear-gradient(90deg, #ffc700 0%, #fee300 100%)',
                  opacity: 0.85,
                  borderRadius: 6,
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

              {/* Level markers — one icon + name per entry in gameMeta.levels,
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
                const iconHeight = gaugeIconHeight;
                const fontSize = stage.height * 0.018;
                const barHeight = stage.height * 0.012;
                const labelOffset = iconHeight / 2 + barHeight;
                const levelTextColor = gameMeta.level_font_color || '#ffffff';
                const entries = Object.entries(gameMeta.levels ?? {});
                // Emit each marker as 3 sibling elements (icon, bar, label).
                // No nested 0×0 wrapper — some browsers refuse to render
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
                  const leftCalc = `calc(${gaugeInsetPx} + (100% - ${gaugeDoubleInsetPx}) * ${fraction})`;

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

              {/* Player icon — follows the gauge fill (trailing edge of
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
                      left: `calc(${gaugeInsetPx} + (100% - ${gaugeDoubleInsetPx}) * ${fraction})`,
                      top: 7,
                      height: 'calc(100% - 14px)',
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
          </>
          )}

          {screen === 'instructions' && (() => {
            const buttonImg = gameMeta.game_instructions_button_image
              ? resolveMediaUrl(gameMeta.game_instructions_button_image)
              : '';
            const buttonHoverImg = gameMeta.game_instructions_button_hover_image
              ? resolveMediaUrl(gameMeta.game_instructions_button_hover_image)
              : '';
            const instrImg = gameMeta.game_instructions_image
              ? resolveMediaUrl(gameMeta.game_instructions_image)
              : '';
            return (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {instrImg && (
                  <img
                    src={instrImg}
                    alt=""
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                )}
                {(buttonImg || buttonHoverImg) && (
                  <div
                    className="mystery-preview-instructions-button"
                    style={{
                      position: 'absolute',
                      bottom: `${stage.height * 0.05}px`,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: `${stage.height * 0.18}px`,
                      height: `${stage.height * 0.18}px`,
                    }}
                  >
                    {buttonImg && (
                      <img
                        src={buttonImg}
                        alt="start"
                        className="mystery-preview-button-default"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    )}
                    {buttonHoverImg && (
                      <img
                        src={buttonHoverImg}
                        alt="start"
                        className="mystery-preview-button-hover"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0 }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
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
            const scoreDisplay = pointsUnits === 'percentage'
              ? `${Math.round(currentScore)}%`
              : `${Math.round(currentScore)} / ${scoreFullGame}`;
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
