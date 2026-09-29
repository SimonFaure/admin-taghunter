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
import { cellStatus, fnv1a } from '../../../i18n/translatorXlsx';
import {
  buildScenarioRows,
  applyScenarioRows,
  type ScenarioTransRow,
  type FieldPatch,
  type TextPatch,
} from '../../../i18n/scenarioTranslationRows';
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
  unmatched: { target: string; reason: string }[];
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
        const built = buildScenarioRows({
          scenario: next.scenario,
          gameMeta: next.gameMeta,
          files: next.files,
        });
        // Field rows carry their staleness hashes in the scenario's
        // translation_meta column; file rows carry their own.
        for (const row of built) {
          if (row.tradType === 'field' && row.path) {
            row.hashes = (next.translationMeta[row.path] ?? {}) as ScenarioTransRow['hashes'];
          }
        }
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
          ? `\n\nStill ${p.empty} empty and ${p.stale} stale of ${p.total} texts - clients will see the ${sourceLang.toUpperCase()} text (or nothing) there.`
          : '';
      if (
        !window.confirm(
          `Release ${lang.toUpperCase()} of "${model.scenario.title}" to clients and playgrounds?${gaps}`,
        )
      ) {
        return;
      }
    } else if (
      !window.confirm(
        `Withdraw ${lang.toUpperCase()} of "${model.scenario.title}"? Clients lose it on their next sync, and ${lang.toUpperCase()}-language clients lose the scenario from their catalogue.`,
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
          ? `${lang.toUpperCase()} withdrawn - back to draft, admins and tester clients only.`
          : `${lang.toUpperCase()} validated - released to clients on their next sync.`,
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
      const patches: FieldPatch[] = [];
      const stamps: { path: string; lang: Lang; hash: string }[] = [];
      const titleEdits = new Map<number, { values: Record<string, string>; hashes: Record<string, string> }>();
      const textEdits = new Map<number, TextPatch[]>();
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
      const allTextsByFile = new Map<
        number,
        { id?: number; position: number; source_text: string; values: Record<string, string>; hashes: Record<string, string> }[]
      >();

      for (const fileId of touchedFiles) {
        const titleRow = rows.find((r) => r.fileId === fileId && r.tradType === 'file title');
        if (titleRow) {
          const values: Record<string, string> = {};
          const hashes: Record<string, string> = { ...(titleRow.hashes as Record<string, string>) };
          const src = titleRow.values[sourceLang] ?? '';
          for (const lang of langs) {
            const v = titleRow.values[lang] ?? '';
            if (v !== '') values[lang] = v;
            if (lang !== sourceLang && v !== '' && v !== (baseline.find((b) => b.rowId === titleRow.rowId)?.values[lang] ?? '')) {
              hashes[lang] = fnv1a(src);
            }
          }
          titleEdits.set(fileId, { values, hashes });
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
            return {
              id: r.textId,
              position,
              source_text: src,
              values,
              hashes,
            };
          });
        allTextsByFile.set(fileId, list);
        textEdits.set(fileId, []);
      }

      const version = await api.save({
        uniqid: model.scenario.uniqid,
        baseVersion: model.scenario.version,
        patches,
        stamps,
        fileTitles: titleEdits,
        fileTexts: textEdits,
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

  const handleImportFile = async (file: File) => {
    if (!model) return;
    setBusy(true);
    setMessage(null);
    try {
      const isXlsx = /\.xlsx$/i.test(file.name);
      const imported = isXlsx
        ? await fromXlsx(await file.arrayBuffer(), langs)
        : fromCsv(await file.text(), langs);

      if (imported.length === 0) {
        setMessage({ type: 'error', text: 'No usable rows found in that file.' });
        return;
      }

      // Rows for other scenarios are ignored rather than mis-applied: the sheet
      // may legitimately hold a whole game type's export.
      const mine = imported.filter(
        (r) => !r.scenarioUniqid || r.scenarioUniqid === model.scenario.uniqid,
      );
      const foreign = imported.length - mine.length;

      const result = applyScenarioRows(mine, rows, { sourceLang, langs });

      const summary =
        `${result.counts.updated} updated · ${result.counts.created} new text row(s) · ` +
        `${result.counts.unmatched} unmatched · ${result.counts.ignored} ignored` +
        (foreign ? ` · ${foreign} row(s) for other scenarios skipped` : '');

      setDryRun({
        summary,
        unmatched: result.unmatched.map((u) => ({ target: u.row.target, reason: u.reason })),
        apply: async () => {
          // Fold the parsed values into the in-memory grid, then reuse the
          // normal save path so import and hand-editing cannot diverge.
          setRows((prev) => {
            const next = prev.slice();
            const indexByRowId = new Map(next.map((r, i) => [r.rowId, i]));
            const indexByPath = new Map(
              next.map((r, i) => [r.tradType === 'field' ? r.path ?? '' : '', i]),
            );
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
              const i = next.findIndex(
                (r) => r.tradType === 'text' && r.fileId === t.fileId && r.textId === t.textId,
              );
              if (i < 0) continue;
              next[i] = { ...next[i], values: { ...next[i].values, ...t.values } };
            }
            for (const c of result.created) {
              const fileRow = next.find((r) => r.fileId === c.fileId);
              next.push({
                scenarioUniqid: model.scenario.uniqid,
                gameType: model.scenario.game_type,
                scenarioName: model.scenario.title,
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
          });
          setDryRun(null);
          setMessage({
            type: 'info',
            text: 'Imported into the grid. Review the highlighted cells, then Save to persist.',
          });
        },
      });
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message || 'Import failed.' });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
            (admins and tester clients only) until you mark it{' '}
            <span className="font-medium">✓ Validated</span> in its column header.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
            disabled={!model || busy}
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
              className="px-3 py-1.5 bg-amber-600 text-white rounded-md text-sm hover:bg-amber-700"
            >
              Apply to grid
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
                      {model.scenario.gated && lang !== sourceLang && authored && (
                        <button
                          type="button"
                          onClick={() => void toggleValidation(lang)}
                          disabled={busy}
                          title={
                            released
                              ? 'Released to clients. Click to withdraw (back to draft).'
                              : 'Draft: admins and tester clients only. Click to release to clients.'
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
