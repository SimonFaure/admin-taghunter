/**
 * Shared XLSX round-trip + source-hash staleness for the translator workflow.
 *
 * Pure functions over plain data (no React/DOM beyond SheetJS), so the same
 * module can back both the bucket-2 admin Export/Import buttons and the bucket-1
 * CLI. English is the pivot/source; staleness is tracked per (key, lang) by
 * hashing the en source the translation was last made against.
 *
 * Design: plan `multilingual-app-translator-workflow.md` (step 2e).
 */

// `xlsx` (SheetJS) is heavy and only needed for the admin Export/Import action,
// so it is dynamically imported inside build/parse to keep it out of the main
// bundle chunk.
import { SUPPORTED_LANGS } from './languages';
import { INGAME_CATALOG, type IngameNamespace, type IngameStringDef } from './ingameCatalog';

/** key → lang → value */
export type NsValues = Record<string, Record<string, string>>;
/** key → lang → en-source-hash the translation was made against */
export type NsHashes = Record<string, Record<string, string>>;

export type CellStatus = 'ok' | 'new' | 'stale';

/** FNV-1a 32-bit, hex. Deterministic, dependency-free; not for security. */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The en source for a key: an admin override wins over the catalog seed. */
export function sourceEn(def: IngameStringDef, values: NsValues | undefined): string {
  return values?.[def.key]?.en ?? def.seed.en ?? '';
}

/** Per-cell status for a target language. en (the source) is never "stale". */
export function cellStatus(
  en: string,
  value: string | undefined,
  storedHash: string | undefined,
): CellStatus {
  if (!value) return 'new';
  if (storedHash && storedHash !== fnv1a(en)) return 'stale';
  if (!storedHash) return 'stale'; // never recorded against a known source
  return 'ok';
}

/** Target languages translators fill - the full player set minus the pivot. */
export const TARGET_LANGS: string[] = SUPPORTED_LANGS.filter((l) => l !== 'en');

const HEADER = ['key', 'context', 'char_limit', 'en', ...TARGET_LANGS, 'status'] as const;

/**
 * Build a workbook (one sheet per non-empty namespace) as an ArrayBuffer.
 * `values`/`hashes` are keyed by namespace; missing entries fall back to the
 * catalog seed (for en) and empty (for targets).
 */
export async function buildIngameWorkbook(
  values: Partial<Record<IngameNamespace, NsValues>>,
  hashes: Partial<Record<IngameNamespace, NsHashes>>,
): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const ns of Object.keys(INGAME_CATALOG) as IngameNamespace[]) {
    const defs = INGAME_CATALOG[ns];
    if (defs.length === 0) continue;
    const nsValues = values[ns];
    const nsHashes = hashes[ns];
    const rows: (string | number)[][] = [[...HEADER]];
    for (const def of defs) {
      const en = sourceEn(def, nsValues);
      const statusBits: string[] = [];
      const langCells = TARGET_LANGS.map((lang) => {
        const val = nsValues?.[def.key]?.[lang] ?? def.seed[lang] ?? '';
        const st = cellStatus(en, val || undefined, nsHashes?.[def.key]?.[lang]);
        if (st !== 'ok') statusBits.push(`${lang}:${st.toUpperCase()}`);
        return val;
      });
      rows.push([
        def.key,
        def.context,
        def.charLimit ?? '',
        en,
        ...langCells,
        statusBits.join(' '),
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, ns);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/**
 * Parse an uploaded workbook back into per-namespace values + restamped hashes.
 * For each non-empty target cell, the hash is stamped from the en value in the
 * SAME row (the source the translator saw). The `status` column is ignored.
 */
export async function parseIngameWorkbook(data: ArrayBuffer): Promise<{
  values: Partial<Record<IngameNamespace, NsValues>>;
  hashes: Partial<Record<IngameNamespace, NsHashes>>;
}> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(data, { type: 'array' });
  const values: Partial<Record<IngameNamespace, NsValues>> = {};
  const hashes: Partial<Record<IngameNamespace, NsHashes>> = {};

  for (const sheetName of wb.SheetNames) {
    if (!(sheetName in INGAME_CATALOG)) continue;
    const ns = sheetName as IngameNamespace;
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '' });
    if (aoa.length < 2) continue;
    const header = (aoa[0] as unknown[]).map((h) => String(h).trim());
    const colOf = (name: string) => header.indexOf(name);
    const keyCol = colOf('key');
    const enCol = colOf('en');
    if (keyCol < 0 || enCol < 0) continue;
    const langCols = TARGET_LANGS.map((l) => [l, colOf(l)] as const).filter(([, c]) => c >= 0);

    const nsValues: NsValues = {};
    const nsHashes: NsHashes = {};
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r] as (string | number)[];
      const key = String(row[keyCol] ?? '').trim();
      if (!key) continue;
      const en = String(row[enCol] ?? '').trim();
      const enHash = fnv1a(en);
      nsValues[key] = { en };
      for (const [lang, col] of langCols) {
        const val = String(row[col] ?? '').trim();
        if (!val) continue;
        nsValues[key][lang] = val;
        (nsHashes[key] ??= {})[lang] = enHash;
      }
    }
    values[ns] = nsValues;
    hashes[ns] = nsHashes;
  }
  return { values, hashes };
}
