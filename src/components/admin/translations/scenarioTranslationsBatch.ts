/**
 * The steps between a loaded scenario, an imported sheet and a save, shared by
 * the one-scenario grid and the several-scenarios import so both write exactly
 * the same way:
 *
 *   rowsForModel     loaded scenario   -> grid rows (with staleness hashes)
 *   foldImport       grid + ApplyResult -> grid with the sheet's values in it
 *   buildSaveInput   grid vs baseline  -> the payload useScenarioTranslations.save takes
 */

import { fnv1a } from '../../../i18n/translatorXlsx';
import {
  buildScenarioRows,
  type ApplyResult,
  type FieldPatch,
  type ScenarioTransRow,
  type TextPatch,
} from '../../../i18n/scenarioTranslationRows';
import type { Lang } from '../../../i18n/languages';
import type { ScenarioTranslationModel } from './useScenarioTranslations';

export function rowsForModel(model: ScenarioTranslationModel): ScenarioTransRow[] {
  const built = buildScenarioRows({
    scenario: model.scenario,
    gameMeta: model.gameMeta,
    files: model.files,
  });
  // Field rows carry their staleness hashes in the scenario's
  // translation_meta column; file rows carry their own.
  for (const row of built) {
    if (row.tradType === 'field' && row.path) {
      row.hashes = (model.translationMeta[row.path] ?? {}) as ScenarioTransRow['hashes'];
    }
  }
  return built;
}

/** Fold an import's parsed values into a copy of the grid. */
export function foldImport(
  rows: ScenarioTransRow[],
  result: ApplyResult,
  header: { uniqid: string; gameType: string; title: string },
  sourceLang: Lang,
): ScenarioTransRow[] {
  const next = rows.slice();
  const indexByRowId = new Map(next.map((r, i) => [r.rowId, i]));
  const indexByPath = new Map(next.map((r, i) => [r.tradType === 'field' ? (r.path ?? '') : '', i]));
  for (const p of result.patches) {
    const i = indexByRowId.get(`f:${p.path}`) ?? indexByPath.get(p.path);
    if (i === undefined) continue;
    next[i] = { ...next[i], values: { ...next[i].values, [p.lang]: p.value } };
  }
  for (const t of result.fileTitles) {
    const i = next.findIndex((r) => r.tradType === 'file title' && r.fileId === t.fileId);
    if (i < 0) continue;
    next[i] = { ...next[i], values: { ...next[i].values, [t.lang]: t.value } };
  }
  for (const t of result.fileTexts) {
    const i = next.findIndex((r) => r.tradType === 'text' && r.fileId === t.fileId && r.textId === t.textId);
    if (i < 0) continue;
    next[i] = { ...next[i], values: { ...next[i].values, ...t.values } };
  }
  for (const c of result.created) {
    const fileRow = next.find((r) => r.fileId === c.fileId);
    next.push({
      scenarioUniqid: header.uniqid,
      gameType: header.gameType,
      scenarioName: header.title,
      target: fileRow?.target ?? '',
      targetType: 'PDF',
      tradType: 'text',
      rowId: '',
      values: { ...c.values, [sourceLang]: c.sourceText },
      hashes: {},
      fileId: c.fileId,
      position: c.position,
      sourceReadOnly: false,
    });
  }
  return next;
}

type FileTextRow = {
  id?: number;
  position: number;
  source_text: string;
  values: Record<string, string>;
  hashes: Record<string, string>;
};

export interface SaveInput {
  patches: FieldPatch[];
  stamps: { path: string; lang: Lang; hash: string }[];
  fileTitles: Map<number, { values: Record<string, string>; hashes: Record<string, string> }>;
  fileTexts: Map<number, TextPatch[]>;
  allTextsByFile: Map<number, FileTextRow[]>;
  touchedFiles: Set<number>;
}

/** What changed between `baseline` and `rows`, as the save endpoint wants it. */
export function buildSaveInput(
  rows: ScenarioTransRow[],
  baseline: ScenarioTransRow[],
  langs: readonly Lang[],
  sourceLang: Lang,
): SaveInput {
  const patches: FieldPatch[] = [];
  const stamps: { path: string; lang: Lang; hash: string }[] = [];
  const fileTitles = new Map<number, { values: Record<string, string>; hashes: Record<string, string> }>();
  const fileTexts = new Map<number, TextPatch[]>();
  const allTextsByFile = new Map<number, FileTextRow[]>();
  const touchedFiles = new Set<number>();

  rows.forEach((row, i) => {
    const before = baseline[i];
    const source = row.values[sourceLang] ?? '';
    for (const lang of langs) {
      if (lang === sourceLang && row.sourceReadOnly) continue;
      const value = row.values[lang] ?? '';
      const prior = before?.values[lang] ?? '';
      if (value === prior) continue;

      if (row.tradType === 'field' && row.path) {
        patches.push({ path: row.path, lang, value });
        if (lang !== sourceLang && value !== '') {
          stamps.push({ path: row.path, lang, hash: fnv1a(source) });
        }
      } else if (row.fileId !== undefined) {
        touchedFiles.add(row.fileId);
      }
    }
    // Editing a file row's own source also counts as a change.
    if (!row.sourceReadOnly && row.fileId !== undefined) {
      if ((before?.values[sourceLang] ?? '') !== source) touchedFiles.add(row.fileId);
    }
  });

  // Rebuild the full picture for every file that changed: titles are a
  // whole-map write, and texts are sent as the complete ordered list so a
  // deleted line actually disappears (delete_missing).
  for (const fileId of touchedFiles) {
    const titleRow = rows.find((r) => r.fileId === fileId && r.tradType === 'file title');
    if (titleRow) {
      const values: Record<string, string> = {};
      const hashes: Record<string, string> = { ...(titleRow.hashes as Record<string, string>) };
      const src = titleRow.values[sourceLang] ?? '';
      const prior = baseline.find((b) => b.rowId === titleRow.rowId);
      for (const lang of langs) {
        const v = titleRow.values[lang] ?? '';
        if (v !== '') values[lang] = v;
        if (lang !== sourceLang && v !== '' && v !== (prior?.values[lang] ?? '')) {
          hashes[lang] = fnv1a(src);
        }
      }
      fileTitles.set(fileId, { values, hashes });
    }

    const list = rows
      .filter((r) => r.fileId === fileId && r.tradType === 'text')
      .map((r, position) => {
        const values: Record<string, string> = {};
        const hashes: Record<string, string> = { ...(r.hashes as Record<string, string>) };
        const src = r.values[sourceLang] ?? '';
        for (const lang of langs) {
          const v = r.values[lang] ?? '';
          if (v !== '') values[lang] = v;
          if (lang !== sourceLang && v !== '') hashes[lang] = hashes[lang] ?? fnv1a(src);
        }
        return { id: r.textId, position, source_text: src, values, hashes };
      });
    allTextsByFile.set(fileId, list);
    fileTexts.set(fileId, []);
  }

  return { patches, stamps, fileTitles, fileTexts, allTextsByFile, touchedFiles };
}
