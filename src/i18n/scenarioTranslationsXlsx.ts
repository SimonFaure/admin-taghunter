/**
 * XLSX serializer for scenario translations - the same columns as the CSV.
 *
 * `xlsx` (SheetJS) is heavy and only needed when someone actually clicks
 * Export/Import, so it is dynamically imported inside each function to stay out
 * of the main bundle chunk - the same rule `translatorXlsx.ts` follows.
 *
 * Plan: C:\Users\faure\.claude\plans\here-is-a-translation-transient-boot.md
 */

import type { Lang } from '../scenarios/i18n/types';
import type { ScenarioTransRow, TargetType, TradType } from './scenarioTranslationRows';
import { buildHeader, FIXED_PREFIX } from './scenarioTranslationsCsv';

const SHEET_NAME = 'translations';
const TRAD_TYPES: TradType[] = ['field', 'file title', 'text'];

export interface XlsxOptions {
  langs: readonly Lang[];
  statusOf?: (row: ScenarioTransRow) => string;
}

export async function toXlsx(
  rows: ScenarioTransRow[],
  opts: XlsxOptions,
): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const aoa: (string | number)[][] = [buildHeader(opts.langs)];

  for (const row of rows) {
    aoa.push([
      row.scenarioUniqid,
      row.gameType,
      row.scenarioName,
      row.target,
      row.targetType,
      row.tradType,
      ...opts.langs.map((l) => row.values[l] ?? ''),
      row.rowId,
      opts.statusOf ? opts.statusOf(row) : '',
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Give the translator's working columns a usable width; the source and target
  // language cells hold paragraphs, not labels.
  ws['!cols'] = [
    ...FIXED_PREFIX.map(() => ({ wch: 16 })),
    ...opts.langs.map(() => ({ wch: 48 })),
    { wch: 22 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export async function fromXlsx(
  data: ArrayBuffer,
  langs: readonly Lang[],
): Promise<ScenarioTransRow[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(data, { type: 'array' });

  // Prefer our own sheet name, but accept whatever the translator saved it as.
  const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
  if (!sheetName) return [];

  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '' });
  if (aoa.length < 2) return [];

  const header = (aoa[0] as unknown[]).map((h) => String(h).trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());

  const cUniqid = col('scenario_uniqid');
  const cGameType = col('game type');
  const cName = col('scenario name');
  const cTarget = col('target');
  const cTargetType = col('target type');
  const cTradType = col('Trad type');
  const cRowId = col('row_id');
  if (cTarget < 0 || cTradType < 0) return [];

  const langCols = langs
    .map((l) => [l, header.indexOf(l.toLowerCase())] as const)
    .filter(([, c]) => c >= 0);

  const out: ScenarioTransRow[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const cells = aoa[r] as (string | number)[];
    if (!cells) continue;
    const at = (index: number) => (index >= 0 ? String(cells[index] ?? '') : '');

    const tradTypeRaw = at(cTradType).trim().toLowerCase();
    const tradType = TRAD_TYPES.find((t) => t === tradTypeRaw);
    if (!tradType) continue;

    const values: Partial<Record<Lang, string>> = {};
    for (const [lang, index] of langCols) {
      // Not trimmed: a `story` cell's authored whitespace is content.
      const raw = cells[index];
      const str = raw === undefined || raw === null ? '' : String(raw);
      if (str !== '') values[lang] = str;
    }

    const targetTypeRaw = at(cTargetType).trim();
    const targetType: TargetType = targetTypeRaw.toLowerCase() === 'scenario' ? 'scenario' : 'PDF';

    out.push({
      scenarioUniqid: at(cUniqid).trim(),
      gameType: at(cGameType).trim(),
      scenarioName: at(cName).trim(),
      target: at(cTarget).trim(),
      targetType,
      tradType,
      rowId: at(cRowId).trim(),
      values,
      hashes: {},
      sourceReadOnly: tradType === 'field',
    });
  }
  return out;
}
