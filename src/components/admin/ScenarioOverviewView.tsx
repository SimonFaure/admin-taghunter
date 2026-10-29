/**
 * Scenario overview - the production checklist.
 *
 * One row per scenario: game settings, media, texts, required documents,
 * cover, video and subtitles, and the translations into the scenario's target
 * languages - plus the "fully finished" tick. Clicking a count opens the
 * detail of what is left to do (`ScenarioChecklistModal`). Read-only apart
 * from the tick: every gap is fixed in the scenario editor or on the
 * Translations page.
 *
 * What counts as mandatory is decided in `scenarioOverviewModel.ts`.
 *
 * Reached from the Scenarios page ("Scenario overview" button); rendered as a
 * hidden tab of the admin Dashboard (`scenario-overview`), no dedicated route.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Minus,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { LANGUAGES } from '../../i18n/languages';
import { getAdapter } from '../../scenarios/registry';
import '../../scenarios/bootstrap';
import {
  GROUP_LABELS,
  buildOverview,
  type ChecklistGroup,
  type FileLangCount,
  type GroupCount,
  type LangCount,
  type OverviewScenario,
  type ScenarioOverview,
} from './scenarioOverviewModel';
import { ScenarioChecklistModal } from './ScenarioChecklistModal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const PREFS_KEY = 'studioScenarioOverviewPrefs';

interface Prefs {
  hideFinished: boolean;
  includeLicensee: boolean;
}

const DEFAULT_PREFS: Prefs = { hideFinished: false, includeLicensee: false };

function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
    return { hideFinished: raw.hideFinished === true, includeLicensee: raw.includeLicensee === true };
  } catch {
    return DEFAULT_PREFS;
  }
}

type Tone = 'ok' | 'partial' | 'missing' | 'muted';

const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  missing: 'bg-rose-50 text-rose-700 border-rose-200',
  muted: 'bg-slate-50 text-slate-400 border-slate-200',
};

function Chip({ tone, title, children }: { tone: Tone; title?: string; children: React.ReactNode }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-semibold whitespace-nowrap tabular-nums ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

function Has({ value, label }: { value: boolean; label: string }) {
  return value ? (
    <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-label={`${label}: yes`} />
  ) : (
    <XCircle className="w-5 h-5 text-rose-500" aria-label={`${label}: missing`} />
  );
}

const NotApplicable = ({ title }: { title: string }) => (
  <span title={title} className="text-slate-300">
    <Minus className="w-4 h-4" aria-label={title} />
  </span>
);

const langName = (lang: string): string => LANGUAGES[lang as keyof typeof LANGUAGES]?.englishName ?? lang;

/** done/total chip: red when a critical item is missing, amber when partly done. */
const groupTone = (c: GroupCount): Tone => {
  if (c.total === 0) return 'muted';
  if (c.critical) return 'missing';
  return c.done < c.total ? 'partial' : 'ok';
};

const countTone = (c: LangCount): Tone => {
  if (c.total === 0) return 'muted';
  if (c.done === 0) return 'missing';
  return c.done < c.total || c.outdated > 0 ? 'partial' : 'ok';
};

const countTitle = (c: LangCount, what: string): string => {
  if (c.total === 0) return `No ${what} to translate`;
  const parts = [`${c.done} of ${c.total} ${what} translated into ${langName(c.lang)}`];
  if (c.outdated > 0) parts.push(`${c.outdated} outdated (the source text changed since)`);
  return parts.join(' - ');
};

function fileTone(f: FileLangCount): Tone {
  const stringsDone = f.strings.done >= f.strings.total && f.strings.outdated === 0;
  if (f.editions >= f.documents && stringsDone) return 'ok';
  return f.editions === 0 && f.strings.done === 0 ? 'missing' : 'partial';
}

function fileTitle(f: FileLangCount): string {
  const parts = [`${f.editions} of ${f.documents} document(s) have a ${langName(f.lang)} edition`];
  if (f.missing.length > 0) parts.push(`Missing: ${f.missing.join(', ')}`);
  if (f.strings.total > 0) parts.push(countTitle(f.strings, 'file titles/texts'));
  return parts.join('\n');
}

const formatDate = (raw: string | null): string => {
  if (!raw) return '';
  const d = new Date(raw.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString();
};

export function ScenarioOverviewView({ onBack }: { onBack: () => void }) {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [scenarios, setScenarios] = useState<OverviewScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [gameType, setGameType] = useState('all');
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  // Scenarios whose Documents count is expanded into the list of file names.
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());
  // The scenario whose "what is left" detail is open, and the group to land on.
  const [detail, setDetail] = useState<{ uniqid: string; group?: ChecklistGroup } | null>(null);

  const toggleFiles = (uniqid: string) => {
    setOpenFiles((prev) => {
      const next = new Set(prev);
      if (!next.delete(uniqid)) next.add(uniqid);
      return next;
    });
  };

  const updatePrefs = (patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['X-Auth-Token'] = token;
      const res = await fetch(`${API_BASE_URL}/scenario_overview.php${path}`, { ...init, headers });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.message || json?.error || `Request failed (${res.status})`);
      return json;
    },
    [token],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await call('?action=list');
      setScenarios(json.scenarios ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const overviews = useMemo(() => scenarios.map((s) => buildOverview(s)), [scenarios]);

  const gameTypes = useMemo(
    () => Array.from(new Set(scenarios.map((s) => s.game_type).filter(Boolean))).sort(),
    [scenarios],
  );
  const gameTypeLabel = (kind: string) => getAdapter(kind)?.label ?? kind;

  const inScope = useMemo(
    () => overviews.filter((o) => prefs.includeLicensee || o.product),
    [overviews, prefs.includeLicensee],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope.filter((o) => {
      const s = o.scenario;
      // A finished scenario with something missing again stays in sight.
      if (prefs.hideFinished && s.finished_at && o.todo.length === 0) return false;
      if (gameType !== 'all' && s.game_type !== gameType) return false;
      if (q && !s.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inScope, prefs.hideFinished, gameType, query]);

  const products = inScope.filter((o) => o.product);
  const finishedCount = products.filter((o) => o.scenario.finished_at).length;
  const detailOverview = detail ? overviews.find((o) => o.scenario.uniqid === detail.uniqid) : undefined;

  const openEditor = (uniqid: string) =>
    navigate(`/studio/scenarios/${uniqid}`, { state: { backTab: 'scenario-overview' } });

  const toggleFinished = async (o: ScenarioOverview) => {
    const s = o.scenario;
    const finished = !s.finished_at;
    if (finished && o.todo.length > 0) {
      const lines = o.todo.slice(0, 15).map((i) => {
        const where = i.group === 'translations' && i.lang ? `${i.lang.toUpperCase()} - ` : '';
        return `- ${i.critical ? '[CRITICAL] ' : ''}${where}${i.label}`;
      });
      if (o.todo.length > lines.length) lines.push(`... and ${o.todo.length - lines.length} more`);
      const ok = window.confirm(
        `Mark "${s.title}" as fully finished?\n\nStill left to do (${o.todo.length}):\n${lines.join('\n')}`,
      );
      if (!ok) return;
    }
    setBusy(s.uniqid);
    setError(null);
    try {
      const json = await call('?action=set_finished', {
        method: 'POST',
        body: JSON.stringify({ uniqid: s.uniqid, finished, user_email: user?.email }),
      });
      setScenarios((list) =>
        list.map((row) =>
          row.uniqid === s.uniqid
            ? { ...row, finished_at: json.finished_at ?? null, finished_by: json.finished_by ?? null }
            : row,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const th = 'px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap';
  const td = 'px-3 py-3 align-top';
  const COLUMNS = 11;

  /** A group's done/total, opening the detail on that group. */
  const groupCell = (o: ScenarioOverview, group: ChecklistGroup) => {
    const count = o.groups[group];
    if (count.total === 0) return <NotApplicable title={`Nothing to check for ${GROUP_LABELS[group]}`} />;
    const left = count.total - count.done;
    return (
      <button
        type="button"
        onClick={() => setDetail({ uniqid: o.scenario.uniqid, group })}
        className="rounded hover:ring-2 hover:ring-slate-200 transition-shadow"
      >
        <Chip
          tone={groupTone(count)}
          title={
            (left === 0 ? `${GROUP_LABELS[group]}: all done` : `${GROUP_LABELS[group]}: ${left} left`) +
            (count.critical ? ' - a critical item is missing' : '') +
            ' - click for the detail'
          }
        >
          {count.done}/{count.total}
        </Chip>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Scenarios
          </button>
          <p className="text-slate-600">
            {visible.length} {visible.length === 1 ? 'scenario' : 'scenarios'}
            {' · '}
            {finishedCount} of {products.length} finished
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          title="Reload the overview"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a scenario"
            className="pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700 w-56"
          />
        </div>
        <select
          value={gameType}
          onChange={(e) => setGameType(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white text-slate-700"
          aria-label="Game type"
        >
          <option value="all">All game types</option>
          {gameTypes.map((kind) => (
            <option key={kind} value={kind}>
              {gameTypeLabel(kind)}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={prefs.hideFinished}
            onChange={(e) => updatePrefs({ hideFinished: e.target.checked })}
          />
          Hide finished
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={prefs.includeLicensee}
            onChange={(e) => updatePrefs({ includeLicensee: e.target.checked })}
          />
          Include licensee-authored
        </label>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-700">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className={th}>Scenario</th>
                <th className={th}>Settings</th>
                <th className={th}>Media</th>
                <th className={th}>Texts</th>
                <th className={th}>Documents</th>
                <th className={th}>Cover</th>
                <th className={th}>Video</th>
                <th className={th}>File translations</th>
                <th className={th}>In-game texts</th>
                <th className={th}>Released</th>
                <th className={th}>Finished</th>
              </tr>
            </thead>
            <tbody>
              {loading && scenarios.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS} className="px-4 py-12 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                    Loading…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS} className="px-4 py-12 text-center text-sm text-slate-500">
                    No scenario matches these filters.
                  </td>
                </tr>
              ) : (
                visible.map((o) => {
                  const s = o.scenario;
                  const finished = !!s.finished_at;
                  const left = o.todo.length;
                  const regressed = finished && left > 0;
                  const filesOpen = openFiles.has(s.uniqid);
                  return (
                    <tr
                      key={s.uniqid}
                      className={`border-b border-slate-100 last:border-0 ${
                        regressed ? 'bg-amber-50/50' : finished ? 'bg-emerald-50/40' : ''
                      }`}
                    >
                      <td className={`${td} min-w-[200px]`}>
                        <button
                          type="button"
                          onClick={() => openEditor(s.uniqid)}
                          className="text-sm font-semibold text-slate-900 hover:text-blue-700 text-left"
                          title="Open in the scenario editor"
                        >
                          {s.title || '(untitled)'}
                        </button>
                        <div className="mt-1 flex items-center gap-1.5 flex-wrap text-xs text-slate-500">
                          <span>{gameTypeLabel(s.game_type)}</span>
                          <span>·</span>
                          <span className={s.status === 'published' ? 'text-emerald-700' : 'text-amber-700'}>
                            {s.status ?? 'draft'}
                          </span>
                          <span>·</span>
                          <span
                            className="uppercase"
                            title={
                              o.product
                                ? `Written in ${langName(o.sourceLang)}; target languages: ${[o.sourceLang, ...o.targets]
                                    .map(langName)
                                    .join(', ')}`
                                : "The scenario's own language"
                            }
                          >
                            {[o.sourceLang, ...o.targets].join(' › ')}
                          </span>
                          {!o.product && (
                            <>
                              <span>·</span>
                              <span>{s.client_name ?? `Licensee #${s.client_id}`}</span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className={td}>{groupCell(o, 'settings')}</td>
                      <td className={td}>{groupCell(o, 'media')}</td>
                      <td className={td}>{groupCell(o, 'texts')}</td>

                      <td className={td}>
                        {o.documents === 0 && o.requiredDocuments.total === 0 ? (
                          <NotApplicable title="No files attached" />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleFiles(s.uniqid)}
                              aria-expanded={filesOpen}
                              className="rounded hover:ring-2 hover:ring-slate-200 transition-shadow"
                            >
                              <Chip
                                tone={o.product ? groupTone(o.requiredDocuments) : 'muted'}
                                title={
                                  (o.product
                                    ? `${o.requiredDocuments.done} of ${o.requiredDocuments.total} required document(s) present - `
                                    : '') + `${o.documents} file(s) attached - click to see them`
                                }
                              >
                                {o.product ? `${o.requiredDocuments.done}/${o.requiredDocuments.total}` : o.documents}
                                {filesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </Chip>
                            </button>
                            {filesOpen && (
                              <ul className="mt-2 space-y-1.5 min-w-[220px]">
                                {o.items
                                  .filter((i) => i.group === 'documents' && !i.ok)
                                  .map((i, idx) => (
                                    <li key={`m${idx}`} className="text-xs text-rose-700">
                                      {i.label.replace(' is required', '')}: missing
                                    </li>
                                  ))}
                                {o.documentList.map((d, i) => (
                                  <li key={i} className="text-xs text-slate-700">
                                    <span className="break-words">{d.name}</span>
                                    <span className="ml-1.5 text-slate-500">{d.typeLabel}</span>
                                    <span className="ml-1.5 text-slate-400 uppercase">{d.langs.join(' · ')}</span>
                                    {d.noTranslation && (
                                      <span className="ml-1.5 text-slate-400">(no translation needed)</span>
                                    )}
                                  </li>
                                ))}
                                {o.documentList.length === 0 && (
                                  <li className="text-xs text-slate-400">No file attached.</li>
                                )}
                              </ul>
                            )}
                          </>
                        )}
                      </td>

                      <td className={td}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Has value={s.cover} label="Game cover visual" />
                          {o.targets.map((lang) => {
                            const has = s.cover_langs.includes(lang);
                            if (!has && !s.cover_has_text) return null;
                            return (
                              <Chip
                                key={lang}
                                tone={has ? 'ok' : 'missing'}
                                title={
                                  has
                                    ? `${langName(lang)} uses the "other languages" version of the cover`
                                    : `The cover contains text: no version for ${langName(lang)}`
                                }
                              >
                                {lang.toUpperCase()}
                              </Chip>
                            );
                          })}
                        </div>
                      </td>

                      <td className={td}>
                        {!s.video ? (
                          <NotApplicable title="No video (optional)" />
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Has value label="Video" />
                            {[o.sourceLang, ...o.targets].map((lang) => {
                              const has = s.subtitle_langs.includes(lang);
                              const isSource = lang === o.sourceLang;
                              if (!has && isSource) return null;
                              return (
                                <Chip
                                  key={lang}
                                  tone={has ? 'ok' : 'missing'}
                                  title={
                                    has ? `${langName(lang)} subtitles uploaded` : `${langName(lang)} subtitles missing`
                                  }
                                >
                                  {lang.toUpperCase()}
                                </Chip>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      <td className={td}>
                        {o.files.length === 0 || o.files[0].documents === 0 ? (
                          <NotApplicable
                            title={o.targets.length === 0 ? 'No other language to translate into' : 'No file to translate'}
                          />
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            {o.files.map((f) => (
                              <Chip key={f.lang} tone={fileTone(f)} title={fileTitle(f)}>
                                {f.lang.toUpperCase()} {f.editions}/{f.documents}
                                {f.strings.total > 0 && (
                                  <span className="font-normal">
                                    · texts {f.strings.done}/{f.strings.total}
                                  </span>
                                )}
                              </Chip>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className={td}>
                        {o.texts.length === 0 ? (
                          <NotApplicable title="No other language to translate into" />
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            {o.texts.map((t) => (
                              <Chip key={t.lang} tone={countTone(t)} title={countTitle(t, 'in-game texts')}>
                                {t.lang.toUpperCase()} {t.done}/{t.total}
                                {t.outdated > 0 && <span className="font-normal">· {t.outdated} outdated</span>}
                              </Chip>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className={td}>
                        {!s.gated ? (
                          <span className="text-xs text-slate-400" title="A licensee's own scenario releases every language">
                            All
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {[o.sourceLang, ...o.targets].map((lang) => {
                              const released = s.validated_languages.includes(lang);
                              return (
                                <Chip
                                  key={lang}
                                  tone={released ? 'ok' : 'partial'}
                                  title={
                                    released
                                      ? `${lang.toUpperCase()} is released to licensees`
                                      : `${lang.toUpperCase()} is not released - validate it on the Translations page`
                                  }
                                >
                                  {lang.toUpperCase()}
                                  {!released && <span className="font-normal">draft</span>}
                                </Chip>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      <td className={`${td} min-w-[150px]`}>
                        {o.product && (
                          <button
                            type="button"
                            onClick={() => void toggleFinished(o)}
                            disabled={busy === s.uniqid}
                            aria-pressed={finished}
                            title={
                              finished
                                ? `Finished${s.finished_at ? ` on ${formatDate(s.finished_at)}` : ''}${
                                    s.finished_by ? ` by ${s.finished_by}` : ''
                                  } - click to reopen`
                                : 'Mark this scenario as fully finished'
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 ${
                              regressed
                                ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                                : finished
                                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {busy === s.uniqid ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className={`w-3.5 h-3.5 ${finished ? '' : 'text-slate-300'}`} />
                            )}
                            {finished ? 'Finished' : 'Mark finished'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDetail({ uniqid: s.uniqid })}
                          className={`block text-xs underline decoration-dotted underline-offset-2 ${o.product ? 'mt-1' : ''} ${
                            left > 0 ? 'text-amber-700 hover:text-amber-900' : 'text-slate-400 hover:text-slate-600'
                          }`}
                          title="See what is left to do"
                        >
                          {left > 0 ? `${left} ${left === 1 ? 'item' : 'items'} left` : 'Nothing left'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Chip tone="ok">3/3</Chip> done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Chip tone="partial">2/3</Chip> partly done, outdated or draft
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Chip tone="missing">2/3</Chip> missing, or a critical item is missing
        </span>
        <span>
          Click a count for the detail. Languages come from each scenario's target languages (set in the scenario
          editor). File translations: documents with an edition in that language, then file titles and in-document
          texts.
        </span>
      </div>

      {detailOverview && (
        <ScenarioChecklistModal
          overview={detailOverview}
          focusGroup={detail?.group}
          gameTypeLabel={gameTypeLabel(detailOverview.scenario.game_type)}
          busy={busy === detailOverview.scenario.uniqid}
          onToggleFinished={() => void toggleFinished(detailOverview)}
          onOpenEditor={() => openEditor(detailOverview.scenario.uniqid)}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
