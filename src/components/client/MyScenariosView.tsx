import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { getAppAccess } from '../../auth/appAccess';
import { secureAuth } from '../../lib/secureAuth';
import {
  Film,
  Play,
  Download,
  Star,
  Plus,
  Pencil,
  User,
  Globe,
} from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { recencyKey } from './scenarioSort';
import { ScenarioListControls } from '../scenarios/ScenarioListControls';
import { GameTypeIcon } from '../icons/GameTypeIcons';
import { AUDIENCE_BANDS, type AudienceBand, getBandLabel, resolveBands } from '../../types/audience';
import {
  DIFFICULTY_LEVELS,
  coerceDifficulty,
  getDifficultyLabel,
  getDifficultyBadgeClass,
} from '../../types/difficulty';
import { normalizeUnivers } from '../../types/univers';
import { formatLangCode, resolveScenarioLanguages } from '../../types/scenarioLanguages';
import { listRegisteredAdapters } from '../../scenarios';
import type { ClientScenario } from './types';
import { HelpButton } from '../../help';
// Side-effect import: registers every shipped adapter so the game-type filter
// chips can be derived from the registry even when the editor route hasn't
// been visited yet (mirrors the admin ScenariosView).
import '../../scenarios/bootstrap';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';
const MEDIA_BASE_URL = import.meta.env.VITE_MEDIA_BASE_URL || '';

export function getGameVisualUrl(
  medias: string | Record<string, unknown> | null | undefined,
  uniqid?: string
): string | null {
  if (!medias) return null;
  try {
    const parsed =
      typeof medias === 'string' ? JSON.parse(medias) : medias;
    const gv = (parsed as { images?: { game_visual?: string } })?.images?.game_visual;
    if (!gv) return null;
    if (gv.startsWith('http')) return gv;
    if (gv.startsWith('/')) return `${MEDIA_BASE_URL}${gv}`;
    return uniqid ? `${MEDIA_BASE_URL}/media/${uniqid}/${gv}` : `${MEDIA_BASE_URL}/${gv}`;
  } catch {
    return null;
  }
}

// Provenance pills - a single-select axis. Every other criterion (game type,
// GO/Spot format, age band, difficulty, univers) is its own independent
// multi-select, ANDed across axes and ORed within one, so a licensee can cross
// "8-10 years" with "3 stars" the way the admin catalog already allows.
type Filter = 'all' | 'products' | 'mine' | 'drafts';
type ViewMode = 'grid' | 'list';
type GroupBy = 'none' | 'game_type' | 'scenario_type';
type SortBy = 'recent' | 'name' | 'created';

const FILTERS: { value: Filter; labelKey: string }[] = [
  { value: 'all', labelKey: 'filters.all' },
  { value: 'products', labelKey: 'filters.products' },
  { value: 'mine', labelKey: 'filters.mine' },
  { value: 'drafts', labelKey: 'filters.drafts' },
];

const GROUP_OPTIONS = [
  { value: 'none', labelKey: 'groupBy.none' },
  { value: 'game_type', labelKey: 'groupBy.gameType' },
  { value: 'scenario_type', labelKey: 'groupBy.scenarioType' },
];

const SORT_OPTIONS = [
  { value: 'recent', labelKey: 'sortBy.recent' },
  { value: 'created', labelKey: 'sortBy.created' },
  { value: 'name', labelKey: 'sortBy.name' },
];

export function MyScenariosView() {
  const { t } = useTranslation('scenariosList');
  const navigate = useNavigate();
  const { user } = useSecureAuth();
  // GO-only portal (client has GO/Spot but not Playground): show ONLY GO
  // scenarios, and keep just the cards/list view toggle + the audience filter;
  // hide the subtitle header, sort/group/new-scenario controls, and the
  // provenance/game-type filter chips. Derived per-app (project_client_app_section).
  const goClientOnly = getAppAccess(user).scenariosGoOnly;
  const [scenarios, setScenarios] = useState<ClientScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>('all');
  // Independent multi-select facets (item 23 - "filtrage multicritère").
  const [gameTypeFilter, setGameTypeFilter] = useState<Set<string>>(new Set());
  const [formatFilter, setFormatFilter] = useState<Set<'go' | 'spot'>>(new Set());
  const [bandFilter, setBandFilter] = useState<Set<AudienceBand>>(new Set());
  const [difficultyFilter, setDifficultyFilter] = useState<Set<number>>(new Set());
  const [universFilter, setUniversFilter] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [sortBy, setSortBy] = useState<SortBy>('recent');

  const toggleSetItem = <T,>(setState: React.Dispatch<React.SetStateAction<Set<T>>>, item: T) =>
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  const activeFacetCount =
    gameTypeFilter.size + formatFilter.size + bandFilter.size + difficultyFilter.size + universFilter.size;
  const clearFacets = () => {
    setGameTypeFilter(new Set());
    setFormatFilter(new Set());
    setBandFilter(new Set());
    setDifficultyFilter(new Set());
    setUniversFilter(new Set());
  };

  // One filter chip per registered game type, driven by the adapter registry -
  // but only for types actually present in this client's scenarios. The server
  // already hides scenarios of disabled game types (client_scenarios.php), so an
  // absent type means it's either unused or disabled for this client; either way
  // it shouldn't get a chip.
  const gameTypeFilters = useMemo(() => {
    const present = new Set(scenarios.map((s) => s.game_type).filter(Boolean));
    return listRegisteredAdapters()
      .filter((a) => present.has(a.kind))
      .map((a) => ({ key: a.kind, label: a.label }));
  }, [scenarios]);

  // Age bands actually present in this client's catalog, in canonical
  // young→old order - a pill for a band nobody authored is dead weight.
  const bandOptions = useMemo(() => {
    const present = new Set<AudienceBand>();
    for (const s of scenarios) {
      for (const b of resolveBands(s.audience_bands, s.audience)) present.add(b);
    }
    return AUDIENCE_BANDS.filter((b) => present.has(b.value)).map((b) => b.value);
  }, [scenarios]);

  // Distinct univers tags across the client's scenarios (case-folded key, first
  // spelling kept for display).
  const universOptions = useMemo(() => {
    const pool = new Map<string, string>();
    for (const s of scenarios) {
      for (const tag of normalizeUnivers(s.univers)) {
        const key = tag.toLowerCase();
        if (!pool.has(key)) pool.set(key, tag);
      }
    }
    return Array.from(pool.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [scenarios]);

  useEffect(() => {
    const fetchScenarios = async () => {
      if (!user?.client_id) {
        setLoading(false);
        return;
      }

      try {
        const token = secureAuth.getStoredToken();
        const response = await fetch(`${API_BASE_URL}/client_scenarios.php?action=list`, {
          credentials: 'include',
          headers: token ? { 'X-Auth-Token': token } : {},
        });

        const result = await response.json();

        if (response.ok && result.data) {
          setScenarios(result.data);
        } else {
          setError(result.error || t('errors.fetchFailed'));
        }
      } catch (err) {
        setError(t('errors.network'));
        console.error('Failed to fetch scenarios:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchScenarios();
  }, [user?.client_id]);

  const visible = useMemo(() => {
    const isProduct = (s: ClientScenario) => s.scenario_type === 'product';
    // client_id is a number on the wire and a string on AuthUser - coerce both sides.
    const isMine = (s: ClientScenario) =>
      !isProduct(s) && String(s.client_id ?? '') === String(user?.client_id ?? '');

    // Provenance - single select.
    const passesProvenance = (s: ClientScenario): boolean => {
      switch (filter) {
        case 'products':
          return isProduct(s);
        case 'mine':
          return isMine(s);
        case 'drafts':
          // Products are explicitly never "drafts" to the client, regardless of data.
          return !isProduct(s) && (s.status || 'draft') === 'draft';
        case 'all':
        default:
          return true;
      }
    };

    // Every facet AND-ed; within a facet, any selected value matches.
    const passesFacets = (s: ClientScenario): boolean => {
      if (gameTypeFilter.size > 0 && !gameTypeFilter.has(s.game_type || '')) return false;
      if (formatFilter.size > 0) {
        const go = formatFilter.has('go') && s.adaptable_go === true;
        const spot = formatFilter.has('spot') && s.adaptable_spot === true;
        if (!go && !spot) return false;
      }
      if (bandFilter.size > 0) {
        const bands = resolveBands(s.audience_bands, s.audience);
        if (!bands.some((b) => bandFilter.has(b))) return false;
      }
      if (difficultyFilter.size > 0) {
        if (s.difficulty === null || s.difficulty === undefined || s.difficulty === '') return false;
        if (!difficultyFilter.has(coerceDifficulty(s.difficulty))) return false;
      }
      if (universFilter.size > 0) {
        const tags = normalizeUnivers(s.univers).map((tag) => tag.toLowerCase());
        if (!tags.some((tag) => universFilter.has(tag))) return false;
      }
      return true;
    };

    // GO-only portal: hard-restrict to GO scenarios regardless of the active
    // filter, so a GO/Spot-without-Playground client only ever sees GO content.
    const filtered = scenarios.filter(
      (s) =>
        (!goClientOnly || s.adaptable_go === true) && passesProvenance(s) && passesFacets(s),
    );

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return (a.title || '').localeCompare(b.title || '');
        case 'created':
          return (b.created_at || '').localeCompare(a.created_at || '');
        case 'recent':
        default:
          return recencyKey(b).localeCompare(recencyKey(a));
      }
    });

    return sorted;
  }, [
    scenarios,
    filter,
    gameTypeFilter,
    formatFilter,
    bandFilter,
    difficultyFilter,
    universFilter,
    sortBy,
    user?.client_id,
    goClientOnly,
  ]);

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: '', label: '', items: visible }] as const;
    }
    const buckets = new Map<string, ClientScenario[]>();
    for (const s of visible) {
      const raw = groupBy === 'game_type' ? s.game_type : s.scenario_type;
      const key = (raw && String(raw)) || 'Other';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(s);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({ key, label: key, items }));
  }, [visible, groupBy]);

  return (
    <div>
      {!goClientOnly && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <p className="text-slate-600">{t('subtitle')}</p>
            <HelpButton chapter="scenarios" className="text-slate-400 hover:text-slate-700" />
          </div>
          {user?.license_type === 'premium' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-sm font-medium">
              <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
              {t('premiumBadge')}
            </span>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <ScenarioListControls
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          groupBy={groupBy}
          onGroupByChange={(v) => setGroupBy(v as GroupBy)}
          groupOptions={GROUP_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
          sortBy={sortBy}
          onSortByChange={(v) => setSortBy(v as SortBy)}
          sortOptions={SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
          viewToggleOnly={goClientOnly}
          extraActions={
            <button
              type="button"
              onClick={() => navigate('/studio/scenarios/new')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500"
            >
              <Plus className="w-4 h-4" />
              {t('newScenario')}
            </button>
          }
        />
      </div>

      <div className="mb-3 flex items-center gap-2 flex-wrap">
        {!goClientOnly && FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              filter === f.value
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {t(f.labelKey)}
          </button>
        ))}

        {/* Tag Hunter GO filter - only when the client has a MIX of GO and
            non-GO scenarios (a GO-only client needs no differentiation). */}
        {!goClientOnly && (() => {
          const goCount = scenarios.filter((s) => s.adaptable_go).length;
          if (goCount === 0 || goCount === scenarios.length) return null;
          return (
            <button
              type="button"
              onClick={() => toggleSetItem<'go' | 'spot'>(setFormatFilter, 'go')}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                formatFilter.has('go')
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-emerald-700 border-emerald-200 hover:border-emerald-300'
              }`}
            >
              GO
            </button>
          );
        })()}

        {/* Tag Hunter Spot filter - same "only when it differentiates" rule. */}
        {(() => {
          const spotCount = scenarios.filter((s) => s.adaptable_spot).length;
          if (spotCount === 0 || spotCount === scenarios.length) return null;
          return (
            <button
              type="button"
              onClick={() => toggleSetItem<'go' | 'spot'>(setFormatFilter, 'spot')}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                formatFilter.has('spot')
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-sky-700 border-sky-200 hover:border-sky-300'
              }`}
            >
              SPOT
            </button>
          );
        })()}

        {!goClientOnly && gameTypeFilters.length > 0 && (
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
        )}

        {!goClientOnly && gameTypeFilters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleSetItem<string>(setGameTypeFilter, key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
              gameTypeFilter.has(key)
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <GameTypeIcon type={key} className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Catalog facets - age bands (the six admin ranges, not the coarse trio),
          difficulty stars and univers tags. Combine freely: AND across rows,
          OR within a row. */}
      <div className="mb-6 flex items-center gap-1.5 flex-wrap">
        {bandOptions.length > 0 && (
          <>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">
              {t('facets.age')}
            </span>
            {bandOptions.map((band) => (
              <button
                key={band}
                type="button"
                onClick={() => toggleSetItem(setBandFilter, band)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-full border transition-colors ${
                  bandFilter.has(band)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                {getBandLabel(band, t)}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
          </>
        )}

        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">
          {t('facets.difficulty')}
        </span>
        {DIFFICULTY_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => toggleSetItem<number>(setDifficultyFilter, level)}
            title={`${level} / 5`}
            className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
              difficultyFilter.has(level)
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {'★'.repeat(level)}
          </button>
        ))}

        {universOptions.length > 0 && (
          <>
            <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide mr-1">
              {t('facets.univers')}
            </span>
            {universOptions.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleSetItem(setUniversFilter, key)}
                className={`px-2.5 py-1 text-sm rounded-full border transition-colors ${
                  universFilter.has(key)
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </>
        )}

        {activeFacetCount > 0 && (
          <button
            type="button"
            onClick={clearFacets}
            className="ml-1 px-2.5 py-1 text-sm rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            {t('facets.clear')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      ) : error ? (
        <div className="bg-red-50 p-6 rounded-xl shadow-sm border border-red-200 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center">
          <Film className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">{t('empty.title')}</h3>
          <p className="text-slate-600 mb-6">
            {t('empty.description')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/studio/scenarios/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
          >
            <Plus className="w-4 h-4" />
            {t('empty.cta')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.key || 'flat'}>
              {g.label && (
                <h2 className="text-xs uppercase tracking-wide text-slate-500 mb-3 font-semibold">
                  {g.label}
                </h2>
              )}
              {viewMode === 'grid' ? (
                <ScenarioGrid scenarios={g.items} onOpen={(uniqid) => navigate(`/my/scenarios/${uniqid}`)} onEdit={(uniqid) => navigate(`/studio/scenarios/${uniqid}`)} />
              ) : (
                <ScenarioTable scenarios={g.items} onOpen={(uniqid) => navigate(`/my/scenarios/${uniqid}`)} onEdit={(uniqid) => navigate(`/studio/scenarios/${uniqid}`)} />
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ScenarioGrid({
  scenarios,
  onOpen,
  onEdit,
}: {
  scenarios: ClientScenario[];
  onOpen: (uniqid: string) => void;
  onEdit: (uniqid: string) => void;
}) {
  const { t } = useTranslation('scenariosList');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {scenarios.map((scenario) => {
        const visual = getGameVisualUrl(scenario.medias, scenario.uniqid);
        const editable = scenario.scenario_type !== 'product' && !!scenario.uniqid;
        const bands = resolveBands(scenario.audience_bands, scenario.audience);
        const languages = resolveScenarioLanguages(
          scenario.available_languages,
          scenario.default_language,
        );
        return (
          <button
            key={scenario.id}
            onClick={() => scenario.uniqid && onOpen(scenario.uniqid)}
            className="flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all text-left w-full group overflow-hidden relative"
          >
            {editable && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(scenario.uniqid!);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    e.preventDefault();
                    onEdit(scenario.uniqid!);
                  }
                }}
                title={t('editInStudio')}
                className="absolute top-3 right-3 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-600 hover:text-blue-600 shadow opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
              </span>
            )}
            <div className="relative w-full overflow-hidden bg-slate-100 aspect-square flex-shrink-0">
              {visual ? (
                <img
                  src={visual}
                  alt={scenario.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Film className="w-12 h-12 text-slate-300" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/90 rounded-full text-xs font-medium text-slate-700">
                  <Play className="w-3 h-3" />
                  {t('view')}
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                  {scenario.title}
                </h3>
                {scenario.has_zip_files && (
                  <Download className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                )}
              </div>
              <p className="text-sm text-slate-500 line-clamp-2 mb-3">{scenario.description}</p>

              {(scenario.game_type || scenario.difficulty || bands.length > 0 || languages.length > 0 || scenario.scenario_type || scenario.version || scenario.adaptable_go || scenario.adaptable_spot) && (
                <div className="flex gap-1.5 flex-wrap items-center">
                  {scenario.game_type && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium capitalize">
                      <GameTypeIcon type={scenario.game_type} className="w-3 h-3" />
                      {scenario.game_type}
                    </span>
                  )}
                  {scenario.adaptable_go && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">
                      GO
                    </span>
                  )}
                  {scenario.adaptable_spot && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full text-xs font-semibold">
                      SPOT
                    </span>
                  )}
                  {scenario.difficulty && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${getDifficultyBadgeClass(scenario.difficulty)}`}>
                      {getDifficultyLabel(scenario.difficulty, t)}
                    </span>
                  )}
                  {bands.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                      <User className="w-3 h-3" />
                      {bands.map((b) => getBandLabel(b, t)).join(' · ')}
                    </span>
                  )}
                  {/* Authored languages, visible without opening the details. */}
                  {languages.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded-full text-xs font-semibold"
                    >
                      <Globe className="w-3 h-3" />
                      {formatLangCode(code)}
                    </span>
                  ))}
                  {scenario.version && (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
                      {t('versionShort', { version: scenario.version })}
                    </span>
                  )}
                  {scenario.scenario_type && (
                    <span className="px-2 py-0.5 bg-slate-100 rounded-full text-xs text-slate-600 capitalize">
                      {scenario.scenario_type}
                    </span>
                  )}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ScenarioTable({
  scenarios,
  onOpen,
  onEdit,
}: {
  scenarios: ClientScenario[];
  onOpen: (uniqid: string) => void;
  onEdit: (uniqid: string) => void;
}) {
  const { t } = useTranslation('scenariosList');
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 w-16"></th>
            <th className="px-4 py-2">{t('table.title')}</th>
            <th className="px-4 py-2">{t('table.gameType')}</th>
            <th className="px-4 py-2">{t('table.audience')}</th>
            <th className="px-4 py-2">{t('table.difficulty')}</th>
            <th className="px-4 py-2">{t('table.languages')}</th>
            <th className="px-4 py-2">{t('table.type')}</th>
            <th className="px-4 py-2">{t('table.version')}</th>
            <th className="px-4 py-2 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((scenario) => {
            const visual = getGameVisualUrl(scenario.medias, scenario.uniqid);
            const editable = scenario.scenario_type !== 'product' && !!scenario.uniqid;
            const bands = resolveBands(scenario.audience_bands, scenario.audience);
            const languages = resolveScenarioLanguages(
              scenario.available_languages,
              scenario.default_language,
            );
            return (
              <tr
                key={scenario.id}
                onClick={() => scenario.uniqid && onOpen(scenario.uniqid)}
                className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
              >
                <td className="px-4 py-2">
                  <div className="w-10 h-10 rounded bg-slate-100 overflow-hidden flex items-center justify-center">
                    {visual ? (
                      <img src={visual} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Film className="w-5 h-5 text-slate-300" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 font-medium text-slate-900">{scenario.title}</td>
                <td className="px-4 py-2 text-slate-600 capitalize">
                  {scenario.game_type ? (
                    <span className="inline-flex items-center gap-1.5">
                      <GameTypeIcon type={scenario.game_type} className="w-4 h-4 text-slate-400" />
                      {scenario.game_type}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-4 py-2">
                  {bands.length > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                      <User className="w-3 h-3" />
                      {bands.map((b) => getBandLabel(b, t)).join(' · ')}
                    </span>
                  ) : <span className="text-slate-400">-</span>}
                </td>
                <td className="px-4 py-2">
                  {scenario.difficulty ? (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${getDifficultyBadgeClass(scenario.difficulty)}`}>
                      {getDifficultyLabel(scenario.difficulty, t)}
                    </span>
                  ) : <span className="text-slate-400">-</span>}
                </td>
                <td className="px-4 py-2">
                  {languages.length > 0 ? (
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      {languages.map((code) => (
                        <span
                          key={code}
                          className="inline-flex items-center px-2 py-0.5 bg-cyan-50 text-cyan-700 rounded-full text-xs font-semibold"
                        >
                          {formatLangCode(code)}
                        </span>
                      ))}
                    </span>
                  ) : <span className="text-slate-400">-</span>}
                </td>
                <td className="px-4 py-2 text-slate-600 capitalize">{scenario.scenario_type || '-'}</td>
                <td className="px-4 py-2 text-slate-600">{scenario.version ? t('versionShort', { version: scenario.version }) : '-'}</td>
                <td className="px-4 py-2 text-right">
                  {editable && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(scenario.uniqid!);
                      }}
                      title={t('editInStudio')}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-slate-500 hover:text-blue-600 hover:bg-slate-100"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
