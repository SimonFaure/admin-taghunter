import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, RefreshCw, CheckCircle2, QrCode, Maximize2, X, Image as ImageIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { authFetch } from '../../lib/authFetch';
import { useAuth } from '../../auth/AuthContext';
import { getGameVisualUrl } from './MyScenariosView';
import type { ClientScenario } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
// The player PWAs (Tag Hunter GO / Drop). The QR opens the app on a phone, scoped
// to the client + scenario. There is no session - the leaderboard is filtered by
// time range in this view, so the QR is durable (the same QR works for every run).
const GO_BASE_URL = import.meta.env.VITE_GO_BASE_URL || 'https://go.taghunter.fr';
const DROP_BASE_URL = import.meta.env.VITE_DROP_BASE_URL || 'https://drop.taghunter.fr';
const POLL_MS = 4000;

function playerUrl(base: string, clientId: string, scenarioId: number | string): string {
  return `${base}/?c=${encodeURIComponent(clientId)}&s=${encodeURIComponent(String(scenarioId))}`;
}

// The time windows the operator can filter the leaderboard by. The named ranges
// are resolved server-side against its clock; `custom` sends explicit from/to.
type RangeKey = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';
const NAMED_RANGES: RangeKey[] = ['today', 'week', 'month', 'year', 'all'];

interface ScoreRow {
  team_uuid: string;
  team_name: string | null;
  score: number;
  level: number;
  finished: number;
  elapsed_seconds: number;
  updated_at: string;
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// A Date → UTC MySQL datetime ("YYYY-MM-DD HH:MM:SS"). toISOString() is always
// UTC, so the server (whose connection is pinned to UTC) compares apples to
// apples regardless of where the operator or the DB live.
function toUtcSql(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// The lower bound of a named range, computed in the OPERATOR's local timezone so
// "Today" / "This week" / … mean the viewer's calendar period. null = no bound.
function rangeStart(range: RangeKey, now: Date): Date | null {
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  switch (range) {
    case 'today':
      return new Date(y, mo, d);
    case 'week': {
      // Week starts Monday. getDay(): 0 = Sunday, so Monday offset = (day+6)%7.
      const monday = new Date(y, mo, d);
      monday.setDate(d - ((now.getDay() + 6) % 7));
      return monday;
    }
    case 'month':
      return new Date(y, mo, 1);
    case 'year':
      return new Date(y, 0, 1);
    case 'all':
    case 'custom':
    default:
      return null;
  }
}

/**
 * Client "GO / Drop Leaderboards" - the animateur's leaderboard. Pick a scenario,
 * then a time range (today / this week / month / year / all time / custom) and
 * watch teams' scores via go.php?action=leaderboard&app=… . Online-only (the field
 * is offline). Sessions were retired in favour of these time ranges. The `app`
 * prop drives which grants/board/QR base are used (project_taghunter_drop).
 */
export function GoSessionsView({ app = 'go' }: { app?: 'go' | 'drop' } = {}) {
  const { t } = useTranslation('client');
  const { user } = useAuth();
  const clientId = user?.client_id ?? '';
  const baseUrl = app === 'drop' ? DROP_BASE_URL : GO_BASE_URL;
  const title = app === 'drop' ? t('goSessions.titleDrop', { defaultValue: 'Drop Leaderboards' }) : t('goSessions.title');
  const url = (scenarioId: number | string) => playerUrl(baseUrl, clientId, scenarioId);
  const [goScenarios, setGoScenarios] = useState<ClientScenario[]>([]);
  const [scenario, setScenario] = useState<ClientScenario | null>(null);
  const [range, setRange] = useState<RangeKey>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrFullscreen, setQrFullscreen] = useState(false);
  const pollRef = useRef<number | null>(null);

  // The client's scenarios for this app - the pool whose leaderboards the operator
  // views. GO = adaptable_go grants from `list`; Drop = the mode='drop' grants.
  const loadGoScenarios = useCallback(async () => {
    if (!clientId) return;
    try {
      if (app === 'drop') {
        const res = await authFetch(
          `${API_BASE_URL}/client_scenarios.php?action=list_drop&client_id=${clientId}`,
          { credentials: 'include' },
        );
        if (res.ok) {
          const json = await res.json();
          // list_drop returns scenario_id (not id) - normalize to the picker shape.
          const rows = (json.data || []) as Array<ClientScenario & { scenario_id: number | string }>;
          setGoScenarios(rows.map((r) => ({ ...r, id: String(r.scenario_id) })));
        }
      } else {
        const res = await authFetch(
          `${API_BASE_URL}/client_scenarios.php?action=list&client_id=${clientId}`,
          { credentials: 'include' },
        );
        if (res.ok) {
          const json = await res.json();
          setGoScenarios((json.data || []).filter((s: ClientScenario) => s.adaptable_go));
        }
      }
    } catch {
      /* ignore - the picker just stays empty */
    }
  }, [clientId, app]);

  const loadBoard = useCallback(
    async (scenarioId: number | string, r: RangeKey, from: string, to: string) => {
      try {
        const qs = new URLSearchParams({ action: 'leaderboard', scenario_id: String(scenarioId), app });
        if (r === 'custom') {
          // datetime-local strings are operator-local wall-clock → to UTC.
          if (from) qs.set('from', toUtcSql(new Date(from)));
          if (to) qs.set('to', toUtcSql(new Date(to)));
        } else {
          // Named ranges: compute the lower bound in the operator's timezone.
          const start = rangeStart(r, new Date());
          if (start) qs.set('from', toUtcSql(start));
        }
        const res = await authFetch(`${API_BASE_URL}/go.php?${qs.toString()}`, { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          setScores(json.data || []);
        }
      } catch {
        /* keep last-known board on a transient failure */
      } finally {
        setLoadingBoard(false);
      }
    },
    [app],
  );

  useEffect(() => {
    void loadGoScenarios();
  }, [loadGoScenarios]);

  // Poll the selected scenario's leaderboard for the chosen range.
  useEffect(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (!scenario) {
      setScores([]);
      return;
    }
    setLoadingBoard(true);
    void loadBoard(scenario.id, range, customFrom, customTo);
    pollRef.current = window.setInterval(() => {
      void loadBoard(scenario.id, range, customFrom, customTo);
    }, POLL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [scenario, range, customFrom, customTo, loadBoard]);

  // Esc exits fullscreen QR.
  useEffect(() => {
    if (!qrFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQrFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [qrFullscreen]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Trophy className="w-7 h-7 text-emerald-600" />
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      </div>
      <p className="text-slate-600 mb-6">{t('goSessions.subtitle')}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scenario picker */}
        <div className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="text-sm font-semibold text-slate-800 mb-3">{t('goSessions.startScenarioPrompt')}</div>
            {goScenarios.length === 0 ? (
              <p className="text-sm text-slate-400">{t('goSessions.noGoScenarios')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {goScenarios.map((s) => {
                  const img = getGameVisualUrl(s.medias, s.uniqid);
                  const isSel = scenario?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setScenario(s)}
                      title={s.title}
                      className={`group overflow-hidden rounded-lg border bg-white text-left transition-colors ${
                        isSel ? 'border-emerald-500 ring-2 ring-emerald-400' : 'border-slate-200 hover:border-emerald-400'
                      }`}
                    >
                      <div className="relative aspect-video bg-slate-100">
                        {img ? (
                          <img src={img} alt={s.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <div className="truncate text-xs font-medium text-slate-800">{s.title}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        <div className="lg:col-span-2">
          {!scenario ? (
            <div className="text-center py-16 bg-slate-50 rounded-lg">
              <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">{t('goSessions.pickPrompt')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Time-range selector */}
              <div className="flex flex-wrap items-center gap-2">
                {NAMED_RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      range === r
                        ? 'bg-emerald-600 text-white'
                        : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {t(`goSessions.range_${r}`)}
                  </button>
                ))}
                <button
                  onClick={() => setRange('custom')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    range === 'custom'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {t('goSessions.range_custom')}
                </button>
              </div>

              {range === 'custom' && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block font-medium">{t('goSessions.from')}</span>
                    <input
                      type="datetime-local"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    <span className="mb-1 block font-medium">{t('goSessions.to')}</span>
                    <input
                      type="datetime-local"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </label>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <div className="font-semibold text-slate-800 truncate">{scenario.title}</div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setShowQr(true);
                        setQrFullscreen(false);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      {t('goSessions.showQr')}
                    </button>
                    <RefreshCw className={`w-4 h-4 text-slate-400 ${loadingBoard ? 'animate-spin' : ''}`} />
                  </div>
                </div>
                {scores.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">{t('goSessions.waiting')}</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 w-12">#</th>
                        <th className="px-4 py-2">{t('goSessions.team')}</th>
                        <th className="px-4 py-2 text-right">{t('goSessions.score')}</th>
                        <th className="px-4 py-2 text-right">{t('goSessions.level')}</th>
                        <th className="px-4 py-2 text-right">{t('goSessions.time')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scores.map((row, i) => (
                        <tr key={row.team_uuid} className="border-t border-slate-100">
                          <td className="px-4 py-2.5 font-bold text-slate-400">{i + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            <span className="inline-flex items-center gap-1.5">
                              {row.finished ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : null}
                              {row.team_name || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{row.score}</td>
                          <td className="px-4 py-2.5 text-right">{row.level}</td>
                          <td className="px-4 py-2.5 text-right text-slate-500">{fmtElapsed(row.elapsed_seconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Join QR - durable (no session); players scan it to open the game. */}
      {scenario && showQr && !qrFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowQr(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">{scenario.title}</h2>
            <p className="mt-1 mb-4 text-sm text-slate-500">{t('goSessions.qrTitle')}</p>
            <div className="mx-auto inline-block rounded-lg border border-slate-100 bg-white p-3">
              <QRCodeSVG value={url(scenario.id)} size={208} level="M" marginSize={2} />
            </div>
            <p className="mt-3 break-all text-[11px] text-slate-400">{url(scenario.id)}</p>
            <div className="mt-5 flex justify-center gap-2">
              <button
                onClick={() => setQrFullscreen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                <Maximize2 className="w-4 h-4" />
                {t('goSessions.fullscreen')}
              </button>
              <button
                onClick={() => setShowQr(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('goSessions.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen QR - for projecting / holding up to a room. */}
      {scenario && showQr && qrFullscreen && (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white p-6"
          onClick={() => setQrFullscreen(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setQrFullscreen(false);
            }}
            title={t('goSessions.exitFullscreen')}
            className="absolute top-4 right-4 rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"
          >
            <X className="w-6 h-6" />
          </button>
          <h2 className="mb-1 text-2xl font-bold text-slate-900">{scenario.title}</h2>
          <p className="mb-6 text-slate-500">{t('goSessions.qrTitle')}</p>
          <QRCodeSVG
            value={url(scenario.id)}
            level="M"
            marginSize={2}
            className="h-[min(70vh,70vw)] w-[min(70vh,70vw)]"
          />
        </div>
      )}
    </div>
  );
}
