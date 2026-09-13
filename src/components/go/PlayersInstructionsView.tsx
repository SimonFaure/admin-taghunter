import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ImageOff,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { FONT_CATALOG } from '../../fonts/catalog';
import { SlideRenderer, type CarouselSlideStyle } from './slides/SlideRenderer';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

/**
 * Admin → Players Instructions: the authored slide carousels the GO / Spot
 * player app shows, in the two places it shows them.
 *
 *  - **Players Instructions** (target = null): GLOBAL per app, an inline card on
 *    the inscription screen directly under the scenario description. It explains
 *    how the game is played, which doesn't change with the scenario.
 *  - **Briefing** (target = a scenario): that scenario's instructions and story,
 *    full-screen between "Commencer" and the first question (#67).
 *
 * Same table, same CRUD, same editor, same renderer — the `scenario_id` is what
 * tells them apart and the canvas shape is all that differs when drawing them.
 *
 * A slide is a localized TEXT block (font, colour, size, placement, readability
 * scrim) over a background that is either a solid colour or an image — so a
 * slide needs no image at all. The preview beside each slide is the SAME
 * component the phone runs (SlideRenderer, duplicated verbatim into
 * taghunter-go), so what is authored here is what the player gets.
 *
 * One page serves both apps via the GO|Spot toggle; it is mounted twice in the
 * sidebar (once under each app group), each mount preselecting its own app.
 *
 * Backed by go.php?action=tutorial_* + instructions_title_update (admin-gated).
 * Design: memory project_go_spot_players_instructions_carousel.
 */

/** Studio authors scenario content in these 12 languages. */
const LANG_LABELS: Record<string, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  ru: 'Русский',
  ja: '日本語',
  zh: '中文',
  ar: 'العربية',
};

/**
 * Shown expanded by default. The other nine are added on demand: the player app
 * ships these three, but a scenario can declare any of the twelve, and a slide
 * with no text for the player's language falls back to the scenario's default
 * language rather than showing nothing.
 */
const PRIMARY_LANGS = ['fr', 'en', 'es'];

type Localized = Record<string, string>;

interface Slide extends CarouselSlideStyle {
  id: number;
  position: number;
  filename: string | null;
  image_url: string | null;
  caption: Localized;
  /** Converted from the old image+caption model and not yet reviewed. */
  needs_review: boolean;
}

/** The editable half of a slide — everything the Save button writes. */
type Draft = Pick<
  Slide,
  | 'caption'
  | 'font_family'
  | 'font_color'
  | 'font_size_pct'
  | 'text_align'
  | 'text_anchor'
  | 'scrim'
  | 'background_color'
  | 'background_fit'
>;

/** A scenario that can carry a briefing, for the target picker. */
type BriefingTarget = { id: number; title: string; slides: number };

const DEFAULT_TEXT_COLOR = '#ffffff';
const DEFAULT_BG_COLOR = '#0f172a';
/** Studio warns above this; go.php refuses above 5 MB. */
const SOFT_IMAGE_LIMIT = 1024 * 1024;

function draftOf(s: Slide): Draft {
  return {
    caption: { ...(s.caption || {}) },
    font_family: s.font_family ?? null,
    font_color: s.font_color ?? null,
    font_size_pct: s.font_size_pct ?? 7,
    text_align: s.text_align ?? 'center',
    text_anchor: s.text_anchor ?? 'middle',
    scrim: s.scrim ?? 0,
    background_color: s.background_color ?? null,
    background_fit: s.background_fit ?? 'cover',
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  const langs = new Set([...Object.keys(a.caption), ...Object.keys(b.caption)]);
  for (const l of langs) {
    if ((a.caption[l] ?? '') !== (b.caption[l] ?? '')) return false;
  }
  return (
    a.font_family === b.font_family &&
    a.font_color === b.font_color &&
    a.font_size_pct === b.font_size_pct &&
    a.text_align === b.text_align &&
    a.text_anchor === b.text_anchor &&
    a.scrim === b.scrim &&
    a.background_color === b.background_color &&
    a.background_fit === b.background_fit
  );
}

export function PlayersInstructionsView({ initialApp = 'go' }: { initialApp?: 'go' | 'spot' }) {
  const { t } = useTranslation();

  // One page, both apps. The sidebar mounts it twice, each preselecting its own.
  const [app, setApp] = useState<'go' | 'spot'>(initialApp);
  useEffect(() => { setApp(initialApp); }, [initialApp]);

  const isSpot = app === 'spot';
  const appName = isSpot ? 'Spot' : 'GO';
  const tint = isSpot ? 'text-sky-600' : 'text-emerald-600';

  // Which carousel is being edited: null = the global Players Instructions,
  // a scenario id = that scenario's briefing.
  const [scenarioId, setScenarioId] = useState<number | null>(null);
  const [targets, setTargets] = useState<BriefingTarget[]>([]);

  const [slides, setSlides] = useState<Slide[]>([]);
  const [maxSlides, setMaxSlides] = useState(10);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Edits are local until saved, so typing or dragging a slider doesn't fire a
  // request per keystroke — and the preview still updates live.
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  // Extra languages the author opened, beyond fr/en/es. Page-wide, not
  // per-slide: an author working in German wants every slide to show German.
  const [extraLangs, setExtraLangs] = useState<string[]>([]);

  // The carousel heading (global target only), authored per app.
  const [title, setTitle] = useState<Localized>({});
  const [savedTitle, setSavedTitle] = useState<Localized>({});

  const uploadTarget = useRef<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const langs = useMemo(() => [...PRIMARY_LANGS, ...extraLangs], [extraLangs]);
  const addableLangs = useMemo(
    () => Object.keys(LANG_LABELS).filter((l) => !langs.includes(l)),
    [langs],
  );

  // `scenario_id` scopes every read and write; omitting it means the global
  // carousel, so the two never mix.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = scenarioId === null ? '' : `&scenario_id=${scenarioId}`;
      const res = await authFetch(`${API_BASE_URL}/go.php?action=tutorial_list&app=${app}${q}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const rows = (json.data ?? []) as Slide[];
      setSlides(rows);
      setDrafts(Object.fromEntries(rows.map((s) => [s.id, draftOf(s)])));
      setMaxSlides(Number(json.max_slides) || 10);
      const loadedTitle = (json.instructions_title ?? {}) as Localized;
      setTitle({ ...loadedTitle });
      setSavedTitle({ ...loadedTitle });
      // Surface any authored language beyond fr/en/es so existing text is never
      // hidden behind the "add a language" control.
      const seen = new Set<string>();
      for (const row of rows) for (const l of Object.keys(row.caption || {})) seen.add(l);
      for (const l of Object.keys(loadedTitle)) seen.add(l);
      setExtraLangs([...seen].filter((l) => !PRIMARY_LANGS.includes(l) && LANG_LABELS[l]));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('goViews:instructions.loadError'));
    } finally {
      setLoading(false);
    }
  }, [app, scenarioId, t]);

  // The scenarios eligible for a briefing in this app, with their slide counts
  // so the picker shows which ones already have one.
  const loadTargets = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/go.php?action=briefing_scenarios&app=${app}`);
      if (!res.ok) return;
      const json = await res.json();
      setTargets((json.data ?? []) as BriefingTarget[]);
    } catch {
      /* non-fatal: the picker just offers the global carousel */
    }
  }, [app]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadTargets(); }, [loadTargets, slides.length]);
  // Switching app resets to the global carousel: a scenario id from GO means
  // nothing in the Spot list.
  useEffect(() => { setScenarioId(null); }, [app]);

  const post = async (action: string, body: unknown, reload = true) => {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/go.php?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.reason || json?.error || `HTTP ${res.status}`);
      }
      if (reload) await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('goViews:instructions.saveError'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addSlide = () =>
    post('tutorial_create', { app, scenario_id: scenarioId });

  const saveSlide = (id: number) => post('tutorial_update', { id, ...drafts[id] });

  const remove = (id: number) => {
    if (!confirm(t('goViews:instructions.confirmDelete'))) return;
    void post('tutorial_delete', { id });
  };

  const removeImage = (id: number) => {
    if (!confirm(t('goViews:instructions.confirmRemoveImage'))) return;
    void post('tutorial_image_delete', { id });
  };

  const move = (index: number, delta: number) => {
    const next = [...slides];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSlides(next); // optimistic — the reload right after confirms it
    void post('tutorial_reorder', { ids: next.map((s) => s.id) });
  };

  const saveTitle = () => post('instructions_title_update', { app, title });

  const upload = async (file: File, slideId: number) => {
    setBusy(true);
    setError(null);
    // The server refuses above 5 MB; this nudge is about what a player actually
    // downloads on mobile data, which is a much lower bar than "accepted".
    setWarning(
      file.size > SOFT_IMAGE_LIMIT
        ? t('goViews:instructions.largeImageWarning', {
            size: (file.size / 1048576).toFixed(1),
          })
        : null,
    );
    try {
      const fd = new FormData();
      fd.append('app', app);
      if (scenarioId !== null) fd.append('scenario_id', String(scenarioId));
      fd.append('id', String(slideId));
      fd.append('image', file);
      const res = await authFetch(`${API_BASE_URL}/go.php?action=tutorial_upload`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.reason || json?.error || t('goViews:instructions.uploadError'));
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('goViews:instructions.uploadError'));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
      uploadTarget.current = null;
    }
  };

  const patch = (id: number, p: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...p } }));

  const titleDirty = useMemo(() => {
    const all = new Set([...Object.keys(title), ...Object.keys(savedTitle)]);
    return [...all].some((l) => (title[l] ?? '') !== (savedTitle[l] ?? ''));
  }, [title, savedTitle]);

  const atCap = slides.length >= maxSlides;

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <BookOpen className={`w-7 h-7 ${tint}`} />
        <h1 className="text-2xl font-bold text-slate-900">
          {t('goViews:instructions.title')}
        </h1>
      </div>
      <p className="text-slate-500 mb-6">{t('goViews:instructions.subtitle')}</p>

      {/* Which app, then which of its two carousels. */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <span className="block text-sm font-medium text-slate-700">
              {t('goViews:instructions.appLabel')}
            </span>
            <div className="mt-1.5 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
              {(['go', 'spot'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setApp(a)}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                    app === a ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {a === 'spot' ? 'Spot' : 'GO'}
                </button>
              ))}
            </div>
          </div>

          <label className="min-w-[20rem] flex-1">
            <span className="block text-sm font-medium text-slate-700">
              {t('goViews:instructions.targetLabel')}
            </span>
            <select
              value={scenarioId === null ? '' : String(scenarioId)}
              onChange={(e) => setScenarioId(e.target.value === '' ? null : Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            >
              <option value="">{t('goViews:instructions.targetGlobal', { app: appName })}</option>
              {targets.map((s) => (
                <option key={s.id} value={s.id}>
                  {t('goViews:instructions.targetScenario', { title: s.title, count: s.slides })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          {scenarioId === null
            ? t('goViews:instructions.targetGlobalHint')
            : t('goViews:instructions.targetScenarioHint')}
        </p>
      </div>

      {/* The heading printed above the carousel on the player's setup screen.
          Only the global carousel has one — a briefing is full-screen. */}
      {scenarioId === null && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="block text-sm font-medium text-slate-700">
            {t('goViews:instructions.headingLabel', { app: appName })}
          </span>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('goViews:instructions.headingHint')}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {langs.map((l) => (
              <label key={l} className="block">
                <span className="text-xs font-medium uppercase text-slate-400">{l}</span>
                <input
                  value={title[l] ?? ''}
                  onChange={(e) => setTitle((v) => ({ ...v, [l]: e.target.value }))}
                  placeholder={t('goViews:instructions.headingPlaceholder')}
                  className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || !titleDirty}
            onClick={() => void saveTitle()}
            className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
          >
            {t('goViews:instructions.saveHeading')}
          </button>
        </div>
      )}

      {/* Language shelf: fr/en/es plus whatever the author opened. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">{t('goViews:instructions.languages')}</span>
        {langs.map((l) => (
          <span
            key={l}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
          >
            {LANG_LABELS[l] ?? l}
          </span>
        ))}
        {addableLangs.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setExtraLangs((v) => [...v, e.target.value]);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 focus:border-slate-900 focus:outline-none"
          >
            <option value="">{t('goViews:instructions.addLanguage')}</option>
            {addableLangs.map((l) => (
              <option key={l} value={l}>{LANG_LABELS[l]}</option>
            ))}
          </select>
        )}
      </div>

      <div className="mb-6 flex items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            const id = uploadTarget.current;
            if (f && id) void upload(f, id);
          }}
        />
        <button
          type="button"
          disabled={busy || atCap}
          onClick={() => void addSlide()}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {t('goViews:instructions.addSlide')}
        </button>
        <span className="text-sm text-slate-500">
          {atCap
            ? t('goViews:instructions.atCap', { max: maxSlides })
            : t('goViews:instructions.addHint', { count: slides.length, max: maxSlides })}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
      {warning && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900" />
        </div>
      ) : !slides.length ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg text-slate-500">
          {t('goViews:instructions.empty')}
        </div>
      ) : (
        <div className="space-y-4">
          {slides.map((s, i) => {
            const d = drafts[s.id];
            if (!d) return null;
            const dirty = !sameDraft(d, draftOf(s));
            return (
              <div
                key={s.id}
                className={`flex gap-5 rounded-xl border bg-white p-4 shadow-sm ${
                  s.needs_review ? 'border-amber-300' : 'border-slate-200'
                }`}
              >
                {/* Order controls */}
                <div className="flex flex-col items-center gap-1 pt-1">
                  <span className="text-sm font-bold text-slate-400">{i + 1}</span>
                  <button
                    type="button"
                    disabled={i === 0 || busy}
                    onClick={() => move(i, -1)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    title={t('goViews:instructions.moveUp')}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={i === slides.length - 1 || busy}
                    onClick={() => move(i, 1)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                    title={t('goViews:instructions.moveDown')}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>

                {/* Live preview — the very component the phone runs, at the very
                    ratio the phone uses, so nothing is left to imagination. */}
                <div className="w-44 shrink-0">
                  <SlideRenderer
                    slide={d}
                    text={d.caption[PRIMARY_LANGS[0]] || Object.values(d.caption).find(Boolean) || ''}
                    imageUrl={s.image_url}
                    variant="card"
                    className="rounded-lg ring-1 ring-slate-200"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        uploadTarget.current = s.id;
                        fileInput.current?.click();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {s.image_url
                        ? t('goViews:instructions.replaceImage')
                        : t('goViews:instructions.addImage')}
                    </button>
                    {s.image_url && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => removeImage(s.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <ImageOff className="w-3.5 h-3.5" />
                        {t('goViews:instructions.removeImage')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Fields */}
                <div className="min-w-0 flex-1">
                  {s.needs_review && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{t('goViews:instructions.needsReview')}</span>
                    </div>
                  )}

                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {t('goViews:instructions.textLabel')}
                  </span>
                  <div className="mt-1 grid gap-2 sm:grid-cols-3">
                    {langs.map((l) => (
                      <label key={l} className="block">
                        <span className="text-xs font-medium uppercase text-slate-400">{l}</span>
                        <textarea
                          rows={3}
                          value={d.caption[l] ?? ''}
                          onChange={(e) =>
                            patch(s.id, { caption: { ...d.caption, [l]: e.target.value } })
                          }
                          placeholder={t('goViews:instructions.textPlaceholder')}
                          className="mt-0.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                        />
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {/* ---- Text ---- */}
                    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        {t('goViews:instructions.textStyle')}
                      </span>

                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {t('goViews:instructions.font')}
                        </span>
                        <select
                          value={d.font_family ?? ''}
                          onChange={(e) => patch(s.id, { font_family: e.target.value || null })}
                          className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                          style={d.font_family ? { fontFamily: `"${d.font_family}"` } : undefined}
                        >
                          <option value="">{t('goViews:instructions.fontInherit')}</option>
                          <optgroup label={t('goViews:instructions.fontStandard')}>
                            {FONT_CATALOG.filter((f) => f.group === 'standard').map((f) => (
                              <option key={f.family} value={f.family} style={{ fontFamily: f.stack }}>
                                {f.label}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label={t('goViews:instructions.fontThemed')}>
                            {FONT_CATALOG.filter((f) => f.group === 'themed').map((f) => (
                              <option key={f.family} value={f.family} style={{ fontFamily: f.stack }}>
                                {f.label}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {t('goViews:instructions.textColor')}
                        </span>
                        <div className="mt-0.5 flex items-center gap-2">
                          <input
                            type="color"
                            value={d.font_color ?? DEFAULT_TEXT_COLOR}
                            onChange={(e) => patch(s.id, { font_color: e.target.value })}
                            className="h-8 w-12 cursor-pointer rounded border border-slate-300"
                          />
                          <span className="font-mono text-xs text-slate-500">
                            {d.font_color ?? DEFAULT_TEXT_COLOR}
                          </span>
                        </div>
                      </label>

                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {/* % of the slide's WIDTH, so the proportion holds on
                              any phone and in this preview. */}
                          {t('goViews:instructions.textSize', {
                            value: (d.font_size_pct ?? 7).toFixed(1),
                          })}
                        </span>
                        <input
                          type="range"
                          min={2}
                          max={20}
                          step={0.5}
                          value={d.font_size_pct ?? 7}
                          onChange={(e) => patch(s.id, { font_size_pct: Number(e.target.value) })}
                          className="mt-1 w-full"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-xs text-slate-500">
                            {t('goViews:instructions.align')}
                          </span>
                          <select
                            value={d.text_align ?? 'center'}
                            onChange={(e) =>
                              patch(s.id, { text_align: e.target.value as Draft['text_align'] })
                            }
                            className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                          >
                            <option value="left">{t('goViews:instructions.alignLeft')}</option>
                            <option value="center">{t('goViews:instructions.alignCenter')}</option>
                            <option value="right">{t('goViews:instructions.alignRight')}</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs text-slate-500">
                            {t('goViews:instructions.anchor')}
                          </span>
                          <select
                            value={d.text_anchor ?? 'middle'}
                            onChange={(e) =>
                              patch(s.id, { text_anchor: e.target.value as Draft['text_anchor'] })
                            }
                            className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                          >
                            <option value="top">{t('goViews:instructions.anchorTop')}</option>
                            <option value="middle">{t('goViews:instructions.anchorMiddle')}</option>
                            <option value="bottom">{t('goViews:instructions.anchorBottom')}</option>
                          </select>
                        </label>
                      </div>
                    </div>

                    {/* ---- Background ---- */}
                    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        {t('goViews:instructions.background')}
                      </span>

                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {t('goViews:instructions.bgColor')}
                        </span>
                        <div className="mt-0.5 flex items-center gap-2">
                          <input
                            type="color"
                            value={d.background_color ?? DEFAULT_BG_COLOR}
                            onChange={(e) => patch(s.id, { background_color: e.target.value })}
                            className="h-8 w-12 cursor-pointer rounded border border-slate-300"
                          />
                          <span className="font-mono text-xs text-slate-500">
                            {d.background_color ?? DEFAULT_BG_COLOR}
                          </span>
                        </div>
                      </label>

                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {t('goViews:instructions.fit')}
                        </span>
                        <select
                          value={d.background_fit ?? 'cover'}
                          onChange={(e) =>
                            patch(s.id, {
                              background_fit: e.target.value as Draft['background_fit'],
                            })
                          }
                          disabled={!s.image_url}
                          className="mt-0.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                        >
                          <option value="cover">{t('goViews:instructions.fitCover')}</option>
                          <option value="contain">{t('goViews:instructions.fitContain')}</option>
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-xs text-slate-500">
                          {/* Rescues white-on-sky without re-editing the photo. */}
                          {t('goViews:instructions.scrim', { value: d.scrim ?? 0 })}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={d.scrim ?? 0}
                          onChange={(e) => patch(s.id, { scrim: Number(e.target.value) })}
                          className="mt-1 w-full"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={busy || (!dirty && !s.needs_review)}
                      onClick={() => void saveSlide(s.id)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
                    >
                      {t('goViews:instructions.saveSlide')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(s.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('goViews:instructions.delete')}
                    </button>
                    {s.filename && (
                      <span className="truncate text-xs text-slate-400">{s.filename}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
