import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trophy, CheckCircle2, WifiOff } from 'lucide-react';
import {
  clientTz,
  fmtElapsed,
  parseRange,
  type GoApp,
  type ScoreRow,
} from '../../lib/goRanking';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const POLL_MS = 10000;
// Remember which row the player tapped, so their own team stays highlighted
// across refreshes. Keyed per board so two scenarios don't fight over it.
const PIN_KEY = (app: string, c: string, s: string) => `pb_pin_${app}_${c}_${s}`;

function rankClasses(i: number): string {
  if (i === 0) return 'bg-amber-400/15 border-amber-400/40';
  if (i === 1) return 'bg-slate-300/10 border-slate-300/30';
  if (i === 2) return 'bg-orange-500/10 border-orange-500/30';
  return 'bg-white/5 border-white/10';
}

function rankBadge(i: number): string {
  if (i === 0) return 'bg-amber-400 text-amber-950';
  if (i === 1) return 'bg-slate-300 text-slate-800';
  if (i === 2) return 'bg-orange-400 text-orange-950';
  return 'bg-white/10 text-slate-300';
}

// Stable identity for a public-board row. team_uuid is withheld from this
// endpoint, so a finished team's (name + finish-time + score) stands in - it's
// immutable once the game has ended, which is all this board shows. Used both as
// the React key and to detect which teams are new since the last poll.
function rowKey(r: ScoreRow): string {
  return `${r.team_name ?? ''}|${r.updated_at}|${r.score}|${r.elapsed_seconds}`;
}

/**
 * The player-facing GO / Drop ranking board. Public - no account, no token: a
 * phone reaches it by QR from the operator's Studio space, or it is projected on
 * a screen at the venue.
 *
 * URL: /r/:app/:clientId/:scenarioId?range=today&tz=Europe/Paris
 *      (range=custom instead carries from/to as UTC datetimes)
 *
 * Sessions were retired, so a board is "scenario + time window". The OPERATOR
 * picks that window and it is baked into this URL, which is why there is no
 * range picker here - the players just watch. The window params are forwarded
 * verbatim to public_board, which resolves named ranges server-side. Polls every
 * 10s; a failed poll keeps the last-known standings on screen rather than
 * blanking the projector.
 */
export function PublicRankingView() {
  const { t } = useTranslation('client');
  const params = useParams<{ app: string; clientId: string; scenarioId: string }>();
  const [search] = useSearchParams();

  const app: GoApp = params.app === 'drop' ? 'drop' : 'go';
  const clientId = params.clientId ?? '';
  const scenarioId = params.scenarioId ?? '';
  const range = parseRange(search.get('range'));
  // The window params the operator baked in. `tz` falls back to this screen's
  // own zone (operator opens the board on the same machine) so named ranges
  // still resolve to their local day if the link omitted it.
  const tz = search.get('tz') || clientTz();
  const customFrom = search.get('from') ?? '';
  const customTo = search.get('to') ?? '';

  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [total, setTotal] = useState(0);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  // Teams already on the board, and the ones that appeared on the latest poll
  // (which get the entrance animation). Seeded silently on first load so the
  // whole initial list doesn't fly in at once.
  const seenRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(true);
  const [enteringKeys, setEnteringKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(PIN_KEY(app, clientId, scenarioId)));
    } catch {
      /* private mode - the highlight is just a nicety */
    }
  }, [app, clientId, scenarioId]);

  const togglePin = (name: string | null) => {
    const next = name && pinned !== name ? name : null;
    setPinned(next);
    try {
      const key = PIN_KEY(app, clientId, scenarioId);
      if (next) localStorage.setItem(key, next);
      else localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  const load = useCallback(async () => {
    if (!clientId || !scenarioId) return;
    try {
      const qs = new URLSearchParams({ action: 'public_board', c: clientId, s: scenarioId, app, range });
      // Named ranges resolve server-side from tz; custom carries explicit bounds.
      if (range === 'custom') {
        if (customFrom) qs.set('from', customFrom);
        if (customTo) qs.set('to', customTo);
      } else if (tz) {
        qs.set('tz', tz);
      }
      // Cache-bust: this GET is polled every 10s and sits behind a CDN. A unique
      // URL per poll forces a cache miss even if an intermediary ignores the
      // response's no-store header, so the board never shows stale standings.
      qs.set('_', String(Date.now()));
      const res = await fetch(`${API_BASE_URL}/go.php?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) {
        // Only a genuine refusal (app disabled / not granted) is permanent, and
        // public_board returns those as 403 - show it and stop polling. Anything
        // else (5xx, a momentary blip on venue wifi) is transient: keep the last
        // standings on screen and KEEP polling, so one bad request never freezes
        // a projected board for the rest of the event.
        if (res.status === 403) {
          setError(json?.reason || json?.error || 'refused');
          if (pollRef.current) window.clearInterval(pollRef.current);
        } else {
          setStale(true);
        }
        return;
      }
      const rows: ScoreRow[] = json.data || [];
      const keys = rows.map(rowKey);
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        seenRef.current = new Set(keys);
        setEnteringKeys(new Set());
      } else {
        const fresh = keys.filter((k) => !seenRef.current.has(k));
        fresh.forEach((k) => seenRef.current.add(k));
        setEnteringKeys(new Set(fresh));
      }
      setScores(rows);
      setTotal(json.total ?? rows.length);
      if (json.title) setTitle(json.title);
      setError(null);
      setStale(false);
    } catch {
      // Transient (phone lost signal): keep the last standings, flag them stale.
      setStale(true);
    } finally {
      setLoaded(true);
    }
  }, [app, clientId, scenarioId, range, tz, customFrom, customTo]);

  useEffect(() => {
    void load();
    pollRef.current = window.setInterval(() => void load(), POLL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [load]);

  const rangeLabel = t(`goSessions.range_${range}`, { defaultValue: '' });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Entrance animation for a team that just finished and joined the board:
          the row slides + fades up while its card pulses an emerald glow. Honors
          prefers-reduced-motion. */}
      <style>{`
        @keyframes rankEnter {
          0%   { opacity: 0; transform: translateY(16px) scale(0.96); }
          55%  { opacity: 1; }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes rankGlow {
          0%   { box-shadow: 0 0 0 0 rgba(52,211,153,0.55); }
          100% { box-shadow: 0 0 0 16px rgba(52,211,153,0); }
        }
        .rank-enter { animation: rankEnter 0.55s cubic-bezier(0.22,1,0.36,1) both; }
        .rank-enter > * { animation: rankGlow 1.2s ease-out; border-radius: 0.75rem; }
        @media (prefers-reduced-motion: reduce) {
          .rank-enter, .rank-enter > * { animation: none; }
        }
      `}</style>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <header className="mb-6 text-center">
          <Trophy className="mx-auto mb-2 h-9 w-9 text-amber-400" />
          <h1 className="text-2xl font-bold sm:text-3xl">
            {t('publicBoard.title', { defaultValue: 'Classement' })}
          </h1>
          {title && <p className="mt-1 text-base text-slate-300">{title}</p>}
          {rangeLabel && <p className="mt-1 text-sm text-slate-500">{rangeLabel}</p>}
        </header>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-10 text-center">
            <p className="font-medium text-red-200">
              {t('publicBoard.unavailable', { defaultValue: 'Ce classement n’est pas disponible.' })}
            </p>
            <p className="mt-1 text-xs text-red-300/60">{error}</p>
          </div>
        ) : !loaded ? (
          <div className="py-16 text-center text-slate-500">
            {t('publicBoard.loading', { defaultValue: 'Chargement…' })}
          </div>
        ) : scores.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 py-16 text-center text-slate-400">
            {t('goSessions.waiting', { defaultValue: 'En attente des scores des équipes…' })}
          </div>
        ) : (
          <ol className="space-y-2">
            {scores.map((row, i) => {
              const name = row.team_name || '-';
              const isPinned = pinned !== null && pinned === row.team_name;
              const key = rowKey(row);
              const isNew = enteringKeys.has(key);
              return (
                <li key={key} className={isNew ? 'rank-enter' : ''}>
                  <button
                    type="button"
                    onClick={() => togglePin(row.team_name)}
                    title={t('publicBoard.pinHint', { defaultValue: 'Touchez votre équipe pour la surligner' })}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${rankClasses(i)} ${
                      isPinned ? 'ring-2 ring-emerald-400' : ''
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${rankBadge(i)}`}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-base font-semibold">
                        {row.finished ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : null}
                        <span className="truncate">{name}</span>
                      </span>
                      <span className="text-xs text-slate-400">
                        {t('goSessions.level', { defaultValue: 'Niveau' })} {row.level} ·{' '}
                        {fmtElapsed(row.elapsed_seconds)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xl font-bold tabular-nums text-emerald-400">{row.score}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* Say it out loud rather than silently truncating the field. */}
        {total > scores.length && (
          <p className="mt-4 text-center text-xs text-slate-500">
            {t('publicBoard.truncated', {
              defaultValue: 'Affichage des {{shown}} premières équipes sur {{total}}.',
              shown: scores.length,
              total,
            })}
          </p>
        )}

        {stale && !error && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-amber-400/80">
            <WifiOff className="h-3.5 w-3.5" />
            {t('publicBoard.stale', { defaultValue: 'Hors ligne — derniers scores connus.' })}
          </p>
        )}
      </div>
    </div>
  );
}
