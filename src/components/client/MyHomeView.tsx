import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Film, Gamepad2, User, Flag, Sparkles, Smartphone, Users, CheckCircle2, UserPlus, FileDown, Package,
  ChevronRight, ArrowRight, HelpCircle,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { getAppAccess } from '../../auth/appAccess';
import { authFetch } from '../../lib/authFetch';
import { useLicenseeData } from '../../layouts/LicenseeDataContext';
import { getGameVisualUrl } from './MyScenariosView';
import { GameTypeIcon } from '../icons/GameTypeIcons';
import { HomeSearch } from './home/HomeSearch';
import { HomeNotifications, iconButtonClass } from './home/HomeNotifications';
import { GAME_TYPE_BG, HOME_GAME_TYPES, asHomeGameType, gameTypeLabel, type HomeGameType } from './home/gameTypeStyle';
import { GameTypeBadge, NewBadge } from './GameTypeBadge';
import type { ClientScenario } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
// Cards shown on the home grid; the rest is one click away on /my/scenarios.
const GRID_LIMIT = 15;

// Playground game stats (statistics.php?action=overview).
interface Counts {
  games: number;
  players: number;
}
// GO + Spot usage summed (go.php?action=client_go_stats totals).
interface GoSpotCounts {
  loads: number;
  teams: number;
  finished: number;
}

type Filter = 'all' | HomeGameType;

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/** "Simon Client" -> "Simon"; falls back to the e-mail's local part. */
function firstNameOf(name?: string, email?: string): string {
  const n = (name || '').trim();
  if (n) return n.split(/\s+/)[0];
  return (email || '').split('@')[0];
}

// /my/home - licensee space landing page (design: taghunter-home-redesign/HANDOFF.md).
// No "launch a game" or "create a scenario" action here: games are launched from
// the apps, not from this site.
export function MyHomeView() {
  const { t, i18n } = useTranslation('home');
  const { user } = useAuth();
  const access = getAppAccess(user);
  const goOnly = access.scenariosGoOnly;
  const hasGoSpot = access.go || access.spot;
  const hasScenarioApp = access.playground || hasGoSpot;
  const { loading: scenariosLoading, error, scenarios, held, products, customs, refreshIfStale } = useLicenseeData();

  const [counts, setCounts] = useState<Counts | null>(null);
  const [goSpot, setGoSpot] = useState<GoSpotCounts | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  // Scenario data is shared with the sidebar; reload it when coming back after a while.
  useEffect(() => {
    refreshIfStale(15_000);
  }, [refreshIfStale]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const apps = [...(access.go ? ['go'] : []), ...(access.spot ? ['spot'] : [])];
      const [statsBody, ...appStats] = await Promise.all([
        access.playground
          ? authFetch(`${API_BASE_URL}/statistics.php?action=overview`).then((r) => r.json()).catch(() => ({}))
          : Promise.resolve({}),
        ...apps.map((app) =>
          authFetch(`${API_BASE_URL}/go.php?action=client_go_stats&app=${app}`)
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ),
      ]);
      if (cancelled) return;
      const overview = statsBody?.overview ?? {};
      setCounts({ games: Number(overview.total_games ?? 0), players: Number(overview.total_players ?? 0) });
      const sum = { loads: 0, teams: 0, finished: 0 };
      for (const body of appStats) {
        const totals = body?.data?.totals ?? {};
        sum.loads += Number(totals.loads ?? 0);
        sum.teams += Number(totals.teams ?? 0);
        sum.finished += Number(totals.finished ?? 0);
      }
      setGoSpot(sum);
    })();
    return () => {
      cancelled = true;
    };
  }, [access.playground, access.go, access.spot]);

  const fmt = (n: number | null | undefined) => (n == null ? '–' : n.toLocaleString(i18n.language));
  const firstName = firstNameOf(user?.name, user?.email);

  // Hero sentence: Playground games + players, or GO/Spot teams for a GO-only account.
  let summary = '';
  if (!goOnly && counts) {
    summary =
      counts.games > 0
        ? t('heroSummary', {
            games: t('heroGames', { count: counts.games, formatted: fmt(counts.games) }),
            players: t('heroPlayers', { count: counts.players, formatted: fmt(counts.players) }),
          })
        : t('heroFirst');
  } else if (goOnly && goSpot) {
    summary = goSpot.teams > 0 ? t('heroGoTeams', { count: goSpot.teams, formatted: fmt(goSpot.teams) }) : t('heroFirst');
  }

  const visuals = held
    .map((s) => getGameVisualUrl(s.medias, s.uniqid, user?.language))
    .filter((v): v is string => !!v)
    .slice(0, 3);

  const quickLinks = [
    { show: access.playground, to: '/my/customers?new=1', labelKey: 'quickAddCustomer', icon: UserPlus, tile: 'bg-[#E7F6EE] text-[#187A43]' },
    { show: access.playground, to: '/my/report-layouts', labelKey: 'quickExportReport', icon: FileDown, tile: 'bg-[#FDF0E3] text-[#A14A06]' },
    { show: true, to: '/my/orders/equipment', labelKey: 'quickOrderEquipment', icon: Package, tile: 'bg-[#FDECEE] text-[#B42330]' },
  ].filter((q) => q.show);

  const stats = goOnly
    ? [
        { labelKey: 'statScenariosOwned', value: scenariosLoading ? null : held.length, icon: Film, to: '/my/scenarios' },
        { labelKey: 'statGoLoads', value: goSpot?.loads, icon: Smartphone, to: '/my/statistics' },
        { labelKey: 'statGoTeams', value: goSpot?.teams, icon: Users, to: '/my/statistics' },
        { labelKey: 'statGoFinished', value: goSpot?.finished, icon: CheckCircle2, to: '/my/statistics' },
      ]
    : [
        { labelKey: 'statScenariosOwned', value: scenariosLoading ? null : products.length, icon: Film, to: '/my/scenarios' },
        { labelKey: 'statGamesLaunched', value: counts?.games, icon: Gamepad2, to: '/my/statistics' },
        { labelKey: 'statPlayers', value: counts?.players, icon: User, to: '/my/statistics' },
        ...(hasGoSpot ? [{ labelKey: 'statGoTeams', value: goSpot?.teams, icon: Flag, to: '/my/statistics' }] : []),
        { labelKey: 'statCustomScenarios', value: scenariosLoading ? null : customs.length, icon: Sparkles, to: '/my/scenarios' },
      ];

  const filtered = filter === 'all' ? held : held.filter((s) => asHomeGameType(s.game_type) === filter);
  const shown = filtered.slice(0, GRID_LIMIT);

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-7">
      {/* Top bar: search + help + notifications, nothing else. */}
      <div className="flex flex-wrap items-center gap-3">
        <HomeSearch scenarios={scenarios} access={access} />
        <div className="flex-1" />
        <Link to="/my/help" aria-label={t('help')} className={iconButtonClass}>
          <HelpCircle className="h-[18px] w-[18px]" aria-hidden="true" />
        </Link>
        <HomeNotifications />
      </div>

      {error && (
        <div role="alert" className="rounded-th border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {t('loadError')}
        </div>
      )}

      <div className="flex flex-wrap gap-5">
        {/* Hero */}
        <section
          aria-labelledby="home-hero-title"
          className="relative flex min-h-[280px] min-w-0 flex-[2_1_560px] flex-wrap items-center gap-6 overflow-hidden rounded-th-xl bg-th-hero px-6 py-7 text-white sm:px-10 sm:py-9"
        >
          <div aria-hidden="true" className="absolute -right-20 -top-[120px] h-[380px] w-[380px] rounded-full border-[60px] border-white/[.035]" />
          <div className="relative flex flex-[1_1_300px] flex-col gap-3.5">
            <span className="text-xs font-semibold uppercase tracking-[.12em] text-th-accent-light">{t('eyebrow')}</span>
            <h1 id="home-hero-title" className="m-0 font-th-display text-[32px] font-bold leading-[1.08] tracking-[-.02em] sm:text-[40px]">
              {firstName ? t('welcomeBack', { name: firstName }) : t('welcome')}
            </h1>
            <p className="m-0 min-h-[1.55em] max-w-[420px] text-[15px] leading-[1.55] text-[#C3CADA]">
              {summary && (
                <>
                  {summary} {t('heroQuestion')}
                </>
              )}
            </p>
            {hasScenarioApp && (
              <div className="mt-2 flex flex-wrap gap-2.5">
                <Link
                  to="/my/catalog"
                  className={`inline-flex h-[46px] items-center gap-2 rounded-th bg-th-accent px-5 text-sm font-semibold text-white hover:bg-[#BC232D] ${ring} focus-visible:ring-white focus-visible:ring-offset-th-hero`}
                >
                  {t('exploreCatalog')}
                </Link>
                <Link
                  to="/my/statistics"
                  className={`inline-flex h-[46px] items-center gap-2 rounded-th border border-white/[.22] px-5 text-sm font-semibold text-white hover:bg-white/[.06] ${ring} focus-visible:ring-white focus-visible:ring-offset-th-hero`}
                >
                  {t('viewStatistics')}
                </Link>
              </div>
            )}
          </div>
          {visuals.length > 0 && (
            <div aria-hidden="true" className="relative h-[210px] min-w-[260px] flex-[1_1_260px]">
              {visuals[0] && (
                <img src={visuals[0]} alt="" className="absolute left-0 top-[70px] h-[92px] w-[200px] -rotate-[7deg] rounded-th border-[3px] border-white/90 object-cover shadow-[0_18px_40px_-10px_rgba(0,0,0,.6)]" />
              )}
              {visuals[1] && (
                <img src={visuals[1]} alt="" className="absolute right-0 top-1 h-[92px] w-[200px] rotate-6 rounded-th border-[3px] border-white/90 object-cover shadow-[0_18px_40px_-10px_rgba(0,0,0,.6)]" />
              )}
              {visuals[2] && (
                <img src={visuals[2]} alt="" className="absolute left-1/2 top-24 -ml-[120px] h-[110px] w-[240px] rounded-[14px] border-[3px] border-white object-cover shadow-[0_22px_44px_-10px_rgba(0,0,0,.7)]" />
              )}
            </div>
          )}
        </section>

        {/* Accès rapide */}
        <section
          aria-labelledby="home-quick-title"
          className="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5 rounded-th-xl border border-th-border bg-white px-[18px] py-[22px]"
        >
          <h2 id="home-quick-title" className="mx-2 mb-2 mt-0 font-th-display text-lg font-semibold">{t('quickAccess')}</h2>
          {quickLinks.map(({ to, labelKey, icon: Icon, tile }) => (
            <Link key={to} to={to} className={`flex min-h-[44px] items-center gap-3.5 rounded-th p-2.5 hover:bg-th-bg ${ring} focus-visible:ring-th-ink`}>
              <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-th-sm ${tile}`}>
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="flex-1 text-sm font-semibold">{t(labelKey)}</span>
              <ChevronRight className="h-4 w-4 text-th-nav-label" aria-hidden="true" />
            </Link>
          ))}
        </section>
      </div>

      {/* Statistiques */}
      <section aria-labelledby="home-stats-title">
        <h2 id="home-stats-title" className="sr-only">{t('statsTitle')}</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {stats.map(({ labelKey, value, icon: Icon, to }) => (
            <Link
              key={labelKey}
              to={to}
              className={`flex flex-col gap-3.5 rounded-th-tile border border-th-border bg-white p-5 transition-shadow hover:shadow-[0_10px_24px_-14px_rgba(15,23,42,.3)] ${ring} focus-visible:ring-th-ink`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-th-sm bg-[#F1F2F6] text-th-ink2">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-th-display text-[34px] font-bold tracking-[-.02em]">{fmt(value)}</span>
                <span className="text-[13px] text-th-muted">{t(labelKey)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Mes scénarios */}
      {hasScenarioApp && (
        <section aria-labelledby="home-lib-title" className="flex flex-col gap-[18px]">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-[1_1_240px] flex-col gap-1">
              <h2 id="home-lib-title" className="m-0 font-th-display text-2xl font-bold tracking-[-.01em]">{t('libraryTitle')}</h2>
              <p className="m-0 text-sm text-th-muted">{t('librarySubtitle')}</p>
            </div>
            <div role="group" aria-label={t('filterLabel')} className="flex flex-wrap gap-2">
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} dot="bg-th-ink" allDot>
                {t('filterAll')}
              </FilterChip>
              {HOME_GAME_TYPES.map((type) => (
                <FilterChip key={type} active={filter === type} onClick={() => setFilter(type)} dot={GAME_TYPE_BG[type]}>
                  {gameTypeLabel(type)}
                </FilterChip>
              ))}
            </div>
          </div>

          {scenariosLoading ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-5" aria-busy="true">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="overflow-hidden rounded-th-card border border-th-border bg-white">
                  <div className="aspect-[24/11] bg-[#E9ECF2] motion-safe:animate-pulse" />
                  <div className="m-4 h-4 w-2/3 rounded bg-[#E9ECF2] motion-safe:animate-pulse" />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-th-card border border-th-border bg-white p-8 text-center text-sm text-th-muted">
              <Film className="mx-auto mb-3 h-10 w-10 text-[#C3C8D4]" aria-hidden="true" />
              {held.length === 0 ? t('ownedEmpty') : t('filterEmpty')}
            </div>
          ) : (
            <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-5 p-0">
              {shown.map((s) => (
                <li key={s.id} className="flex">
                  <ScenarioCard scenario={s} lang={user?.language} />
                </li>
              ))}
            </ul>
          )}

          {held.length > 0 && (
            <div className="flex justify-center pt-2">
              <Link
                to="/my/scenarios"
                className={`inline-flex h-[46px] items-center gap-2 rounded-th border border-th-border-strong bg-white px-5 text-sm font-semibold text-th-ink hover:bg-th-bg ${ring} focus-visible:ring-th-ink`}
              >
                {t('viewAll', { count: held.length, formatted: fmt(held.length) })}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  dot,
  allDot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot: string;
  allDot?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold transition-colors ${ring} focus-visible:ring-th-ink ${
        active ? 'border-th-ink bg-th-ink text-white' : 'border-th-border-strong bg-white text-th-ink hover:border-[#B9BFCC]'
      }`}
    >
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${allDot && active ? 'bg-white' : dot}`} />
      {children}
    </button>
  );
}

// One card = one link to the scenario's page.
function ScenarioCard({ scenario: s, lang }: { scenario: ClientScenario; lang?: string | null }) {
  const visual = getGameVisualUrl(s.medias, s.uniqid, lang);
  return (
    <Link
      to={s.uniqid ? `/my/scenarios/${s.uniqid}` : '/my/scenarios'}
      className={`group flex w-full flex-col overflow-hidden rounded-th-card border border-th-border bg-white hover:shadow-[0_14px_30px_-12px_rgba(15,23,42,.28)] motion-safe:transition-[transform,box-shadow] motion-safe:duration-200 motion-safe:hover:-translate-y-[3px] ${ring} focus-visible:ring-th-ink`}
    >
      <div className="relative overflow-hidden bg-th-hero">
        {visual ? (
          <img
            src={visual}
            alt=""
            loading="lazy"
            className="block aspect-[24/11] w-full object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex aspect-[24/11] w-full items-center justify-center text-white/30">
            <GameTypeIcon type={s.game_type} className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
        <div className="absolute inset-x-2.5 top-2.5 flex flex-wrap items-start justify-between gap-1.5">
          <GameTypeBadge type={s.game_type} />
          {s.is_new && <NewBadge />}
        </div>
      </div>
      <div className="flex flex-1 items-center gap-2.5 px-4 py-3.5">
        <h3 className="m-0 min-w-0 flex-1 text-sm font-semibold leading-[1.3] text-th-ink">{s.title}</h3>
        <ArrowRight className="h-4 w-4 flex-none text-th-nav-label" aria-hidden="true" />
      </div>
    </Link>
  );
}
