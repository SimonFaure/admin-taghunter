/**
 * CSV serializer for scenario translations.
 *
 * All semantics live in `scenarioTranslationRows.ts`; this file only moves rows
 * in and out of a delimited text file.
 *
 * Two things that look like details and are not:
 *
 *  - Values are NOT trimmed. The bucket-2 workbook parser trims every cell,
 *    which is right for short UI labels and wrong here: a scenario `story` is
 *    multi-paragraph and its leading/trailing whitespace is authored. Only
 *    structural cells (headers, target, row_id) are trimmed.
 *  - Nothing is regex-rewritten. `%team%`, `%TEAM%`, `{team}`, `%count%` and
 *    friends are part of the runtime contract and must survive byte-for-byte,
 *    so the placeholder normalisation used for in-game text is NOT applied.
 *
 * Plan: C:\Users\faure\.claude\plans\here-is-a-translation-transient-boot.md
 */

import type { Lang } from '../scenarios/i18n/types';
import type { ScenarioTransRow, TargetType, TradType } from './scenarioTranslationRows';

/** Excel (FR locale especially) needs a BOM to read UTF-8, and CRLF endings. */
const BOM = '\uFEFF';

export const FIXED_PREFIX = [
  'scenario_uniqid',
  'game type',
  'scenario name',
  'target',
  'target type',
  'Trad type',
] as const;

export const FIXED_SUFFIX = ['row_id', 'status'] as const;

export function buildHeader(langs: readonly Lang[]): string[] {
  return [...FIXED_PREFIX, ...langs.map((l) => l.toUpperCase()), ...FIXED_SUFFIX];
}

/** Per-row translator status, mirroring the in-game sheet's convention. */
export function statusCell(
  row: ScenarioTransRow,
  langs: readonly Lang[],
  sourceLang: Lang,
  cellStatus: (source: string, value: string | undefined, hash: string | undefined) => string,
): string {
  const source = row.values[sourceLang] ?? '';
  const bits: string[] = [];
  for (const lang of langs) {
    if (lang === sourceLang) continue;
    const st = cellStatus(source, row.values[lang] || undefined, row.hashes[lang]);
    if (st !== 'ok') bits.push(`${lang}:${st.toUpperCase()}`);
  }
  return bits.join(' ');
}

function escapeCell(value: string): string {
  // Quote whenever the value could otherwise break the row or the delimiter
  // sniffer: quotes, both delimiters, and any newline.
  if (/["\r\n,;\t]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface CsvOptions {
  langs: readonly Lang[];
  sourceLang: Lang;
  delimiter?: string;
  statusOf?: (row: ScenarioTransRow) => string;
}

export function toCsv(rows: ScenarioTransRow[], opts: CsvOptions): string {
  const delimiter = opts.delimiter ?? ',';
  const lines: string[] = [buildHeader(opts.langs).map(escapeCell).join(delimiter)];

  for (const row of rows) {
    const cells = [
      row.scenarioUniqid,
      row.gameType,
      row.scenarioName,
      row.target,
      row.targetType,
      row.tradType,
      ...opts.langs.map((l) => row.values[l] ?? ''),
      row.rowId,
      opts.statusOf ? opts.statusOf(row) : '',
    ];
    lines.push(cells.map((c) => escapeCell(String(c ?? ''))).join(delimiter));
  }

  return BOM + lines.join('\r\n') + '\r\n';
}

/**
 * A real RFC-4180 reader: quoted fields may contain the delimiter, newlines and
 * doubled quotes. `split(',')` corrupts every multi-paragraph `story` cell, so
 * it is not an option.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      // Swallow CR; the LF (or a lone CR) ends the record.
      if (src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Guess the delimiter from the header line: whichever appears most. */
export function sniffDelimiter(text: string): string {
  const firstLine = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/)[0] ?? '';
  const counts: Record<string, number> = {
    ',': (firstLine.match(/,/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ',';
}

const TRAD_TYPES: TradType[] = ['field', 'file title', 'text'];

/**
 * Parse a sheet back into rows. Column positions are read from the header, not
 * assumed, so a translator may reorder or drop columns. `status` is ignored.
 */
export function fromCsv(text: string, langs: readonly Lang[]): ScenarioTransRow[] {
  const delimiter = sniffDelimiter(text);
  const table = parseDelimited(text, delimiter);
  if (table.length < 2) return [];

  const header = table[0].map((h) => h.trim().toLowerCase());
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
    .map((l) => [l, header.indexOf(l.toUpperCase().toLowerCase())] as const)
    .filter(([, c]) => c >= 0);

  const out: ScenarioTransRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (!cells || cells.every((c) => c.trim() === '')) continue;

    const at = (index: number) => (index >= 0 ? (cells[index] ?? '') : '');
    const tradTypeRaw = at(cTradType).trim().toLowerCase();
    const tradType = TRAD_TYPES.find((t) => t === tradTypeRaw);
    if (!tradType) continue;

    const values: Partial<Record<Lang, string>> = {};
    for (const [lang, index] of langCols) {
      const raw = cells[index];
      // Structural cells are trimmed; VALUES are not - see the header note.
      if (raw !== undefined && raw !== '') values[lang] = raw;
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
