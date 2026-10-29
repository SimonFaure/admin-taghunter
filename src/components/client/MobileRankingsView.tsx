import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckCircle2, ChevronRight, Image as ImageIcon, Trophy, Type, WifiOff } from 'lucide-react';
import { authFetch } from '../../lib/authFetch';
import { useAuth } from '../../auth/AuthContext';
import { getAppAccess } from '../../auth/appAccess';
import { getGameVisualUrl } from './MyScenariosView';
import {
  NAMED_RANGES,
  distinctDurations,
  fmtElapsed,
  formatDuration,
  groupByDuration,
  parseRange,
  rangeQuery,
  type GoApp,
  type RangeKey,
  type ScoreRow,
} from '../../lib/goRanking';
import type { ClientScenario } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const POLL_MS = 4000;
// The operator's last board (app + scenario + window + text size), so reopening
// the page mid-event lands straight back on the ranking they were following.
const STATE_KEY = (clientId: string) => `mr_state_${clientId}`;

type TextSize = 'normal' | 'large';
interface SavedState {
  app?: GoApp;
  scenarioId?: string;
  range?: RangeKey;
  size?: TextSize;
}

function readSaved(clientId: string): SavedState {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY(clientId)) || '{}') as SavedState;
  } catch {
    return {};
  }
}

function rankBadge(i: number): string {
  if (i === 0) return 'bg-amber-400 text-amber-950';
  if (i === 1) return 'bg-slate-300 text-slate-800';
  if (i === 2) return 'bg-orange-400 text-orange-950';
  return 'bg-white/10 text-slate-200';
}

// Two type scales: "large" is the default and is meant to be read at arm's
// length (phone propped on a table); "normal" fits more teams per screen.
const SIZES: Record<TextSize, { badge: string; name: string; meta: string; score: string; row: string }> = {
  normal: { badge: 'h-9 w-9 text-base', name: 'text-lg', meta: 'text-sm', score: 'text-2xl', row: 'px-3 py-2.5' },
  large: { badge: 'h-12 w-12 text-xl', name: 'text-2xl', meta: 'text-base', score: 'text-4xl', row: 'px-3 py-4' },
};

/**
 * The operator's leaderboard, built for a phone held in portrait. Same data as
 * GoSessionsView (go.php?action=leaderboard, so in-progress teams are included,
 * unlike the public /r/ board), but rendered OUTSIDE ClientLayout: its fixed
 * 256px sidebar leaves a phone ~130px of content, which is why the Studio board
 * was only usable in landscape.
 *
 * Route: /m/rankings (optionally ?app=spot&s=<scenarioId> to open on a board).
 */
export function MobileRankingsView() {
  const { t } = useTranslation('client');
  const { user } = useAuth();
  const clientId = user?.client_id ?? '';
  const access = getAppAccess(user);
  const both = access.go && access.spot;
  const [search] = useSearchParams();

  const saved = useRef<SavedState>(readSaved(clientId)).current;
  const wantedApp = search.get('app') ?? saved.app;
  const [app, setApp] = useState<GoApp>(
    both ? (wantedApp === 'spot' ? 'spot' : 'go') : access.spot ? 'spot' : 'go',
  );
  // The scenario to reopen on, consumed once its list has loaded.
  const wantedScenarioRef = useRef<string | null>(search.get('s') ?? saved.scenarioId ?? null);
  const [scenarios, setScenarios] = useState<ClientScenario[]>([]);
  const [scenariosLoaded, setScenariosLoaded] = useState(false);
  const [scenario, setScenario] = useState<ClientScenario | null>(null);
  const [range, setRange] = useState<RangeKey>(() => {
    const r = parseRange(saved.range);
    // No custom window here: the picker is five thumb-sized chips, not date inputs.
    return r === 'custom' ? 'today' : r;
  });
  const [size, setSize] = useState<TextSize>(saved.size === 'normal' ? 'normal' : 'large');
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stale, setStale] = useState(false);
  // null = "All": every challenge, one ranked section each.
  const [durationFilter, setDurationFilter] = useState<number | null>(null);

  useEffect(() => {
    if (!clientId) return;
    try {
      const state: SavedState = { app, scenarioId: scenario?.id, range, size };
      localStorage.setItem(STATE_KEY(clientId), JSON.stringify(state));
    } catch {
      /* private mode - the page just opens on the picker next time */
    }
  }, [clientId, app, scenario, range, size]);

  // Same per-app list the desktop board and the QR grid use (list_go / list_spot).
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    setScenariosLoaded(false);
    (async () => {
      try {
        const action = app === 'spot' ? 'list_spot' : 'list_go';
        const res = await authFetch(
          `${API_BASE_URL}/client_scenarios.php?action=${action}&client_id=${clientId}`,
          { credentials: 'include' },
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const rows = ((json.data || []) as Array<ClientScenario & { scenario_id: number | string }>).map((r) => ({
          ...r,
          id: String(r.scenario_id),
        }));
        if (cancelled) return;
        setScenarios(rows);
        const wanted = wantedScenarioRef.current;
        wantedScenarioRef.current = null;
        // A licensee with a single scenario has nothing to pick.
        const open = rows.find((r) => r.id === wanted) ?? (rows.length === 1 ? rows[0] : null);
        if (open) setScenario(open);
      } catch {
        /* ignore - the picker just stays empty */
      } finally {
        if (!cancelled) setScenariosLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, app]);

  const loadBoard = useCallback(
    async (scenarioId: string, r: RangeKey) => {
      try {
        const qs = new URLSearchParams({ action: 'leaderboard', scenario_id: scenarioId, app, ...rangeQuery(r) });
        const res = await authFetch(`${API_BASE_URL}/go.php?${qs.toString()}`, { credentials: 'include' });
        if (!res.ok) {
          setStale(true);
          return;
        }
        const json = await res.json();
        setScores(json.data || []);
        setStale(false);
      } catch {
        // Field signal dropped: keep the last standings on screen, flag them.
        setStale(true);
      } finally {
        setLoaded(true);
      }
    },
    [app],
  );

  // Poll the open board. A pocketed phone (hidden tab) skips its polls and
  // refreshes the moment it is looked at again.
  useEffect(() => {
    if (!scenario) return;
    setScores([]);
    setLoaded(false);
    setStale(false);
    void loadBoard(scenario.id, range);
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadBoard(scenario.id, range);
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void loadBoard(scenario.id, range);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [scenario, range, loadBoard]);

  // Keep the screen awake while a board is open: the phone is propped up and
  // watched, not touched. The lock is dropped by the browser whenever the tab is
  // hidden, so it is re-requested on return. Unsupported browsers just dim.
  const hasBoard = scenario !== null;
  useEffect(() => {
    if (!hasBoard) return;
    type Sentinel = { release: () => Promise<void> };
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } })
      .wakeLock;
    if (!wakeLock) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const s = await wakeLock.request('screen');
        if (cancelled) void s.release();
        else sentinel = s;
      } catch {
        /* refused (battery saver) - not worth surfacing */
      }
    };
    const onVisible = () => {
      if (!document.hidden) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [hasBoard]);

  const switchApp = (next: GoApp) => {
    if (next === app) return;
    setScenarios([]);
    setScenario(null);
    setApp(next);
  };

  const appLabel = app === 'spot' ? 'Spot' : 'GO';
  const durations = distinctDurations(scores);
  const activeDuration = durationFilter !== null && durations.includes(durationFilter) ? durationFilter : null;
  const sections =
    activeDuration === null
      ? groupByDuration(scores)
      : groupByDuration(scores).filter((g) => g.duration === activeDuration);
  const durationLabel = (d: number) => (d > 0 ? formatDuration(d) : t('goViews:durations.unspecified'));
  const finishedCount = scores.filter((r) => r.finished).length;
  const sz = SIZES[size];

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
      active ? 'bg-emerald-500 text-emerald-950' : 'border border-white/20 text-slate-200'
    }`;

  // ---- Scenario picker ------------------------------------------------------
  if (!scenario) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto max-w-xl px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
          <header className="mb-5 flex items-center gap-3">
            <Link
              to="/my/home"
              aria-label={t('mobileRankings.backToStudio')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Trophy className="h-6 w-6 text-amber-400" />
              {t('mobileRankings.title')}
            </h1>
          </header>

          {both && (
            <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-white/5 p-1">
              {(['go', 'spot'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => switchApp(a)}
                  className={`rounded-lg py-3 text-base font-semibold transition-colors ${
                    app === a ? 'bg-emerald-500 text-emerald-950' : 'text-slate-300'
                  }`}
                >
                  {a === 'spot' ? 'Spot' : 'GO'}
                </button>
              ))}
            </div>
          )}

          <p className="mb-3 text-base text-slate-400">{t('goSessions.startScenarioPrompt', { app: appLabel })}</p>

          {!scenariosLoaded ? (
            <p className="py-16 text-center text-slate-500">{t('publicBoard.loading')}</p>
          ) : scenarios.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-12 text-center text-slate-400">
              {t('goSessions.noGoScenarios', { app: appLabel })}
            </p>
          ) : (
            <ul className="space-y-3">
              {scenarios.map((s) => {
                const img = getGameVisualUrl(s.medias, s.uniqid, user?.language);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setDurationFilter(null);
                        setScenario(s);
                      }}
                      className="flex w-full items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/5 pr-3 text-left active:bg-white/10"
                    >
                      <span className="flex h-20 w-28 shrink-0 items-center justify-center bg-slate-800">
                        {img ? (
                          <img src={img} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-slate-600" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 text-lg font-semibold leading-snug line-clamp-2">{s.title}</span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ---- Board ------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-slate-950/95 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center gap-2">
            {/* With a single scenario there is no picker to go back to. */}
            {scenarios.length > 1 || both ? (
              <button
                type="button"
                onClick={() => setScenario(null)}
                aria-label={t('mobileRankings.changeScenario')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <Link
                to="/my/home"
                aria-label={t('mobileRankings.backToStudio')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold leading-tight">{scenario.title}</div>
              <div className="flex items-center gap-1.5 text-sm text-slate-400">
                {stale ? (
                  <>
                    <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                    <span className="truncate text-amber-400">{t('publicBoard.stale')}</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
                    <span className="truncate">
                      {appLabel} · {t('mobileRankings.summary', { count: scores.length, finished: finishedCount })}
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSize(size === 'large' ? 'normal' : 'large')}
              aria-label={t('mobileRankings.textSize')}
              aria-pressed={size === 'large'}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                size === 'large' ? 'bg-emerald-500 text-emerald-950' : 'bg-white/10'
              }`}
            >
              <Type className="h-5 w-5" />
            </button>
          </div>

          {/* One swipeable line each, so the chips never push the board down. */}
          <div className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none]">
            {NAMED_RANGES.map((r) => (
              <button key={r} type="button" onClick={() => setRange(r)} className={chip(range === r)}>
                {t(`goSessions.range_${r}`)}
              </button>
            ))}
          </div>
          {durations.length > 1 && (
            <div className="-mx-3 mt-2 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none]">
              <button type="button" onClick={() => setDurationFilter(null)} className={chip(activeDuration === null)}>
                {t('goViews:durations.allDurations')}
              </button>
              {durations.map((d) => (
                <button key={d} type="button" onClick={() => setDurationFilter(d)} className={chip(activeDuration === d)}>
                  {durationLabel(d)}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">
        {!loaded ? (
          <p className="py-16 text-center text-slate-500">{t('publicBoard.loading')}</p>
        ) : scores.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-16 text-center text-lg text-slate-400">
            {t('goSessions.waiting')}
          </p>
        ) : (
          // Rank restarts in each section: a 30-min run is only ever ranked
          // against 30-min runs.
          sections.map((section) => (
            <section key={section.duration} className="mb-5 last:mb-0">
              {sections.length > 1 && (
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
                  {durationLabel(section.duration)}
                </h2>
              )}
              <ol className="space-y-2">
                {section.rows.map((row, i) => (
                  <li
                    key={row.team_uuid ?? `${section.duration}-${i}`}
                    className={`flex items-center gap-3 rounded-xl border ${sz.row} ${
                      row.finished ? 'border-white/10 bg-white/5' : 'border-sky-400/30 bg-sky-400/10'
                    }`}
                  >
                    <span
                      className={`flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums ${sz.badge} ${rankBadge(i)}`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`break-words font-bold leading-tight line-clamp-2 ${sz.name}`}>
                        {row.team_name || '-'}
                      </span>
                      <span className={`mt-0.5 flex flex-wrap items-center gap-x-2 text-slate-300 ${sz.meta}`}>
                        {row.finished ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            {t('mobileRankings.finished')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-sky-300">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-sky-300" />
                            {t('mobileRankings.playing')}
                          </span>
                        )}
                        {/* Spot has no levels (project_taghunter_spot). */}
                        {app !== 'spot' && (
                          <span>
                            {t('goSessions.level')} {row.level}
                          </span>
                        )}
                        <span className="tabular-nums">{fmtElapsed(row.elapsed_seconds)}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 font-extrabold tabular-nums text-emerald-400 ${sz.score}`}>
                      {row.score}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
