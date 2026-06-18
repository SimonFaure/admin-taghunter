// Built-in default mission-report layout per game type — studio copy, kept in
// step with backend/utils/ReportLayouts.php::defaultLayout and the playground's
// services/reportLayout.ts. Used to seed a per-scenario override when the
// operator first enables a custom layout.

import type { ReportLayout, ReportBlock } from './api';

export const STAT_FIELDS_BY_TYPE: Record<string, string[]> = {
  mystery: ['rate', 'success', 'fail', 'absent'],
  tracks: ['rate', 'correct', 'wrong', 'missing'],
  tagquest: ['quests', 'points', 'level', 'combos'],
  clash: ['territories', 'combos'],
};

const BASE_FONT = 'Times New Roman';

/** Narrow an unknown game_meta value to a valid ReportLayout. */
export function isReportLayout(value: unknown): value is ReportLayout {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ReportLayout>;
  return Array.isArray(v.blocks) && typeof v.font === 'string';
}

export function normalizeReportGameType(raw: string): keyof typeof STAT_FIELDS_BY_TYPE {
  const v = (raw || '').toLowerCase();
  return v === 'mystery' || v === 'tracks' || v === 'tagquest' || v === 'clash' ? v : 'tagquest';
}

/** A bordered "frame" box wrapping the given stat grids (refined-classic look). */
function statFrame(children: ReportBlock[]): ReportBlock {
  return { type: 'frame', show: true, bordered: true, borderColor: '#333333', padding: 12, radius: 6, children };
}

export function defaultReportLayout(gameType: string): ReportLayout {
  const type = normalizeReportGameType(gameType);
  const fields = STAT_FIELDS_BY_TYPE[type];
  const firstRow = fields.slice(0, 2);
  const restRow = fields.slice(2);

  // Refined-classic structure: centered header, a divider rule, the team
  // identity, then the stats inside a bordered frame.
  const blocks: ReportBlock[] = [
    { type: 'logo', show: true, align: 'center', logoSize: 110 },
    { type: 'game_title', show: true, size: 30, align: 'center', bold: false },
    { type: 'pdf_title', show: true, size: 18, align: 'center', bold: false },
    { type: 'divider', show: true, thickness: 1, width: 70, color: '#cccccc' },
    { type: 'team_name', show: true, size: 22, align: 'center', bold: true },
    { type: 'date', show: true, size: 18, align: 'center', bold: true },
  ];
  // Mystery, tagquest and clash print the team's elapsed time; tracks omits it.
  if (type !== 'tracks') {
    blocks.push({ type: 'duration', show: true, size: 16, align: 'center', bold: true });
  }
  if (type === 'tracks' || type === 'mystery') {
    const grids: ReportBlock[] = [{ type: 'stat_grid', show: true, fields: firstRow, size: 16, align: 'center' }];
    if (restRow.length) grids.push({ type: 'stat_grid', show: true, fields: restRow, size: 16, align: 'center' });
    blocks.push(statFrame(grids));
  } else {
    blocks.push(statFrame([{ type: 'stat_grid', show: true, fields, size: 16, align: 'center' }]));
  }

  return { version: 1, font: BASE_FONT, background: { mode: 'none' }, blocks, pdfTitle: '', teamTitle: '' };
}
