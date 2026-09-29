/**
 * The scenario-translation row model: one shape, two serializers.
 *
 * This module knows nothing about CSV or XLSX. It turns a scenario (its
 * `game_meta` plus its files) into a flat list of translatable rows, and turns
 * an edited list of rows back into the patches the API needs. The serializers
 * in `scenarioTranslationsCsv.ts` / `scenarioTranslationsXlsx.ts` only move
 * those rows in and out of a file.
 *
 * The row model matches the CSV the user already sends to translators:
 *
 *   game type | scenario name | target | target type | Trad type | FR | EN | ES
 *
 * with two machine columns added around the translator's working area -
 * `scenario_uniqid` in front and `row_id` behind the languages. Both are
 * tolerated as absent so a hand-made sheet still imports.
 *
 * Plan: C:\Users\faure\.claude\plans\here-is-a-translation-transient-boot.md
 */

import type { Lang } from '../scenarios/i18n/types';
import { expandTranslatablePaths } from '../scenarios/i18n/translatablePaths';
import { UNIVERS_I18N_KEY } from '../types/univers';
import type { ScenarioGameType } from '../types/scenario-data';

export type TargetType = 'scenario' | 'PDF';
export type TradType = 'field' | 'file title' | 'text';

export interface ScenarioTransRow {
  /** Machine key for the scenario. The `scenario name` column cannot be one:
   *  the scenario's own title is itself a translatable row, so the two disagree
   *  the moment a translator fills it in. */
  scenarioUniqid: string;
  gameType: string;
  /** Informational only - never matched on. */
  scenarioName: string;
  /** A field path, or the file's default-language display name. */
  target: string;
  targetType: TargetType;
  tradType: TradType;
  /** `f:<path>` | `t:<fileId>` | `x:<fileId>:<textId>` | '' for a new text row. */
  rowId: string;
  /** Every language's value, INCLUDING the source language. */
  values: Partial<Record<Lang, string>>;
  /** Stored source hashes, per language, for NEW/STALE. */
  hashes: Partial<Record<Lang, string>>;

  /* Resolution hints - carried in memory, never written to the sheet. */
  path?: string;
  fileId?: number;
  textId?: number;
  position?: number;
  /** True for `field` rows: the source cell belongs to the scenario editor. */
  sourceReadOnly: boolean;
}

export interface FileText {
  id: number;
  position: number;
  source_text: string;
  values: Record<string, string>;
  hashes: Record<string, string>;
}

export interface TranslationFile {
  id: number;
  name: string;
  name_i18n: Record<string, string>;
  name_hashes: Record<string, string>;
  language: string | null;
  parent_file_id: number | null;
  mime_type: string;
  texts: FileText[];
}

export interface ScenarioHeader {
  uniqid: string;
  title: string;
  game_type: string;
  default_language: string;
  available_languages: string[];
}

export interface BuildInput {
  scenario: ScenarioHeader;
  gameMeta: unknown;
  files: TranslationFile[];
}

const asLangMap = (raw: Record<string, string> | undefined): Partial<Record<Lang, string>> =>
  (raw ?? {}) as Partial<Record<Lang, string>>;

/** A short label for the file's kind, used as the `target type` column. */
function fileTargetType(mime: string): TargetType {
  // The reference CSV writes "PDF"; everything attached today is a PDF, and a
  // non-PDF attachment still belongs in the same column.
  return mime === 'application/pdf' ? 'PDF' : 'PDF';
}

/**
 * Expand a scenario into its full translatable row set, in a stable order:
 * scenario fields first (registry order), then each file's title followed by
 * its inner strings.
 */
export function buildScenarioRows(input: BuildInput): ScenarioTransRow[] {
  const { scenario, gameMeta, files } = input;
  const defaultLang = (scenario.default_language || 'fr') as Lang;
  const meta = (gameMeta ?? {}) as Record<string, unknown>;
  const rows: ScenarioTransRow[] = [];

  const base = {
    scenarioUniqid: scenario.uniqid,
    gameType: scenario.game_type,
    scenarioName: scenario.title,
  };

  const universLabels = (meta[UNIVERS_I18N_KEY] ?? {}) as Record<string, Record<string, string>>;

  for (const def of expandTranslatablePaths(scenario.game_type as ScenarioGameType, meta)) {
    let values: Partial<Record<Lang, string>>;

    if (def.universTag !== undefined) {
      // The canonical tag IS the source; only its label is translated.
      values = { ...asLangMap(universLabels[def.universTag]), [defaultLang]: def.universTag };
    } else {
      const raw = readPath(meta, def.path);
      values =
        typeof raw === 'string'
          ? { [defaultLang]: raw }
          : asLangMap(
              typeof raw === 'object' && raw !== null
                ? (raw as Record<string, string>)
                : undefined,
            );
    }

    rows.push({
      ...base,
      target: def.path,
      targetType: 'scenario',
      tradType: 'field',
      rowId: `f:${def.path}`,
      values,
      hashes: {},
      path: def.path,
      sourceReadOnly: true,
    });
  }

  for (const file of files) {
    // Variants inherit their primary's title, so only primaries get a title row.
    if (file.parent_file_id === null) {
      const titleValues = asLangMap(file.name_i18n);
      if (!titleValues[defaultLang] && file.name) titleValues[defaultLang] = file.name;
      rows.push({
        ...base,
        target: file.name,
        targetType: fileTargetType(file.mime_type),
        tradType: 'file title',
        rowId: `t:${file.id}`,
        values: titleValues,
        hashes: asLangMap(file.name_hashes),
        fileId: file.id,
        sourceReadOnly: false,
      });
    }

    for (const text of file.texts) {
      const values = asLangMap(text.values);
      if (!values[defaultLang]) values[defaultLang] = text.source_text;
      rows.push({
        ...base,
        target: file.name,
        targetType: fileTargetType(file.mime_type),
        tradType: 'text',
        rowId: `x:${file.id}:${text.id}`,
        values,
        hashes: asLangMap(text.hashes),
        fileId: file.id,
        textId: text.id,
        position: text.position,
        sourceReadOnly: false,
      });
    }
  }

  return rows;
}

/** Read a dotted/slash path out of game_meta without the editor's helpers. */
function readPath(meta: Record<string, unknown>, path: string): unknown {
  const segments = path.split('/');
  let cursor: unknown = meta;
  for (const segment of segments) {
    if (Array.isArray(cursor)) {
      const ordinal = Number(segment);
      // 1-based ordinals, or an `id` match for collections that carry one.
      const byId = cursor.findIndex(
        (item) =>
          typeof item === 'object' && item !== null && (item as Record<string, unknown>).id === segment,
      );
      const index = byId >= 0 ? byId : ordinal - 1;
      cursor = cursor[index];
    } else if (typeof cursor === 'object' && cursor !== null) {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
    if (cursor === undefined) return undefined;
  }
  return cursor;
}

/** The value a translator sees in the source column. */
export function sourceOf(row: ScenarioTransRow, sourceLang: Lang): string {
  return row.values[sourceLang] ?? '';
}

/* -------------------------------------------------------------------------- */
/* Import                                                                      */
/* -------------------------------------------------------------------------- */

export interface FieldPatch { path: string; lang: Lang; value: string }
export interface TitlePatch { fileId: number; lang: Lang; value: string }
export interface TextPatch {
  fileId: number;
  textId?: number;
  position: number;
  sourceText: string;
  values: Partial<Record<Lang, string>>;
}

export interface ApplyResult {
  patches: FieldPatch[];
  fileTitles: TitlePatch[];
  fileTexts: TextPatch[];
  /** Inner-document strings the sheet introduced that do not exist yet. */
  created: TextPatch[];
  unmatched: { row: ScenarioTransRow; reason: string }[];
  ignored: { row: ScenarioTransRow; reason: string }[];
  counts: { updated: number; created: number; unmatched: number; ignored: number };
}

const normalizeName = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * Turn imported rows into API patches against the CURRENT state.
 *
 * Pure - no I/O. The Import button runs this first and shows the counts, so a
 * mismatched sheet is a preview rather than a silent mangling of a scenario.
 *
 * Matching order:
 *   1. `row_id`, when present and resolvable. Authoritative, and the only thing
 *      that survives a translator editing the source AND the target in one pass.
 *   2. Otherwise by `target`: a field path, a file name, or - for inner text -
 *      an exact source match, then an ordinal within that file.
 */
export function applyScenarioRows(
  rows: ScenarioTransRow[],
  current: ScenarioTransRow[],
  opts: { sourceLang: Lang; langs: readonly Lang[] },
): ApplyResult {
  const { sourceLang, langs } = opts;

  const byRowId = new Map<string, ScenarioTransRow>();
  const fieldByPath = new Map<string, ScenarioTransRow>();
  const titleByName = new Map<string, ScenarioTransRow[]>();
  const textsByFile = new Map<number, ScenarioTransRow[]>();
  const fileIdByName = new Map<string, number[]>();

  for (const row of current) {
    if (row.rowId) byRowId.set(row.rowId, row);
    if (row.tradType === 'field' && row.path) fieldByPath.set(row.path, row);
    if (row.tradType === 'file title') {
      const key = normalizeName(row.target);
      titleByName.set(key, [...(titleByName.get(key) ?? []), row]);
      if (row.fileId !== undefined) {
        fileIdByName.set(key, [...(fileIdByName.get(key) ?? []), row.fileId]);
      }
    }
    if (row.tradType === 'text' && row.fileId !== undefined) {
      textsByFile.set(row.fileId, [...(textsByFile.get(row.fileId) ?? []), row]);
    }
  }

  const result: ApplyResult = {
    patches: [],
    fileTitles: [],
    fileTexts: [],
    created: [],
    unmatched: [],
    ignored: [],
    counts: { updated: 0, created: 0, unmatched: 0, ignored: 0 },
  };

  /** Languages worth writing for this row. */
  const targetLangs = (row: ScenarioTransRow): Lang[] =>
    langs.filter((l) => {
      // A `field` row's source is owned by the scenario editor, so the source
      // column round-trips read-only. For univers that is doubly important:
      // writing it would rename the canonical tag every catalog filter keys on.
      if (l === sourceLang && row.sourceReadOnly) return false;
      return row.values[l] !== undefined;
    });

  const seenTextPositions = new Map<number, number>();

  for (const row of rows) {
    const matched = row.rowId ? byRowId.get(row.rowId) : undefined;

    /* ---- scenario fields ---- */
    if (row.tradType === 'field') {
      const target = matched ?? (row.target ? fieldByPath.get(row.target) : undefined);
      if (!target || !target.path) {
        result.unmatched.push({
          row,
          reason: `No such field path on this scenario: "${row.target}"`,
        });
        continue;
      }
      let wrote = 0;
      for (const lang of targetLangs(row)) {
        const value = row.values[lang] ?? '';
        if (value === (target.values[lang] ?? '')) continue;
        result.patches.push({ path: target.path, lang, value });
        wrote++;
      }
      if (wrote) result.counts.updated++;
      continue;
    }

    /* ---- file titles ---- */
    if (row.tradType === 'file title') {
      let fileId = matched?.fileId;
      if (fileId === undefined) {
        const candidates = fileIdByName.get(normalizeName(row.target)) ?? [];
        if (candidates.length === 0) {
          result.unmatched.push({ row, reason: `No file named "${row.target}"` });
          continue;
        }
        if (candidates.length > 1) {
          result.unmatched.push({
            row,
            reason: `"${row.target}" matches ${candidates.length} files - rename one, or import with row_id`,
          });
          continue;
        }
        fileId = candidates[0];
      }
      const before = matched ?? titleByName.get(normalizeName(row.target))?.[0];
      let wrote = 0;
      for (const lang of targetLangs(row)) {
        const value = row.values[lang] ?? '';
        if (before && value === (before.values[lang] ?? '')) continue;
        result.fileTitles.push({ fileId, lang, value });
        wrote++;
      }
      if (wrote) result.counts.updated++;
      continue;
    }

    /* ---- inner-document strings ---- */
    if (row.tradType === 'text') {
      let fileId = matched?.fileId;
      if (fileId === undefined) {
        const candidates = fileIdByName.get(normalizeName(row.target)) ?? [];
        if (candidates.length !== 1) {
          result.unmatched.push({
            row,
            reason:
              candidates.length === 0
                ? `No file named "${row.target}"`
                : `"${row.target}" matches ${candidates.length} files`,
          });
          continue;
        }
        fileId = candidates[0];
      }

      const source = row.values[sourceLang] ?? '';
      const pool = textsByFile.get(fileId) ?? [];
      let target = matched;

      if (!target) {
        // Exact source match is correct but brittle: a one-character edit to
        // the source in the sheet detaches the row. The ordinal fallback below
        // repairs that at the cost of retargeting on a reorder - which is
        // exactly why export always writes a row_id.
        target = pool.find((t) => (t.values[sourceLang] ?? '') === source);
      }
      if (!target) {
        const nth = seenTextPositions.get(fileId) ?? 0;
        target = pool[nth];
      }
      seenTextPositions.set(fileId, (seenTextPositions.get(fileId) ?? 0) + 1);

      const values: Partial<Record<Lang, string>> = {};
      for (const lang of targetLangs(row)) values[lang] = row.values[lang] ?? '';

      if (!target) {
        const patch: TextPatch = {
          fileId,
          position: pool.length + result.created.filter((c) => c.fileId === fileId).length,
          sourceText: source,
          values,
        };
        result.created.push(patch);
        result.counts.created++;
        continue;
      }

      result.fileTexts.push({
        fileId,
        textId: target.textId,
        position: target.position ?? 0,
        sourceText: source,
        values,
      });
      result.counts.updated++;
      continue;
    }

    result.ignored.push({ row, reason: `Unknown Trad type "${row.tradType}"` });
  }

  result.counts.unmatched = result.unmatched.length;
  result.counts.ignored = result.ignored.length;
  return result;
}
