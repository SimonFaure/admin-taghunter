import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, Film, Package, Sparkles, Gamepad2, UserCircle, Loader2, Smartphone, Users, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { getAppAccess } from '../../auth/appAccess';
import { authFetch } from '../../lib/authFetch';
import { getGameVisualUrl } from './MyScenariosView';
import { fetchGrantedScenarioIds, isHeldScenario, isPlayableInApps } from './heldScenarios';
import { recencyKey } from './scenarioSort';
import { GameTypeIcon } from '../icons/GameTypeIcons';
import type { ClientScenario } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

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

const isProduct = (s: ClientScenario) => s.scenario_type === 'product';

export function MyHomeView() {
  const { t } = useTranslation('home');
  const { user } = useAuth();
  const navigate = useNavigate();
  const greeting = user?.name || user?.email?.split('@')[0] || '';

  // What the home page shows follows the licensee's apps (project_client_app_section):
  // Playground surfaces (custom scenarios, editor, Playground game stats) only
  // with Playground; GO/Spot usage from go.php's own stats for GO/Spot.
  const access = getAppAccess(user);
  const goOnly = access.scenariosGoOnly;
  const hasGoSpot = access.go || access.spot;

  const [scenarios, setScenarios] = useState<ClientScenario[]>([]);
  const [grantedIds, setGrantedIds] = useState<Set<number> | null>(null);
  const [counts, setCounts] = useState<Counts>({ games: 0, players: 0 });
  const [goSpot, setGoSpot] = useState<GoSpotCounts>({ loads: 0, teams: 0, finished: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const apps = [...(access.go ? ['go'] : []), ...(access.spot ? ['spot'] : [])];
        const [scenariosBody, statsBody, granted, ...appStats] = await Promise.all([
          authFetch(`${API_BASE_URL}/client_scenarios.php?action=list`).then((r) => r.json().catch(() => ({}))),
          access.playground
            ? authFetch(`${API_BASE_URL}/statistics.php?action=overview`).then((r) => r.json().catch(() => ({})))
            : Promise.resolve({}),
          fetchGrantedScenarioIds(access),
          ...apps.map((app) =>
            authFetch(`${API_BASE_URL}/go.php?action=client_go_stats&app=${app}`)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null),
          ),
        ]);

        if (cancelled) return;

        const scenariosList = (scenariosBody?.data as ClientScenario[]) || [];
        const sorted = [...scenariosList].sort((a, b) =>
          recencyKey(b).localeCompare(recencyKey(a))
        );
        setScenarios(sorted);
        setGrantedIds(granted);

        const overview = statsBody?.overview ?? {};
        setCounts({
          games: Number(overview.total_games ?? 0),
          players: Number(overview.total_players ?? 0),
        });

        const sum = { loads: 0, teams: 0, finished: 0 };
        for (const body of appStats) {
          const totals = body?.data?.totals ?? {};
          sum.loads += Number(totals.loads ?? 0);
          sum.teams += Number(totals.teams ?? 0);
          sum.finished += Number(totals.finished ?? 0);
        }
        setGoSpot(sum);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [access.playground, access.go, access.spot]);

  // Same rule as the scenarios page: in GO-only mode only the granted scenarios
  // playable in the licensee's apps are theirs; the rest of the catalogue is
  // just "available".
  const inScope = goOnly ? scenarios.filter((s) => isPlayableInApps(s, access)) : scenarios;
  const held = inScope.filter((s) => isHeldScenario(s, grantedIds));
  const othersCount = inScope.length - held.length;
  const products = held.filter(isProduct);
  const customs = held.filter((s) => !isProduct(s));

  const stats = goOnly
    ? [
        { labelKey: 'statScenariosOwned', value: held.length, icon: Package, to: '/my/scenarios' },
        { labelKey: 'statGoLoads', value: goSpot.loads, icon: Smartphone, to: '/my/statistics' },
        { labelKey: 'statGoTeams', value: goSpot.teams, icon: Users, to: '/my/statistics' },
        { labelKey: 'statGoFinished', value: goSpot.finished, icon: CheckCircle2, to: '/my/statistics' },
      ]
    : [
        { labelKey: 'statScenariosOwned', value: products.length, icon: Package, to: '/my/scenarios' },
        { labelKey: 'statCustomScenarios', value: customs.length, icon: Sparkles, to: '/my/scenarios' },
        { labelKey: 'statGamesLaunched', value: counts.games, icon: Gamepad2, to: '/my/statistics' },
        { labelKey: 'statPlayers', value: counts.players, icon: UserCircle, to: '/my/statistics' },
        ...(hasGoSpot
          ? [{ labelKey: 'statGoTeams', value: goSpot.teams, icon: Users, to: '/my/statistics' }]
          : []),
      ];

  const openScenario = (uniqid?: string) => {
    if (uniqid) navigate(`/my/scenarios/${uniqid}`);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-900">
          {greeting ? t('welcomeBack', { name: greeting }) : t('welcome')}
        </h1>
        {access.playground && (
          <button
            type="button"
            onClick={() => navigate('/studio/scenarios/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
          >
            <Plus className="w-4 h-4" />
            {t('createScenario')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="bg-red-50 p-4 rounded-xl border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      ) : (
        <>
          <section>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
              {t('quickStats')}
            </h2>
            <div className={`grid grid-cols-2 gap-4 ${stats.length > 4 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
              {stats.map(({ labelKey, value, icon: Icon, to }) => (
                <button
                  key={labelKey}
                  onClick={() => navigate(to)}
                  className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all text-left flex items-center gap-4"
                >
                  <div className="p-2.5 bg-slate-100 rounded-lg">
                    <Icon className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-slate-900">{value}</div>
                    <div className="text-xs text-slate-500">{t(labelKey)}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <ScenarioSection
            title={t('ownedTitle')}
            scenarios={goOnly ? held : products}
            emptyHint={t('ownedEmpty')}
            onOpen={openScenario}
          />

          {othersCount > 0 && (
            <button
              type="button"
              onClick={() => navigate('/my/scenarios')}
              className="-mt-4 text-sm text-blue-600 hover:text-blue-500"
            >
              {t('othersAvailable', { count: othersCount })}
            </button>
          )}

          {access.playground && <ScenarioSection
            title={t('customTitle')}
            scenarios={customs}
            emptyHint={t('customEmpty')}
            onOpen={openScenario}
            emptyAction={
              <button
                type="button"
                onClick={() => navigate('/studio/scenarios/new')}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500"
              >
                <Plus className="w-4 h-4" />
                {t('createAScenario')}
              </button>
            }
          />}
        </>
      )}
    </div>
  );
}

function ScenarioSection({
  title,
  scenarios,
  emptyHint,
  emptyAction,
  onOpen,
}: {
  title: string;
  scenarios: ClientScenario[];
  emptyHint: string;
  emptyAction?: React.ReactNode;
  onOpen: (uniqid?: string) => void;
}) {
  const { user } = useAuth();
  return (
    <section>
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
        {title}
      </h2>
      {scenarios.length === 0 ? (
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
          <Film className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 mb-4">{emptyHint}</p>
          {emptyAction}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {scenarios.map((s) => {
            const visual = getGameVisualUrl(s.medias, s.uniqid, user?.language);
            return (
              <button
                key={s.id}
                onClick={() => onOpen(s.uniqid)}
                className="flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all text-left overflow-hidden group"
              >
                <div className="relative w-full overflow-hidden bg-slate-100 flex-shrink-0" style={{ height: '110px' }}>
                  {visual ? (
                    <img
                      src={visual}
                      alt={s.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Film className="w-10 h-10 text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h3 className="text-sm font-semibold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
                    {s.title}
                  </h3>
                  {s.game_type && (
                    <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium capitalize">
                      <GameTypeIcon type={s.game_type} className="w-3 h-3" />
                      {s.game_type}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
