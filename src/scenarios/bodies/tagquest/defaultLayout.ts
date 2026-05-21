/**
 * Default Tagquest GameLayout — CANONICAL source of truth for the in-game HUD.
 *
 * - Positions are percentages of the template's intrinsic 16:9 box (NOT the
 *   viewport). The runtime computes the largest 16:9 rectangle that fits in
 *   the viewport and positions all elements relative to that.
 * - Sentinel filenames are resolved at render time:
 *     '@background'        → scenario gameMeta.background_image
 *     '@default'           → bundled default template PNG
 *     '@template'          → gameMeta.custom_template if use_default_template === false,
 *                            else the bundled default
 *     '@malus_image'       → scenario gameMeta.malus_image
 *     '@late_malus_image'  → scenario gameMeta.late_malus_image
 *     '@quest_main_image_N' → quest at index N-1's `main_image`
 *
 * Two mirrors must move in lockstep with this file — when you change positions,
 * ids, or fontSize values here, update both of these too:
 *   1. backend/database/tagquest_default_layout_migration.sql (the `JSON_OBJECT(...)`
 *      payload upserted into the MySQL `layouts` table — what playgrounds sync from).
 *   2. ../../../../../../taghunter_playground/src/scenarios/tagquest/defaultLayout.json
 *      (bundled fallback the playground loads when SQLite is empty or stale —
 *      `version` field must be bumped together with this file's `version`).
 *
 * Position values are first-pass approximations against the default template
 * artwork (5692×3200). Fine-tune against the PNG.
 */

/**
 * Numeric dimensions are interpreted as percent of the 16:9 stage box.
 * String values pass straight through as CSS keywords:
 *   - `'auto'` on an image lets the browser derive width from height (or
 *     vice versa) while preserving the intrinsic aspect ratio.
 *   - `'auto'` or `'fit-content'` on a text element makes the box hug its
 *     content. When `height` is a non-numeric keyword, `fontSize` is
 *     interpreted as % of the stage height (since there is no fixed
 *     element height to scale against).
 *   - Other CSS sizing keywords (`'min-content'`, `'max-content'`, etc.)
 *     are also accepted and passed through verbatim.
 */
export type Dim = number | 'auto' | 'fit-content' | 'min-content' | 'max-content';

export interface LayoutElementInput {
  id: string;
  type: 'image' | 'text';
  name: string;
  x: number;
  y: number;
  width: Dim;
  height: Dim;
  filename?: string;
  previewText?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  hidden?: boolean;
}

export interface DefaultLayout {
  version: string;
  background: string;        // sentinel '@background' resolved at runtime
  elements: LayoutElementInput[];
}

const FONT = 'Arial Black, Arial, sans-serif';
const TEXT_COLOR = '#000000ff';
export const TEXT_COLOR_TITLE = '#ffffff';

// ── Quest rows on the right side ────────────────────────────────────────────
// 6 quest rows stacked vertically between Y≈14% and Y≈98% of the template.
// Each row has 3 cells: icon | multiplicator | points.
const QUEST_ROW_TOP = 22.4;       // % y of first row
const QUEST_ROW_HEIGHT = 12.5;  // % height of each row block
const QUEST_ROW_GAP = 0.65;      // % vertical gap between rows
const QUEST_COL_X = {
  icon: 83.8,
  multiplicator: 88.9,
  points: 94,
};
const QUEST_CELL_WIDTH = 3.6;
const QUEST_CELL_HEIGHT = 6;

function questElements(): LayoutElementInput[] {
  const out: LayoutElementInput[] = [];
  for (let i = 1; i <= 6; i++) {
    const y = QUEST_ROW_TOP + (i - 1) * (QUEST_ROW_HEIGHT + QUEST_ROW_GAP) + 2;
    out.push({
      id: `quest_${i}_name`,
      type: 'text',
      name: `Quest ${i} Name`,
      previewText: `Quest ${i}`,
      x: 83.6,
      y: y - 4.5,
      width: 14,
      height: 2.8,
      fontSize: 11,
      fontFamily: FONT,
      color: TEXT_COLOR,
    });
    out.push({
      id: `quest_${i}_icon`,
      type: 'image',
      name: `Quest ${i} Icon`,
      filename: `@quest_main_image_${i}`,
      x: QUEST_COL_X.icon,
      y,
      width: QUEST_CELL_WIDTH,
      height: QUEST_CELL_HEIGHT,
    });
    out.push({
      id: `quest_${i}_multiplicator`,
      type: 'text',
      name: `Quest ${i} Multiplicator`,
      previewText: 'x0',
      x: QUEST_COL_X.multiplicator,
      y,
      width: QUEST_CELL_WIDTH,
      height: QUEST_CELL_HEIGHT,
      fontSize: 25,
      fontFamily: FONT,
      color: TEXT_COLOR,
    });
    out.push({
      id: `quest_${i}_points`,
      type: 'text',
      name: `Quest ${i} Points`,
      previewText: '0',
      x: QUEST_COL_X.points,
      y,
      width: QUEST_CELL_WIDTH,
      height: QUEST_CELL_HEIGHT,
      fontSize: 25,
      fontFamily: FONT,
      color: TEXT_COLOR,
    });
  }
  return out;
}

export const defaultTagquestLayout: DefaultLayout = {
  version: '3.1',
  background: '@background',
  elements: [
    // ── Template overlay (covers the whole 16:9 box, on top of background) ──
    {
      id: 'tagquest_template',
      type: 'image',
      name: 'Tagquest Template (overlay)',
      filename: '@template',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    },

    // ── Pieces / quest animation area (center) ──────────────────────────────
    {
      id: 'animation_quest_image',
      type: 'image',
      name: 'Quest Pieces Grid',
      x: 32,
      y: 18,
      width: 40,
      height: 60,
      fontSize: 8,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'animation_quest_name',
      type: 'text',
      name: 'Active Quest Name',
      previewText: 'Quest 1',
      x: 32,
      y: 78.5,
      width: 40,
      height: 4,
      fontSize: 18,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },

    // ── Top row ─────────────────────────────────────────────────────────────
    {
      id: 'timer',
      type: 'text',
      name: 'Timer',
      previewText: '00:00:00',
      x: 2.5,
      y: 5.6,
      width: 19,
      height: 8,
      fontSize: 44,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'team_name_text',
      type: 'text',
      name: 'Team Name',
      previewText: 'TEAM 1',
      x: 34,
      y: 4,
      width: 36,
      height: 6,
      fontSize: 37,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'score_label',
      type: 'text',
      name: 'Score Label',
      previewText: 'SCORE',
      x: 88.1,
      y: 11.9,
      width: 5,
      height: 3,
      fontSize: 12,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'score',
      type: 'text',
      name: 'Score',
      previewText: '0',
      x: 86.6,
      y: 4.9,
      width: 8,
      height: 6,
      fontSize: 41,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },

    // ── Malus block (3 cells: icon, multiplicator, points) ─────────────────
    {
      id: 'malus_label',
      type: 'text',
      name: 'Malus Label',
      previewText: 'MALUS',
      x: 6,
      y: 21.3,
      width: 12,
      height: 3,
      fontSize: 12,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'malus_icon',
      type: 'image',
      name: 'Malus Icon',
      filename: '@malus_image',
      x: 5.6,
      y: 29,
      width: 'auto',
      height: 5.8,
    },
    {
      id: 'malus_multiplicator',
      type: 'text',
      name: 'Malus Multiplicator',
      previewText: 'x0',
      x: 10.2,
           y: 29,
      width: 3.4,
   height: 5.8,
      fontSize: 21.21,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'malus_points',
      type: 'text',
      name: 'Malus Points',
      previewText: '0',
      x: 15.1,
           y: 29,
      width: 3.4,
      height: 5.8,
      fontSize: 21.21,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },

    // ── Late malus block ───────────────────────────────────────────────────
    {
      id: 'late_malus_label',
      type: 'text',
      name: 'Late Malus Label',
      previewText: 'LATE MALUS',
      x: 6,
      y: 46,
      width: 12,
      height: 3,
      fontSize: 12,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'late_malus_icon',
      type: 'image',
      name: 'Late Malus Icon',
      filename: '@late_malus_image',
      x: 5.5,
      y: 53.8,
      width: 'auto',
      height: 5.8,
    },
    {
      id: 'late_malus_multiplicator',
      type: 'text',
      name: 'Late Malus Multiplicator',
      previewText: 'x0',
       x: 10.2,
   y: 53.8,
      width: 3.4,
      height: 5.8,
      fontSize: 20.21,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'late_malus_points',
      type: 'text',
      name: 'Late Malus Points',
      previewText: '0',
      x: 15.1,
y: 53.8,
      width: 3.4,
       height: 5.8,
      fontSize: 20.21,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },

    // ── Combo block: 3 columns × 3 rows ────────────────────────────────────
    {
      id: 'combo_points_label',
      type: 'text',
      name: 'Combo Points Label',
      previewText: 'COMBO POINTS',
      x: 7,
      y: 72.8,
      width: 10,
      height: 3,
      fontSize: 12,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    // Column 1: combo 6
    {
      id: 'combo_6_title',
      type: 'text',
      name: 'Combo 6 Title',
      previewText: 'COMBO 6',
      x: 3.6,
      y: 77.6,
      width: 5,
      height: 4,
      fontSize: 11,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'combo_6_multiplicator',
      type: 'text',
      name: 'Combo 6 Multiplicator',
      previewText: 'x0',
      x: 3.6,
      y: 80.8,
      width: 5,
      height: 7,
      fontSize: 25,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'combo_6_points',
      type: 'text',
      name: 'Combo 6 Points',
      previewText: '0',
      x: 3.6,
      y: 87.9,
      width: 5,
      height: 7,
     fontSize: 31,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    // Column 2: combo 4
    {
      id: 'combo_4_title',
      type: 'text',
      name: 'Combo 4 Title',
      previewText: 'COMBO 4',
      x: 7.5,
      y: 77.6,
      width: 9,
      height: 4,
        fontSize: 11,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'combo_4_multiplicator',
      type: 'text',
      name: 'Combo 4 Multiplicator',
      previewText: 'x0',
  x: 7.5,
       y: 80.8,
      width: 9,
      height: 7,
       fontSize: 25,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'combo_4_points',
      type: 'text',
      name: 'Combo 4 Points',
      previewText: '0',
    x: 7.5,
  y: 87.9,
      width: 9,
      height: 7,
     fontSize: 31,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    // Column 3: combo 2
    {
      id: 'combo_2_title',
      type: 'text',
      name: 'Combo 2 Title',
      previewText: 'COMBO 2',
      x: 13.4,
      y: 77.6,
      width: 9,
      height: 4,
      fontSize: 11,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'combo_2_multiplicator',
      type: 'text',
      name: 'Combo 2 Multiplicator',
      previewText: 'x0',
     x: 13.4,
       y: 80.8,
      width: 9,
      height: 7,
      fontSize: 25,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },
    {
      id: 'combo_2_points',
      type: 'text',
      name: 'Combo 2 Points',
      previewText: '0',
     x: 13.4,
    y: 87.9,
      width: 9,
      height: 7,
       fontSize: 31,
      fontFamily: FONT,
      color: TEXT_COLOR,
    },

    // ── Quest rows ──────────────────────────────────────────────────────────
    ...questElements(),
  ],
};
