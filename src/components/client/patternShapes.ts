// Per-game-type pattern shapes for the client pattern builder.
//
// A pattern is an ordered list of rows; each row maps a set of "assignment
// types" (the columns) to a station/balise number. The columns differ per game
// type - this is the single source of truth the client builder, the CSV/XLS
// templates, and the spreadsheet importer all read from. Mirrors the
// creator-ported PatternEditor's PATTERN_SHAPES (kept in sync deliberately).

export interface PatternShape {
  types: string[];
  labels: string[];
}

export const PATTERN_SHAPES: Record<string, PatternShape> = {
  mystery: {
    types: ['good_answer_station', 'wrong_answer_station'],
    labels: ['Good Answer Station', 'Wrong Answer Station'],
  },
  tagquest: {
    types: ['image_1', 'image_2', 'image_3', 'image_4'],
    labels: ['Image 1 Station', 'Image 2 Station', 'Image 3 Station', 'Image 4 Station'],
  },
  tracks: {
    types: ['station'],
    labels: ['Station'],
  },
  // Clash (V2) has no pattern: balise station codes are authored inline on each
  // territory in the scenario and overridden at launch.
};

export const PATTERN_GAME_TYPES: Array<{ value: string; label: string }> = [
  { value: 'mystery', label: 'Mystery' },
  { value: 'tagquest', label: 'Tagquest' },
  { value: 'tracks', label: 'Track' },
];

export interface PatternRow {
  index: number;
  assignments: Record<string, number | null>;
}

export function getShape(gameType: string): PatternShape {
  return PATTERN_SHAPES[gameType] ?? PATTERN_SHAPES.tagquest;
}

// Reverse map: canonical column key -> its English label (the import/template
// default). Built from PATTERN_SHAPES so it always matches `labels` exactly.
const KEY_TO_ENGLISH_LABEL: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const shape of Object.values(PATTERN_SHAPES)) {
    shape.types.forEach((tp, i) => {
      m[tp] = shape.labels[i];
    });
  }
  return m;
})();

// Localized DISPLAY label for a column key. Pass a `t` (any i18next TFunction -
// it resolves the fully-qualified `patternShapes:` keys regardless of the
// caller's default namespace) to translate; without it, or for unknown/extra
// keys, it falls back to the canonical English label.
//
// IMPORTANT: import/template/export matching never uses this. resolveColumns()
// still matches the canonical `types` keys + the English `labels`, and the
// templates/export still emit canonical `types`. So localizing the display
// here cannot break CSV/XLS round-trips.
export function columnLabel(typeKey: string, t?: (key: string) => string): string {
  if (t) {
    const key = `patternShapes:label.${typeKey}`;
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return KEY_TO_ENGLISH_LABEL[typeKey] ?? typeKey;
}

export function emptyRow(gameType: string, index: number): PatternRow {
  const assignments: Record<string, number | null> = {};
  for (const t of getShape(gameType).types) assignments[t] = null;
  return { index, assignments };
}

// Normalise a header/label string to a comparison key (lowercase, alphanumerics
// only) so 'Image 1 Station', 'image_1' and 'IMAGE1' all collapse together.
function norm(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Map an imported spreadsheet's header row to assignment-type keys (or null for
// columns we don't recognise). Accepts both the canonical key (`image_1`) and
// the human label (`Image 1 Station`).
export function resolveColumns(headers: Array<string | number>, gameType: string): Array<string | null> {
  const shape = getShape(gameType);
  const lookup = new Map<string, string>();
  shape.types.forEach((t, i) => {
    lookup.set(norm(t), t);
    lookup.set(norm(shape.labels[i]), t);
  });
  return headers.map((h) => lookup.get(norm(String(h ?? ''))) ?? null);
}

// Build pattern rows from a raw sheet matrix. Leading metadata lines (a
// downloaded pattern prefixes them with `#key,value`) and blank rows are
// skipped; the first remaining row is the assignment-type header.
export function rowsFromMatrix(matrix: Array<Array<string | number>>, gameType: string): PatternRow[] {
  if (!matrix.length) return [];
  const dataRows = matrix.filter((row) => {
    if (!row) return false;
    const allEmpty = row.every((c) => c == null || String(c).trim() === '');
    if (allEmpty) return false;
    const first = row[0] != null ? String(row[0]).trim() : '';
    return !first.startsWith('#');
  });
  if (!dataRows.length) return [];
  const headerRow = dataRows[0] ?? [];
  const cols = resolveColumns(headerRow, gameType);
  const rows: PatternRow[] = [];
  for (let r = 1; r < dataRows.length; r++) {
    const raw = dataRows[r] ?? [];
    const assignments: Record<string, number | null> = {};
    for (const t of getShape(gameType).types) assignments[t] = null;
    let hasAny = false;
    cols.forEach((typeKey, c) => {
      if (!typeKey) return;
      const cell = raw[c];
      if (cell === undefined || cell === null || String(cell).trim() === '') return;
      const n = parseInt(String(cell).trim(), 10);
      if (Number.isFinite(n)) {
        assignments[typeKey] = n;
        hasAny = true;
      }
    });
    if (hasAny) rows.push({ index: rows.length + 1, assignments });
  }
  return rows;
}

// Header row used by the downloadable templates - the canonical keys.
export function templateHeaders(gameType: string): string[] {
  return getShape(gameType).types;
}

// Safely parse a stored `pattern_data` JSON string into rows.
export function parsePatternData(pd: string | unknown[] | null | undefined): PatternRow[] {
  if (!pd) return [];
  try {
    const arr = typeof pd === 'string' ? JSON.parse(pd) : pd;
    if (!Array.isArray(arr)) return [];
    return arr.map((r, i) => ({
      index: typeof (r as PatternRow)?.index === 'number' ? (r as PatternRow).index : i + 1,
      assignments:
        (r as PatternRow)?.assignments && typeof (r as PatternRow).assignments === 'object'
          ? (r as PatternRow).assignments
          : {},
    }));
  } catch {
    return [];
  }
}

// Columns (key + human label) to render for a set of rows: the game type's
// canonical columns that actually appear, followed by any extra keys present in
// the data. Falls back to all shape columns when the rows are empty.
export function patternColumns(
  rows: PatternRow[],
  gameType: string,
  t?: (key: string) => string,
): Array<{ key: string; label: string }> {
  const shape = getShape(gameType);
  const labelFor = (k: string) => columnLabel(k, t);
  const present = new Set<string>();
  rows.forEach((r) => Object.keys(r.assignments || {}).forEach((k) => present.add(k)));
  const keys: string[] = present.size
    ? shape.types.filter((t) => present.has(t))
    : [...shape.types];
  Array.from(present)
    .filter((k) => !shape.types.includes(k))
    .sort()
    .forEach((k) => keys.push(k));
  return keys.map((k) => ({ key: k, label: labelFor(k) }));
}

// Header + body matrix for CSV/XLSX export (header = canonical keys).
export function patternToMatrix(rows: PatternRow[], gameType: string): Array<Array<string | number>> {
  const cols = patternColumns(rows, gameType);
  const header = cols.map((c) => c.key);
  const body = rows.map((r) => cols.map((c) => {
    const v = r.assignments?.[c.key];
    return v == null ? '' : v;
  }));
  return [header, ...body];
}
