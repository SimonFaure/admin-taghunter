import { parsePatternData, patternToMatrix } from './patternShapes';

// Everything the playground needs to import a pattern from a manual file upload
// (no cloud sync): identity + metadata + the routing rows.
export interface PatternExportMeta {
  name: string;
  game_type: string;
  version?: string | null;
  status?: string | null;
  pattern_uniqid?: string | null;
  pattern_slug?: string | null;
  description?: string | null;
  is_default?: boolean | number;
  pattern_data: string | null | undefined;
}

function safeName(name: string): string {
  return (name || 'pattern').replace(/[^a-z0-9_-]+/gi, '_');
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Ordered key/value metadata embedded in every downloaded pattern.
function metaPairs(meta: PatternExportMeta): Array<[string, string]> {
  return [
    ['name', meta.name ?? ''],
    ['game_type', meta.game_type ?? ''],
    ['version', meta.version != null ? String(meta.version) : ''],
    ['status', meta.status ?? ''],
    ['pattern_uniqid', meta.pattern_uniqid ?? ''],
    ['pattern_slug', meta.pattern_slug ?? ''],
    ['is_default', meta.is_default ? '1' : '0'],
    ['description', meta.description ?? ''],
  ];
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadPatternCsv(meta: PatternExportMeta) {
  const rows = parsePatternData(meta.pattern_data);
  const matrix = patternToMatrix(rows, meta.game_type);
  // Metadata as `#key,value` comment lines, a blank line, then the grid.
  const metaLines = metaPairs(meta).map(([k, v]) => `#${k},${csvCell(v)}`);
  const grid = matrix.map((r) => r.map(csvCell).join(','));
  const csv = [...metaLines, '', ...grid].join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safeName(meta.name)}.csv`);
}

export async function downloadPatternXlsx(meta: PatternExportMeta) {
  const XLSX = await import('xlsx');
  const rows = parsePatternData(meta.pattern_data);
  const matrix = patternToMatrix(rows, meta.game_type);

  // Two sheets: "meta" (key/value metadata) and "pattern" (the routing grid).
  const metaWs = XLSX.utils.aoa_to_sheet(metaPairs(meta));
  const gridWs = XLSX.utils.aoa_to_sheet(matrix);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, metaWs, 'meta');
  XLSX.utils.book_append_sheet(wb, gridWs, 'pattern');

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  downloadBlob(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${safeName(meta.name)}.xlsx`
  );
}
