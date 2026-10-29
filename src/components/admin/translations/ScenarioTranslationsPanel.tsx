/**
 * The Translations page's "Scenarios" tab.
 *
 * One grid over everything translatable about a scenario: its editor fields
 * (title / story / the game-type's text_* strings / levels / enigmas / quests /
 * checkpoints / clans / univers labels) plus, per attached file, its display
 * title and the strings printed inside the document.
 *
 * Plan: C:\Users\faure\.claude\plans\here-is-a-translation-transient-boot.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload, Plus, Trash2, Search, Loader2 } from 'lucide-react';
import { LANGUAGES, SUPPORTED_LANGS, CLIENT_LANGS, type Lang } from '../../../i18n/languages';
import { cellStatus } from '../../../i18n/translatorXlsx';
import { applyScenarioRows, type ScenarioTransRow } from '../../../i18n/scenarioTranslationRows';
import { rowsForModel, foldImport, buildSaveInput } from './scenarioTranslationsBatch';
import { toCsv, fromCsv, statusCell } from '../../../i18n/scenarioTranslationsCsv';
import { toXlsx, fromXlsx } from '../../../i18n/scenarioTranslationsXlsx';
import {
  useScenarioTranslations,
  type ScenarioPickerRow,
  type ScenarioTranslationModel,
} from './useScenarioTranslations';

type Filter = 'all' | 'fields' | 'files';

interface DryRun {
  summary: string;
  /** Several-scenarios import: one line per scenario. */
  details?: string[];
  unmatched: { target: string; reason: string }[];
  applyLabel: string;
  apply: () => Promise<void>;
}

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const normTitle = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** `%team%`-style runtime tokens that must survive a translation verbatim. */
const TOKEN_RE = /%[A-Za-z_]+%|\{[A-Za-z_]+\}/g;
const tokensOf = (s: string): string[] => (s.match(TOKEN_RE) ?? []).map((t) => t.toLowerCase()).sort();

export default function ScenarioTranslationsPanel() {
  const api = useScenarioTranslations();
  const [scenarios, setScenarios] = useState<ScenarioPickerRow[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>('');
  const [model, setModel] = useState<ScenarioTranslationModel | null>(null);
  const [rows, setRows] = useState<ScenarioTransRow[]>([]);
  const [baseline, setBaseline] = useState<ScenarioTransRow[]>([]);
  const [showAllLangs, setShowAllLangs] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [pasteFor, setPasteFor] = useState<number | null>(null);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    api
      .listScenarios()
      .then((list) => {
        if (active) setScenarios(list);
      })
      .catch((e) => active && setMessage({ type: 'error', text: (e as Error).message }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sourceLang = (model?.scenario.default_language ?? 'fr') as Lang;

  /** Source first, then the scenario's own languages, then the rest on demand. */
  const langs: Lang[] = useMemo(() => {
    if (!model) return [...CLIENT_LANGS];
    const own = (model.scenario.available_languages ?? []).filter((l): l is Lang =>
      (SUPPORTED_LANGS as readonly string[]).includes(l),
    );
    const base = Array.from(new Set<Lang>([sourceLang, ...own, ...CLIENT_LANGS]));
    if (!showAllLangs) return base;
    return Array.from(new Set<Lang>([...base, ...SUPPORTED_LANGS]));
  }, [model, showAllLangs, sourceLang]);

  const loadScenario = useCallback(
    async (uniqid: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const next = await api.loadScenario(uniqid);
        const built = rowsForModel(next);
        setModel(next);
        setRows(built);
        setBaseline(JSON.parse(JSON.stringify(built)));
      } catch (e) {
        setMessage({ type: 'error', text: (e as Error).message });
      } finally {
        setBusy(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (selected) void loadScenario(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const visibleRows = useMemo(
    () =>
      rows.filter((r) =>
        filter === 'all' ? true : filter === 'fields' ? r.targetType === 'scenario' : r.targetType !== 'scenario',
      ),
    [rows, filter],
  );

  const setCell = (index: number, lang: Lang, value: string) => {
    setRows((prev) => {
      const next = prev.slice();
      next[index] = { ...next[index], values: { ...next[index].values, [lang]: value } };
      return next;
    });
  };

  const filteredScenarios = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scenarios;
    return scenarios.filter(
      (s) => s.title.toLowerCase().includes(q) || s.game_type.toLowerCase().includes(q),
    );
  }, [scenarios, query]);

  /* -------------------------- language validation ------------------------- */

  /**
   * Per-language completeness over every row that has a source text:
   * translated and current / stale / empty. Drives the column headers and the
   * confirmation shown before a language is released.
   */
  const langProgress = useMemo(() => {
    const out: Partial<Record<Lang, { total: number; done: number; stale: number; empty: number }>> = {};
    for (const lang of langs) {
      if (lang === sourceLang) continue;
      const p = { total: 0, done: 0, stale: 0, empty: 0 };
      for (const row of rows) {
        const source = row.values[sourceLang] ?? '';
        if (source.trim() === '') continue;
        p.total++;
        const status = cellStatus(source, row.values[lang] || undefined, row.hashes[lang]);
        if (status === 'ok') p.done++;
        else if (status === 'stale') p.stale++;
        else p.empty++;
      }
      out[lang] = p;
    }
    return out;
  }, [rows, langs, sourceLang]);

  const isDirty = useMemo(() => JSON.stringify(rows) !== JSON.stringify(baseline), [rows, baseline]);

  /**
   * Release / withdraw a language. A draft language lives in the scenario data
   * but is stripped server-side from every client and playground payload
   * (tester clients excepted) until it is validated here.
   */
  const toggleValidation = async (lang: Lang) => {
    if (!model) return;
    const validated = model.scenario.validated_languages.includes(lang);
    if (!validated) {
      if (isDirty) {
        setMessage({ type: 'info', text: 'Save your edits before validating a language.' });
        return;
      }
      const p = langProgress[lang];
      const gaps =
        p && (p.empty > 0 || p.stale > 0)
          ? `\n\nStill ${p.empty} empty and ${p.stale} stale of ${p.total} texts - licensees will see the ${sourceLang.toUpperCase()} text (or nothing) there.`
          : '';
      if (
        !window.confirm(
          `Release ${lang.toUpperCase()} of "${model.scenario.title}" to licensees and playgrounds?${gaps}`,
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        `Withdraw ${lang.toUpperCase()} of "${model.scenario.title}"? Licensees lose it on their next sync, and ${lang.toUpperCase()}-language licensees lose the scenario from their catalogue.`,
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const next = await api.setLanguageValidation(model.scenario.uniqid, lang, !validated);
      setModel({ ...model, scenario: { ...model.scenario, validated_languages: next } });
      setScenarios((list) =>
        list.map((s) => (s.uniqid === model.scenario.uniqid ? { ...s, validated_langs: next } : s)),
      );
      setMessage({
        type: 'success',
        text: validated
          ? `${lang.toUpperCase()} withdrawn - back to draft, admins and tester licensees only.`
          : `${lang.toUpperCase()} validated - released to licensees on their next sync.`,
      });
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  /** Picker label: each language with ✓ (released) or ✎ (draft). */
  const pickerLangs = (s: ScenarioPickerRow): string => {
    if (s.translated_langs.length === 0) return s.default_language;
    return s.translated_langs
      .map((l) => (s.gated ? `${l}${s.validated_langs.includes(l) ? ' ✓' : ' ✎'}` : l))
      .join(' / ');
  };

  /* ------------------------------- saving ------------------------------- */

  const handleSave = async () => {
    if (!model) return;
    setBusy(true);
    setMessage(null);
    api.setError(null);

    try {
      const { patches, stamps, fileTitles, fileTexts, allTextsByFile, touchedFiles } = buildSaveInput(
        rows,
        baseline,
        langs,
        sourceLang,
      );

      const version = await api.save({
        uniqid: model.scenario.uniqid,
        baseVersion: model.scenario.version,
        patches,
        stamps,
        fileTitles,
        fileTexts,
        allTextsByFile,
      });

      setMessage({
        type: 'success',
        text: `Saved ${patches.length} field value(s) and ${touchedFiles.size} file(s). Version ${version}.`,
      });
      await loadScenario(model.scenario.uniqid);
    } catch (e) {
      const err = e as Error & { status?: number };
      setMessage({
        type: 'error',
        text:
          err.status === 409
            ? `${err.message} (Nothing was written.)`
            : err.message || 'Save failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  /* ---------------------------- import / export ---------------------------- */

  const statusOf = useCallback(
    (row: ScenarioTransRow) =>
      statusCell(row, langs, sourceLang, (source, value, hash) => cellStatus(source, value, hash)),
    [langs, sourceLang],
  );

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (!model) return;
    const slug = model.scenario.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    if (format === 'csv') {
      const csv = toCsv(rows, { langs, sourceLang, statusOf });
      download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `translations-${slug}.csv`);
    } else {
      const buf = await toXlsx(rows, { langs, statusOf });
      download(
        new Blob([buf], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `translations-${slug}.xlsx`,
      );
    }
  };

  /**
   * Every scenario in the picker (the search narrows it) in ONE sheet. Each
   * scenario keeps its own source language, so the columns are the union of
   * all of them and each row's status is computed against its own source.
   * Re-importing it on a scenario applies that scenario's rows only - the
   * import already skips rows whose scenario_uniqid is another one.
   */
  const handleExportAll = async (format: 'csv' | 'xlsx') => {
    const targets = filteredScenarios;
    if (targets.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const all: ScenarioTransRow[] = [];
      const sourceOfRow = new Map<string, Lang>();
      const langSet = new Set<Lang>(CLIENT_LANGS);
      const failed: string[] = [];

      // A few requests at a time: one `get` per scenario, kept in picker order.
      const results: (ScenarioTranslationModel | null)[] = new Array(targets.length).fill(null);
      let cursor = 0;
      let done = 0;
      const worker = async () => {
        while (cursor < targets.length) {
          const i = cursor++;
          try {
            results[i] = await api.loadScenario(targets[i].uniqid);
          } catch {
            failed.push(targets[i].title);
          }
          done++;
          setMessage({ type: 'info', text: `Loading scenarios… ${done}/${targets.length}` });
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, targets.length) }, worker));

      for (const m of results) {
        if (!m) continue;
        const src = (m.scenario.default_language || 'fr') as Lang;
        sourceOfRow.set(m.scenario.uniqid, src);
        langSet.add(src);
        for (const l of m.scenario.available_languages ?? []) {
          if ((SUPPORTED_LANGS as readonly string[]).includes(l)) langSet.add(l as Lang);
        }
        all.push(...rowsForModel(m));
      }
      if (showAllLangs) for (const l of SUPPORTED_LANGS) langSet.add(l);
      // Keep the canonical language order rather than discovery order.
      const allLangs = (SUPPORTED_LANGS as readonly Lang[]).filter((l) => langSet.has(l));

      const statusOfAny = (row: ScenarioTransRow) =>
        statusCell(row, allLangs, sourceOfRow.get(row.scenarioUniqid) ?? 'fr', (source, value, hash) =>
          cellStatus(source, value, hash),
        );

      const stamp = new Date().toISOString().slice(0, 10);
      const name = `translations-all-scenarios-${stamp}`;
      if (format === 'csv') {
        // sourceLang only matters per row (status), which statusOfAny handles.
        const csv = toCsv(all, { langs: allLangs, sourceLang: 'fr', statusOf: statusOfAny });
        download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
      } else {
        const buf = await toXlsx(all, { langs: allLangs, statusOf: statusOfAny });
        download(
          new Blob([buf], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          `${name}.xlsx`,
        );
      }

      const exported = targets.length - failed.length;
      setMessage(
        failed.length
          ? {
              type: 'error',
              text: `Exported ${exported} scenario(s), ${all.length} row(s). ${failed.length} could not be loaded: ${failed
                .slice(0, 5)
                .join(', ')}${failed.length > 5 ? '…' : ''}`,
            }
          : { type: 'success', text: `Exported ${exported} scenario(s), ${all.length} row(s) in one file.` },
      );
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message || 'Export failed.' });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Which scenario each imported row belongs to: its `scenario_uniqid`, else
   * the scenario open in the grid, else a unique title match on `scenario
   * name` (a hand-made sheet). Rows that resolve to nothing are reported.
   */
  const groupImported = (imported: ScenarioTransRow[]) => {
    const known = new Set(scenarios.map((s) => s.uniqid));
    const byTitle = new Map<string, string[]>();
    for (const s of scenarios) {
      const k = normTitle(s.title);
      byTitle.set(k, [...(byTitle.get(k) ?? []), s.uniqid]);
    }
    const groups = new Map<string, ScenarioTransRow[]>();
    const orphans: { target: string; reason: string }[] = [];
    for (const r of imported) {
      let uniqid = r.scenarioUniqid;
      if (uniqid && !known.has(uniqid)) {
        orphans.push({ target: `${r.scenarioName || uniqid} · ${r.target}`, reason: `Unknown scenario_uniqid "${uniqid}"` });
        continue;
      }
      if (!uniqid && model) uniqid = model.scenario.uniqid;
      if (!uniqid) {
        const hits = byTitle.get(normTitle(r.scenarioName)) ?? [];
        if (hits.length === 1) uniqid = hits[0];
      }
      if (!uniqid) {
        orphans.push({
          target: `${r.scenarioName || '(no scenario)'} · ${r.target}`,
          reason: 'No scenario_uniqid, and the scenario name matches no single scenario',
        });
        continue;
      }
      groups.set(uniqid, [...(groups.get(uniqid) ?? []), r]);
    }
    return { groups, orphans };
  };

  const handleImportFile = async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      // Read every language column the sheet has; each scenario then takes
      // what applies to it.
      const isXlsx = /\.xlsx$/i.test(file.name);
      const imported = isXlsx
        ? await fromXlsx(await file.arrayBuffer(), SUPPORTED_LANGS)
        : fromCsv(await file.text(), SUPPORTED_LANGS);

      if (imported.length === 0) {
        setMessage({ type: 'error', text: 'No usable rows found in that file.' });
        return;
      }

      const { groups, orphans } = groupImported(imported);
      if (groups.size === 0) {
        setMessage({ type: 'error', text: `None of the ${imported.length} row(s) could be tied to a scenario.` });
        return;
      }

      if (model && groups.size === 1 && groups.has(model.scenario.uniqid) && orphans.length === 0) {
        prepareSingleImport(groups.get(model.scenario.uniqid)!);
      } else {
        await prepareMultiImport(groups, orphans);
      }
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message || 'Import failed.' });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /** The sheet only touches the scenario in the grid: preview, then fold into the grid. */
  const prepareSingleImport = (mine: ScenarioTransRow[]) => {
    if (!model) return;
    const result = applyScenarioRows(mine, rows, { sourceLang, langs });
    setDryRun({
      summary:
        `${result.counts.updated} updated · ${result.counts.created} new text row(s) · ` +
        `${result.counts.unmatched} unmatched · ${result.counts.ignored} ignored`,
      unmatched: result.unmatched.map((u) => ({ target: u.row.target, reason: u.reason })),
      applyLabel: 'Apply to grid',
      apply: async () => {
        // Fold into the in-memory grid, then the normal Save persists it, so
        // import and hand-editing cannot diverge.
        setRows((prev) =>
          foldImport(
            prev,
            result,
            { uniqid: model.scenario.uniqid, gameType: model.scenario.game_type, title: model.scenario.title },
            sourceLang,
          ),
        );
        setDryRun(null);
        setMessage({
          type: 'info',
          text: 'Imported into the grid. Review the highlighted cells, then Save to persist.',
        });
      },
    });
  };

  /**
   * The sheet spans several scenarios: load each, compute its changes against
   * its current data, preview per-scenario counts, then save them one by one
   * (each with its own version guard, so one 409 does not stop the others).
   */
  const prepareMultiImport = async (
    groups: Map<string, ScenarioTransRow[]>,
    orphans: { target: string; reason: string }[],
  ) => {
    if (
      isDirty &&
      !window.confirm(
        'The grid has unsaved edits. This file spans several scenarios and is saved straight to them, which reloads the grid. Continue and lose the grid edits?',
      )
    ) {
      return;
    }
    const plans: { model: ScenarioTranslationModel; input: ReturnType<typeof buildSaveInput> }[] = [];
    const details: string[] = [];
    const unmatched = [...orphans];
    let read = 0;

    for (const [uniqid, group] of groups) {
      read++;
      setMessage({ type: 'info', text: `Reading scenarios… ${read}/${groups.size}` });
      const m = await api.loadScenario(uniqid);
      const src = (m.scenario.default_language || 'fr') as Lang;
      const current = rowsForModel(m);
      const result = applyScenarioRows(group, current, { sourceLang: src, langs: SUPPORTED_LANGS });
      const next = foldImport(current, result, { uniqid, gameType: m.scenario.game_type, title: m.scenario.title }, src);
      const input = buildSaveInput(next, current, SUPPORTED_LANGS, src);
      const changed = input.patches.length > 0 || input.touchedFiles.size > 0;
      for (const u of result.unmatched) {
        unmatched.push({ target: `${m.scenario.title} · ${u.row.target}`, reason: u.reason });
      }
      details.push(
        `${m.scenario.title}: ` +
          (changed
            ? `${input.patches.length} field value(s)` +
              (input.touchedFiles.size ? `, ${input.touchedFiles.size} file(s)` : '') +
              (result.counts.created ? ` (${result.counts.created} new text row(s))` : '')
            : 'nothing new') +
          (result.counts.unmatched ? ` · ${result.counts.unmatched} unmatched` : ''),
      );
      if (changed) plans.push({ model: m, input });
    }
    setMessage(null);

    setDryRun({
      summary:
        `${groups.size} scenario(s) in the file · ${plans.length} with changes · ` +
        `${unmatched.length} unmatched row(s). Applying saves straight to each scenario.`,
      details,
      unmatched,
      applyLabel: `Save ${plans.length} scenario(s)`,
      apply: async () => {
        setBusy(true);
        const failed: string[] = [];
        let saved = 0;
        for (const plan of plans) {
          setMessage({ type: 'info', text: `Saving… ${saved + failed.length + 1}/${plans.length}` });
          try {
            await api.save({
              uniqid: plan.model.scenario.uniqid,
              baseVersion: plan.model.scenario.version,
              patches: plan.input.patches,
              stamps: plan.input.stamps,
              fileTitles: plan.input.fileTitles,
              fileTexts: plan.input.fileTexts,
              allTextsByFile: plan.input.allTextsByFile,
            });
            saved++;
          } catch (e) {
            failed.push(`${plan.model.scenario.title}: ${(e as Error).message}`);
          }
        }
        setDryRun(null);
        setBusy(false);
        setMessage(
          failed.length
            ? { type: 'error', text: `Saved ${saved} scenario(s); ${failed.length} failed - ${failed.join(' | ')}` }
            : { type: 'success', text: `Saved ${saved} scenario(s) from the file.` },
        );
        api.listScenarios().then(setScenarios).catch(() => undefined);
        if (model) await loadScenario(model.scenario.uniqid);
      },
    });
  };

  /* ------------------------------ text rows ------------------------------ */

  const addPastedTexts = () => {
    if (pasteFor === null) return;
    const lines = pasteText
      .split('\n')
      .map((l) => l.replace(/\r$/, ''))
      .filter((l) => l.trim() !== '');
    if (lines.length === 0) return;

    const fileRow = rows.find((r) => r.fileId === pasteFor);
    const existing = rows.filter((r) => r.fileId === pasteFor && r.tradType === 'text').length;

    setRows((prev) => [
      ...prev,
      ...lines.map((line, i) => ({
        scenarioUniqid: model!.scenario.uniqid,
        gameType: model!.scenario.game_type,
        scenarioName: model!.scenario.title,
        target: fileRow?.target ?? '',
        targetType: 'PDF' as const,
        tradType: 'text' as const,
        rowId: '',
        values: { [sourceLang]: line } as ScenarioTransRow['values'],
        hashes: {},
        fileId: pasteFor,
        position: existing + i,
        sourceReadOnly: false,
      })),
    ]);
    setPasteFor(null);
    setPasteText('');
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  /* -------------------------------- render -------------------------------- */

  if (loading) return <div className="p-6 text-slate-600">Loading scenarios…</div>;

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Scenario translations</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Every translatable field of a scenario, plus its files&apos; titles and the strings
            printed inside each document. The source column is the scenario&apos;s own default
            language; scenario fields are authored in the editor and read-only here.{' '}
            <span className="font-medium">NEW</span> = never translated,{' '}
            <span className="font-medium">STALE</span> = the source changed since.{' '}
            On catalogue scenarios a new language is a <span className="font-medium">✎ Draft</span>{' '}
            (admins and tester licensees only) until you mark it{' '}
            <span className="font-medium">✓ Validated</span> in its column header.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="inline-flex rounded-md border border-slate-300 overflow-hidden"
            title={
              query.trim()
                ? 'Every scenario matching the search, in one file'
                : 'Every scenario, in one file'
            }
          >
            <span className="px-2.5 py-2 text-sm text-slate-600 bg-slate-50 border-r border-slate-300 inline-flex items-center gap-1.5">
              <Download className="w-4 h-4" />
              {query.trim() ? 'Export matching' : 'Export all'} ({filteredScenarios.length})
            </span>
            <button
              type="button"
              onClick={() => void handleExportAll('csv')}
              disabled={busy || filteredScenarios.length === 0}
              className="px-2.5 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 border-r border-slate-300"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => void handleExportAll('xlsx')}
              disabled={busy || filteredScenarios.length === 0}
              className="px-2.5 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              XLSX
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleExport('csv')}
            disabled={!model || busy}
            className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => void handleExport('xlsx')}
            disabled={!model || busy}
            className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 text-sm disabled:opacity-50"
          >
            Export XLSX
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            title="A sheet for the open scenario, or one spanning several scenarios (e.g. an Export all)"
            className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!model || busy}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm inline-flex items-center gap-1.5"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {busy ? 'Working…' : 'Save'}
          </button>
        </div>
      </div>

      {/* scenario picker */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scenarios…"
            className="pl-8 pr-3 py-2 border border-slate-300 rounded-md text-sm w-64"
          />
        </div>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-md text-sm min-w-[22rem]"
        >
          <option value="">Select a scenario…</option>
          {filteredScenarios.map((s) => (
            <option key={s.uniqid} value={s.uniqid}>
              {s.game_type} · {s.title} ({pickerLangs(s)})
              {s.files_count ? ` · ${s.files_count} file(s)` : ''}
            </option>
          ))}
        </select>

        {model && (
          <>
            <span className="text-sm text-slate-500">
              source: <span className="font-medium uppercase">{sourceLang}</span> · v
              {model.scenario.version}
            </span>
            <label className="text-sm text-slate-600 inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={showAllLangs}
                onChange={(e) => setShowAllLangs(e.target.checked)}
              />
              show all {SUPPORTED_LANGS.length} languages
            </label>
          </>
        )}
      </div>

      {model && (
        <div className="flex gap-1 mb-3">
          {(['all', 'fields', 'files'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                filter === f
                  ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f === 'all' ? 'All' : f === 'fields' ? 'Scenario fields' : 'Files'}
            </button>
          ))}
        </div>
      )}

      {(message || api.error) && (
        <div
          className={`mb-4 px-4 py-2 rounded-md text-sm ${
            message?.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : message?.type === 'info'
                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message?.text ?? api.error}
        </div>
      )}

      {dryRun && (
        <div className="mb-4 p-4 rounded-md border border-amber-300 bg-amber-50">
          <div className="font-medium text-amber-900 mb-1">Import preview</div>
          <div className="text-sm text-amber-900">{dryRun.summary}</div>
          {dryRun.details && dryRun.details.length > 0 && (
            <ul className="mt-2 text-xs text-amber-900 list-disc pl-5 max-h-48 overflow-y-auto">
              {dryRun.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
          {dryRun.unmatched.length > 0 && (
            <ul className="mt-2 text-xs text-amber-800 list-disc pl-5 max-h-40 overflow-y-auto">
              {dryRun.unmatched.slice(0, 50).map((u, i) => (
                <li key={i}>
                  <span className="font-mono">{u.target}</span> · {u.reason}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => void dryRun.apply()}
              disabled={busy}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-md text-sm hover:bg-amber-700 disabled:opacity-50"
            >
              {dryRun.applyLabel}
            </button>
            <button
              type="button"
              onClick={() => setDryRun(null)}
              className="px-3 py-1.5 border border-amber-300 rounded-md text-sm hover:bg-amber-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!model ? (
        <div className="text-slate-500 text-sm border border-dashed border-slate-300 rounded p-8 text-center">
          Pick a scenario to see its translatable fields and files.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-slate-50 min-w-[16rem]">
                  target
                </th>
                <th className="px-2 py-2 text-left font-medium text-slate-700 whitespace-nowrap">
                  trad type
                </th>
                {langs.map((lang) => {
                  const p = langProgress[lang];
                  const authored = model.scenario.available_languages.includes(lang);
                  const released = model.scenario.validated_languages.includes(lang);
                  const isTarget = (model.scenario.target_languages ?? []).includes(lang);
                  return (
                    <th key={lang} className="px-2 py-2 text-left font-medium text-slate-700 align-top">
                      <div className="uppercase">
                        {lang}
                        {lang === sourceLang && (
                          <span className="ml-1 text-[10px] text-slate-400 normal-case">(source)</span>
                        )}
                      </div>
                      {p && p.total > 0 && (
                        <div className="text-[10px] font-normal text-slate-500 normal-case whitespace-nowrap">
                          {p.done}/{p.total}
                          {p.stale > 0 && <span className="text-orange-600"> · {p.stale} stale</span>}
                        </div>
                      )}
                      {model.scenario.gated && lang !== sourceLang && authored && !isTarget && (
                        <div
                          className="mt-1 text-[10px] font-normal text-slate-400 normal-case"
                          title="Not one of this scenario's target languages: it cannot be released. Add it under 'Available in' in the scenario editor."
                        >
                          not a target
                        </div>
                      )}
                      {model.scenario.gated && lang !== sourceLang && authored && isTarget && (
                        <button
                          type="button"
                          onClick={() => void toggleValidation(lang)}
                          disabled={busy}
                          title={
                            released
                              ? 'Released to licensees. Click to withdraw (back to draft).'
                              : 'Draft: admins and tester licensees only. Click to release to licensees.'
                          }
                          className={`mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium normal-case border disabled:opacity-50 ${
                            released
                              ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                              : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {released ? '✓ Validated' : '✎ Draft'}
                        </button>
                      )}
                      {model.scenario.gated && lang === sourceLang && (
                        <div className="mt-1 text-[10px] font-normal text-green-700 normal-case">always released</div>
                      )}
                    </th>
                  );
                })}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const index = rows.indexOf(row);
                const source = row.values[sourceLang] ?? '';
                const srcTokens = tokensOf(source);
                return (
                  <tr key={`${row.rowId}-${index}`} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-2 sticky left-0 bg-white min-w-[16rem]">
                      <div className="font-medium text-slate-800 break-all">{row.target}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {row.targetType}
                        {srcTokens.length > 0 && (
                          <span className="ml-2 font-mono text-indigo-600">
                            {Array.from(new Set(srcTokens)).join(' ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-[11px] text-slate-500 whitespace-nowrap">
                      {row.tradType}
                    </td>
                    {langs.map((lang) => {
                      const value = row.values[lang] ?? '';
                      const readOnly = lang === sourceLang && row.sourceReadOnly;
                      const status =
                        lang === sourceLang
                          ? 'ok'
                          : cellStatus(source, value || undefined, row.hashes[lang]);
                      const tokenMismatch =
                        lang !== sourceLang &&
                        value !== '' &&
                        tokensOf(value).join('|') !== srcTokens.join('|');
                      return (
                        <td key={lang} className="px-1 py-1">
                          <textarea
                            rows={2}
                            value={value}
                            readOnly={readOnly}
                            onChange={(e) => setCell(index, lang, e.target.value)}
                            dir={LANGUAGES[lang]?.dir ?? 'ltr'}
                            className={`w-56 px-2 py-1 border rounded text-sm resize-y ${
                              readOnly
                                ? 'bg-slate-50 text-slate-600 border-slate-200'
                                : status === 'new'
                                  ? 'border-amber-300 bg-amber-50'
                                  : status === 'stale'
                                    ? 'border-orange-400 bg-orange-50'
                                    : 'border-slate-300'
                            }`}
                          />
                          {!readOnly && status !== 'ok' && (
                            <div
                              className={`text-[10px] mt-0.5 ${
                                status === 'new' ? 'text-amber-600' : 'text-orange-600'
                              }`}
                            >
                              {status.toUpperCase()}
                            </div>
                          )}
                          {tokenMismatch && (
                            <div className="text-[10px] mt-0.5 text-red-600">
                              tokens differ from source
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2">
                      {row.tradType === 'text' && (
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          title="Remove this line"
                          className="p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* bulk paste, per file */}
      {model && filter !== 'fields' && model.files.filter((f) => f.parent_file_id === null).length > 0 && (
        <div className="mt-4 space-y-2">
          {model.files
            .filter((f) => f.parent_file_id === null)
            .map((file) => (
              <div key={file.id} className="border border-slate-200 rounded p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-700">
                    <span className="font-medium">{file.name}</span>
                    <span className="text-slate-500">
                      {' '}
                      · {rows.filter((r) => r.fileId === file.id && r.tradType === 'text').length}{' '}
                      in-document string(s)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPasteFor(pasteFor === file.id ? null : file.id);
                      setPasteText('');
                    }}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-md text-sm hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Add strings
                  </button>
                </div>
                {pasteFor === file.id && (
                  <div className="mt-2">
                    <textarea
                      rows={5}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={`Paste the ${sourceLang.toUpperCase()} strings printed in this document, one per line.`}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={addPastedTexts}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                      >
                        Add to grid
                      </button>
                      <button
                        type="button"
                        onClick={() => setPasteFor(null)}
                        className="px-3 py-1.5 border border-slate-300 rounded-md text-sm hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-3">
        Saving writes scenario fields back into the same localized maps the scenario editor uses,
        bumps the scenario version and re-hashes it, so field devices pick the change up on their
        next sync. File titles and in-document strings are stored alongside the file.
      </p>
    </div>
  );
}
