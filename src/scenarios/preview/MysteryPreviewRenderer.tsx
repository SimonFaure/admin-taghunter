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
    const TARGET = 16 / 9;

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
  }, []);

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
              <div
                style={{
                  flex: 1,
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: overscoreImageUrl ? 'transparent' : 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  minHeight: 0,
                }}
              >
                {overscoreImageUrl ? (
                  <img
                    src={overscoreImageUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ fontSize: `${stage.height * 0.018}px`, opacity: 0.5 }}>
                    Overscore: none
                  </div>
                )}
              </div>
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
                        outline: idx === selectedEnigmaIndex ? '2px solid rgba(74,222,128,0.8)' : 'none',
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

          {/* Bottom: level gauge */}
          <div
            style={{
              position: 'relative',
              height: `${stage.height * 0.08}px`,
              marginTop: `${stage.height * 0.015}px`,
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              {gameMeta.levels_gauge_image && (
                <img
                  src={resolveMediaUrl(gameMeta.levels_gauge_image)}
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
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${Math.max(0, Math.min(100, gaugePercent))}%`,
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
                    objectFit: 'contain',
                    pointerEvents: 'none',
                  }}
                />
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
