/**
 * The Translations page's "Video subtitles" tab.
 *
 * One row per scenario, one column per language: which `.vtt` tracks the
 * scenario's intro video has, with upload / replace / remove per cell, a ZIP
 * export of every track, and a bulk import that recognises the scenario and
 * the language of each file from its name (see subtitleFileNames.ts).
 *
 * Writes go through scenario_subtitles.php into the same slot the scenario
 * editor's subtitle card uses, so both stay in step.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload, Search, Loader2, Trash2, Plus, Eye, AlertTriangle } from 'lucide-react';
import { LANGUAGES, SUPPORTED_LANGS, CLIENT_LANGS, type Lang } from '../../../i18n/languages';
import { getMediaUrl } from '../../../creator-ported/utils/mediaUrl';
import { useVideoSubtitles, type SubtitleScenarioRow } from './useVideoSubtitles';
import { guessSubtitle, isSubtitleFileName, toWebVtt, slugify } from './subtitleFileNames';

interface PendingFile {
  key: string;
  name: string;
  vtt: string | null;
  uniqid: string;
  lang: Lang | '';
  scenarioBy: 'uniqid' | 'title' | 'manual' | null;
  langBy: 'name' | 'header' | 'manual' | null;
  include: boolean;
  /** Set after the apply step. */
  result?: 'ok' | string;
}

const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const isLang = (l: string): l is Lang => (SUPPORTED_LANGS as readonly string[]).includes(l);

/** Unpack dropped/picked files: subtitles as-is, ZIPs expanded (flat or nested). */
async function readInputs(files: File[]): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(await f.arrayBuffer());
      const entries = Object.values(zip.files).filter(
        (e) => !e.dir && isSubtitleFileName(e.name) && !e.name.startsWith('__MACOSX/'),
      );
      for (const e of entries) out.push({ name: e.name, text: await e.async('string') });
    } else if (isSubtitleFileName(f.name)) {
      out.push({ name: f.name, text: await f.text() });
    }
  }
  return out;
}

export default function VideoSubtitlesPanel() {
  const api = useVideoSubtitles();
  const [scenarios, setScenarios] = useState<SubtitleScenarioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [videoOnly, setVideoOnly] = useState(true);
  const [showAllLangs, setShowAllLangs] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [pending, setPending] = useState<PendingFile[] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const cellInputRef = useRef<HTMLInputElement>(null);
  const cellTarget = useRef<{ uniqid: string; lang: Lang } | null>(null);

  const reload = useCallback(async () => {
    try {
      setScenarios(await api.list());
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    }
  }, [api]);

  useEffect(() => {
    void reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byUniqid = useMemo(() => new Map(scenarios.map((s) => [s.uniqid, s])), [scenarios]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scenarios.filter((s) => {
      const hasTracks = Object.keys(s.tracks).length > 0;
      if (videoOnly && !s.video && !hasTracks) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.game_type.toLowerCase().includes(q) ||
        s.uniqid.toLowerCase().includes(q)
      );
    });
  }, [scenarios, query, videoOnly]);

  /** Client languages, plus any language a visible scenario uses or has a track in. */
  const langs: Lang[] = useMemo(() => {
    if (showAllLangs) return [...SUPPORTED_LANGS];
    const set = new Set<Lang>(CLIENT_LANGS);
    for (const s of visible) {
      for (const l of [...s.available_languages, ...s.target_languages, ...Object.keys(s.tracks)]) {
        if (isLang(l)) set.add(l);
      }
    }
    return SUPPORTED_LANGS.filter((l) => set.has(l));
  }, [visible, showAllLangs]);

  /** Languages a scenario is expected to have a track in. */
  const expected = (s: SubtitleScenarioRow): Set<string> =>
    new Set([...s.available_languages, ...s.target_languages]);

  const totals = useMemo(() => {
    let tracks = 0;
    let missing = 0;
    for (const s of visible) {
      tracks += Object.keys(s.tracks).length;
      if (!s.video) continue;
      for (const l of expected(s)) if (!s.tracks[l as Lang]) missing++;
    }
    return { tracks, missing };
  }, [visible]);

  /* ------------------------------ single cell ------------------------------ */

  const pickFor = (uniqid: string, lang: Lang) => {
    cellTarget.current = { uniqid, lang };
    cellInputRef.current?.click();
  };

  const uploadCell = async (file: File) => {
    const target = cellTarget.current;
    if (!target) return;
    const vtt = toWebVtt(file.name, await file.text());
    if (vtt === null) {
      setMessage({ type: 'error', text: `${file.name}: not a WebVTT (.vtt) or SubRip (.srt) file.` });
      return;
    }
    setBusy(`${target.uniqid}:${target.lang}`);
    setMessage(null);
    try {
      await api.upload(target.uniqid, target.lang, new Blob([vtt], { type: 'text/vtt' }), 'track.vtt');
      await reload();
      setMessage({
        type: 'success',
        text: `${target.lang.toUpperCase()} subtitles saved for "${byUniqid.get(target.uniqid)?.title ?? target.uniqid}".`,
      });
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const removeCell = async (s: SubtitleScenarioRow, lang: Lang) => {
    if (!window.confirm(`Remove the ${lang.toUpperCase()} subtitles of "${s.title}"?`)) return;
    setBusy(`${s.uniqid}:${lang}`);
    setMessage(null);
    try {
      await api.remove(s.uniqid, lang);
      await reload();
      setMessage({ type: 'success', text: `${lang.toUpperCase()} subtitles removed from "${s.title}".` });
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  /* --------------------------------- export -------------------------------- */

  const handleExport = async () => {
    setBusy('export');
    setMessage(null);
    try {
      // With a search active, export what is listed; otherwise everything.
      const blob = await api.exportZip(query.trim() ? visible.map((s) => s.uniqid) : undefined);
      download(blob, `scenario-subtitles-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  /* --------------------------------- import -------------------------------- */

  const startImport = async (files: File[]) => {
    setMessage(null);
    setBusy('import');
    try {
      const inputs = await readInputs(files);
      if (inputs.length === 0) {
        setMessage({ type: 'error', text: 'No .vtt, .srt or .zip of subtitles found in the selection.' });
        return;
      }
      const refs = scenarios.map((s) => ({ uniqid: s.uniqid, title: s.title }));
      setPending(
        inputs.map((f, i) => {
          const g = guessSubtitle(f.name, f.text, refs);
          const vtt = toWebVtt(f.name, f.text);
          return {
            key: `${i}:${f.name}`,
            name: f.name,
            vtt,
            uniqid: g.uniqid ?? '',
            lang: g.lang ?? '',
            scenarioBy: g.scenarioBy,
            langBy: g.langBy,
            include: vtt !== null && g.uniqid !== null && g.lang !== null,
          };
        }),
      );
    } catch (e) {
      setMessage({ type: 'error', text: (e as Error).message || 'Could not read the files.' });
    } finally {
      setBusy(null);
      if (importRef.current) importRef.current.value = '';
    }
  };

  const editPending = (key: string, patch: Partial<PendingFile>) =>
    setPending((list) => list?.map((p) => (p.key === key ? { ...p, ...patch, result: undefined } : p)) ?? null);

  /** Two files aimed at the same scenario+language: only the last one would stick. */
  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of pending ?? []) {
      if (!p.include || !p.uniqid || !p.lang) continue;
      const k = `${p.uniqid}:${p.lang}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [pending]);

  const ready = (p: PendingFile) => p.include && p.vtt !== null && p.uniqid !== '' && p.lang !== '';
  const readyCount = (pending ?? []).filter(ready).length;

  const applyImport = async () => {
    if (!pending) return;
    if (duplicates.size > 0) {
      setMessage({ type: 'error', text: 'Several files target the same scenario and language - untick or reassign them first.' });
      return;
    }
    setBusy('apply');
    setMessage(null);
    let ok = 0;
    let failed = 0;
    const next = pending.slice();
    for (let i = 0; i < next.length; i++) {
      const p = next[i];
      if (!ready(p) || p.result === 'ok') continue;
      try {
        await api.upload(p.uniqid, p.lang as Lang, new Blob([p.vtt!], { type: 'text/vtt' }), 'track.vtt');
        next[i] = { ...p, result: 'ok' };
        ok++;
      } catch (e) {
        next[i] = { ...p, result: (e as Error).message };
        failed++;
      }
      setPending(next.slice());
    }
    await reload();
    setBusy(null);
    if (failed === 0) {
      setPending(null);
      setMessage({ type: 'success', text: `Imported ${ok} subtitle file(s).` });
    } else {
      setMessage({ type: 'error', text: `Imported ${ok}, ${failed} failed - see the list.` });
    }
  };

  /* --------------------------------- render -------------------------------- */

  if (loading) return <div className="p-6 text-slate-600">Loading scenarios…</div>;

  return (
    <div
      className={`p-6 max-w-full ${dragOver ? 'outline-2 outline-dashed outline-blue-400 -outline-offset-8' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) void startImport(files);
      }}
    >
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Video subtitles</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-3xl">
            Subtitle tracks (<span className="font-mono">.vtt</span>) of each scenario&apos;s intro video, per
            language. Highlighted empty cells are languages the scenario exists in but has no subtitles for.
            Import accepts <span className="font-mono">.vtt</span>, <span className="font-mono">.srt</span> or a{' '}
            <span className="font-mono">.zip</span> of them (or drop them on this page): the scenario and the
            language are read from each file name, e.g.{' '}
            <span className="font-mono">mission-antidote__6501beca30f54.en.vtt</span> or{' '}
            <span className="font-mono">Mission Antidote - anglais.srt</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={busy !== null || totals.tracks === 0}
            className="px-3 py-2 border border-slate-300 rounded-md hover:bg-slate-50 text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
            title={query.trim() ? 'Tracks of the scenarios listed below' : 'Every subtitle track'}
          >
            {busy === 'export' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export ZIP ({totals.tracks})
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            disabled={busy !== null}
            className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm inline-flex items-center gap-1.5"
          >
            {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Import subtitles
          </button>
          <input
            ref={importRef}
            type="file"
            multiple
            accept=".vtt,.srt,.zip,text/vtt"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) void startImport(files);
            }}
          />
          <input
            ref={cellInputRef}
            type="file"
            accept=".vtt,.srt,text/vtt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadCell(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>

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
        <label className="text-sm text-slate-600 inline-flex items-center gap-1.5">
          <input type="checkbox" checked={videoOnly} onChange={(e) => setVideoOnly(e.target.checked)} />
          only scenarios with a video
        </label>
        <label className="text-sm text-slate-600 inline-flex items-center gap-1.5">
          <input type="checkbox" checked={showAllLangs} onChange={(e) => setShowAllLangs(e.target.checked)} />
          show all {SUPPORTED_LANGS.length} languages
        </label>
        <span className="text-sm text-slate-500">
          {visible.length} scenario(s) · {totals.tracks} track(s)
          {totals.missing > 0 && <span className="text-amber-700"> · {totals.missing} expected track(s) missing</span>}
        </span>
      </div>

      {message && (
        <div
          className={`mb-4 px-4 py-2 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : message.type === 'info'
                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {pending && (
        <div className="mb-4 p-4 rounded-md border border-amber-300 bg-amber-50">
          <div className="font-medium text-amber-900 mb-1">Import preview</div>
          <div className="text-sm text-amber-900 mb-2">
            {pending.length} file(s) · {readyCount} ready. Check the scenario and language of each file; change
            them where the name was not enough.
          </div>
          <div className="overflow-x-auto max-h-96 overflow-y-auto bg-white border border-amber-200 rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-amber-100/60 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5" />
                  <th className="px-2 py-1.5 text-left font-medium text-slate-700">file</th>
                  <th className="px-2 py-1.5 text-left font-medium text-slate-700">scenario</th>
                  <th className="px-2 py-1.5 text-left font-medium text-slate-700">language</th>
                  <th className="px-2 py-1.5 text-left font-medium text-slate-700">result</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => {
                  const sc = p.uniqid ? byUniqid.get(p.uniqid) : undefined;
                  const replaces = sc && p.lang ? Boolean(sc.tracks[p.lang as Lang]) : false;
                  const dup = p.include && duplicates.has(`${p.uniqid}:${p.lang}`);
                  return (
                    <tr key={p.key} className="border-t border-amber-100 align-top">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={p.include}
                          disabled={p.vtt === null || busy === 'apply'}
                          onChange={(e) => editPending(p.key, { include: e.target.checked })}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs break-all max-w-[18rem]">
                        {p.name}
                        {p.vtt === null && (
                          <div className="text-red-600 font-sans">not a valid .vtt / .srt file</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={p.uniqid}
                          disabled={busy === 'apply'}
                          onChange={(e) =>
                            editPending(p.key, {
                              uniqid: e.target.value,
                              scenarioBy: 'manual',
                              include: p.vtt !== null && e.target.value !== '' && p.lang !== '',
                            })
                          }
                          className={`px-2 py-1 border rounded text-sm max-w-[20rem] ${
                            p.uniqid ? 'border-slate-300' : 'border-red-400 bg-red-50'
                          }`}
                        >
                          <option value="">— not recognised —</option>
                          {scenarios.map((s) => (
                            <option key={s.uniqid} value={s.uniqid}>
                              {s.game_type} · {s.title}
                              {s.video ? '' : ' (no video)'}
                            </option>
                          ))}
                        </select>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {p.scenarioBy === 'uniqid'
                            ? 'matched by id'
                            : p.scenarioBy === 'title'
                              ? 'matched by title'
                              : p.scenarioBy === 'manual'
                                ? 'set by hand'
                                : ''}
                          {sc && !sc.video && <span className="text-amber-700"> · this scenario has no video</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          value={p.lang}
                          disabled={busy === 'apply'}
                          onChange={(e) =>
                            editPending(p.key, {
                              lang: e.target.value as Lang | '',
                              langBy: 'manual',
                              include: p.vtt !== null && p.uniqid !== '' && e.target.value !== '',
                            })
                          }
                          className={`px-2 py-1 border rounded text-sm ${
                            p.lang ? 'border-slate-300' : 'border-red-400 bg-red-50'
                          }`}
                        >
                          <option value="">—</option>
                          {SUPPORTED_LANGS.map((l) => (
                            <option key={l} value={l}>
                              {l.toUpperCase()} · {LANGUAGES[l].nativeName}
                            </option>
                          ))}
                        </select>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {p.langBy === 'name'
                            ? 'from the file name'
                            : p.langBy === 'header'
                              ? 'from the file header'
                              : p.langBy === 'manual'
                                ? 'set by hand'
                                : ''}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                        {p.result === 'ok' ? (
                          <span className="text-green-700">saved</span>
                        ) : p.result ? (
                          <span className="text-red-600 whitespace-normal">{p.result}</span>
                        ) : dup ? (
                          <span className="text-red-600">same scenario + language twice</span>
                        ) : ready(p) ? (
                          <span className={replaces ? 'text-orange-700' : 'text-slate-600'}>
                            {replaces ? 'will replace' : 'will add'}
                          </span>
                        ) : (
                          <span className="text-slate-400">skipped</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => void applyImport()}
              disabled={busy !== null || readyCount === 0 || duplicates.size > 0}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-md text-sm hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {busy === 'apply' && <Loader2 className="w-4 h-4 animate-spin" />}
              Import {readyCount} file(s)
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={busy === 'apply'}
              className="px-3 py-1.5 border border-amber-300 rounded-md text-sm hover:bg-amber-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="text-slate-500 text-sm border border-dashed border-slate-300 rounded p-8 text-center">
          {videoOnly ? 'No scenario with an intro video matches.' : 'No scenario matches.'}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-700 sticky left-0 bg-slate-50 min-w-[18rem]">
                  scenario
                </th>
                {langs.map((l) => (
                  <th key={l} className="px-2 py-2 text-center font-medium text-slate-700 uppercase" title={LANGUAGES[l].nativeName}>
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const exp = expected(s);
                return (
                  <tr key={s.uniqid} className="border-t border-slate-200">
                    <td className="px-3 py-2 sticky left-0 bg-white min-w-[18rem]">
                      <div className="font-medium text-slate-800">{s.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                        <span>{s.game_type}</span>
                        <span className="font-mono">{s.uniqid}</span>
                        <span className="uppercase">source {s.default_language}</span>
                        {!s.video ? (
                          <span className="text-amber-700">no video</span>
                        ) : !s.video_exists ? (
                          <span className="text-red-600">video file missing</span>
                        ) : null}
                      </div>
                    </td>
                    {langs.map((l) => {
                      const track = s.tracks[l];
                      const cellBusy = busy === `${s.uniqid}:${l}`;
                      const wanted = exp.has(l) && Boolean(s.video);
                      if (track) {
                        return (
                          <td key={l} className="px-1.5 py-1.5 text-center">
                            <div
                              className={`inline-flex items-center gap-0.5 rounded border px-1 py-0.5 ${
                                track.exists ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                              }`}
                              title={`${track.file}${track.exists ? ` · ${Math.max(1, Math.round(track.size / 1024))} KB` : ' · FILE MISSING'}`}
                            >
                              {cellBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
                              ) : !track.exists ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                              ) : (
                                <a
                                  href={getMediaUrl(s.uniqid, track.file)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-0.5 text-green-700 hover:text-green-900"
                                  title="Open the .vtt"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => pickFor(s.uniqid, l)}
                                disabled={busy !== null}
                                className="p-0.5 text-slate-500 hover:text-blue-700 disabled:opacity-40"
                                title="Replace"
                              >
                                <Upload className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void removeCell(s, l)}
                                disabled={busy !== null}
                                className="p-0.5 text-slate-500 hover:text-red-600 disabled:opacity-40"
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        );
                      }
                      return (
                        <td key={l} className="px-1.5 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => pickFor(s.uniqid, l)}
                            disabled={busy !== null}
                            className={`inline-flex items-center justify-center w-8 h-7 rounded border disabled:opacity-40 ${
                              wanted
                                ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                : 'border-dashed border-slate-300 text-slate-400 hover:text-blue-700 hover:border-blue-300'
                            }`}
                            title={
                              wanted
                                ? `Missing: the scenario exists in ${l.toUpperCase()}. Upload subtitles`
                                : 'Upload subtitles'
                            }
                          >
                            {cellBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-3">
        Each change is saved immediately into the scenario (the same slot as the subtitles card in the scenario
        editor), bumps its version and re-hashes it, so devices pick the track up on their next sync. Reload any
        scenario editor left open on a scenario you changed here before saving it, or its save will drop the track.
        Export file names follow <span className="font-mono">{slugify('Scenario title')}__&lt;id&gt;.&lt;lang&gt;.vtt</span>.
      </p>
    </div>
  );
}
