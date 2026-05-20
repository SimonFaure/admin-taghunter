/**
 * Tagquest preview renderer — renders the new single-template HUD using the
 * canonical `defaultTagquestLayout` as the source of truth.
 *
 * Background fills the viewport via cover. The HUD lives inside a 16:9
 * "stage" centered in the wrapper (letterbox/pillarbox on non-16:9 wrappers).
 * Template overlay + text/image elements position relative to the stage.
 *
 * The same layout JSON is upserted into MySQL `layouts` by
 * `tagquest_default_layout_migration.sql` and synced down to the playground
 * runtime — so positions are guaranteed to match in-game.
 */

import { useEffect, useRef, useState } from 'react';
import { defaultTagquestLayout, type LayoutElementInput } from '../bodies/tagquest/defaultLayout';
import { MOCK_TEAM_STRIP, buildAdvancementForQuests } from './mockGameState';
import { resolveAdminLabel, type PreviewLabels, type PreviewLabelsMap } from './previewLabels';
import type { Lang } from '../i18n/types';
import { resolveFontFamily } from '../../fonts/resolveFontFamily';
import { registerStudioCustomFonts } from '../../fonts/registerStudioCustomFonts';
import type { CustomFont } from '../../types/scenario-data';

type Localized = Record<string, string>;

const DEFAULT_TEMPLATE_URL = '/default_templates/tagquest_template.png';

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
}: TagquestPreviewRendererProps) {
  const fitWrapperRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Scenario-wide font (Typography section). Overrides every layout element's
  // own fontFamily so the preview matches the in-game playground behaviour.
  const scenarioFontFamily = resolveFontFamily(gameMeta.font);

  // Register the scenario's uploaded custom fonts so the preview renders them.
  useEffect(() => {
    registerStudioCustomFonts(gameMeta.custom_fonts, resolveMediaUrl);
  }, [gameMeta.custom_fonts, resolveMediaUrl]);

  // Compute the 16:9 stage box that fits the wrapper, centered.
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
          {defaultTagquestLayout.elements.map((el, idx) => {
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
                return (
                  <div key={`${el.id}-${idx}`} style={{ ...styleBase, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {questView === 'pieces' && activeQuest && (
                      <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                        {(['image_1', 'image_2', 'image_3', 'image_4'] as const).map((k) => {
                          const f = activeQuest[k];
                          return (
                            <div key={k} style={{
                              width: '100%',
                              height: '100%',
                              background: f ? `center/cover no-repeat url(${resolveMediaUrl(f)})` : 'rgba(255,255,255,0.08)',
                            }} />
                          );
                        })}
                      </div>
                    )}
                    {questView === 'revealed' && activeQuest && activeQuest.main_image && (
                      <img
                        src={resolveMediaUrl(activeQuest.main_image)}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '2px solid rgba(74,222,128,0.6)' }}
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
              return (
                <div key={`${el.id}-${idx}`} style={{ ...styleBase, display: visible ? 'block' : 'none' }}>
                  {src ? (
                    <img src={src} alt={el.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : null}
                </div>
              );
            }

            // text
            const { show, text } = textForElement(el);
            if (!show) return null;
            // fontSize is a fixed pixel value defined in defaultLayout.ts —
            // no adaptive scaling against stage or element height.
            const fontSizePx = el.fontSize;
            return (
              <div
                key={`${el.id}-${idx}`}
                style={{
                  ...styleBase,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: fontSizePx ? `${fontSizePx}px` : undefined,
                  fontFamily: scenarioFontFamily || el.fontFamily,
                  color: el.color,
                  textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {text}
              </div>
            );
          })}
        </div>
      )}

      {/* Localized labels — currently unused; kept in the surface to preserve
          the modal's label-injection API. */}
      <span style={{ display: 'none' }}>{labels.ptsSuffix}</span>
    </div>
  );
}
