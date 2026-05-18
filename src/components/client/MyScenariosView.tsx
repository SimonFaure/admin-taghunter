import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { secureAuth } from '../../lib/secureAuth';
import {
  Film,
  Play,
  Download,
  Star,
  Plus,
  Pencil,
} from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { recencyKey } from './scenarioSort';
import { ScenarioListControls } from '../scenarios/ScenarioListControls';
import type { ClientScenario } from './types';

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

type Filter = 'all' | 'products' | 'mine' | 'drafts';
type ViewMode = 'grid' | 'list';
type GroupBy = 'none' | 'game_type' | 'scenario_type';
type SortBy = 'recent' | 'name' | 'created';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'products', label: 'Products' },
  { value: 'mine', label: 'Mine' },
  { value: 'drafts', label: 'Drafts' },
];

const GROUP_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'game_type', label: 'Game type' },
  { value: 'scenario_type', label: 'Scenario type' },
];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently used' },
  { value: 'created', label: 'Date created' },
  { value: 'name', label: 'Name' },
];

export function MyScenariosView() {
  const navigate = useNavigate();
  const { user } = useSecureAuth();
  const [scenarios, setScenarios] = useState<ClientScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [sortBy, setSortBy] = useState<SortBy>('recent');

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
          setError(result.error || 'Failed to fetch scenarios');
        }
      } catch (err) {
        setError('Network error');
        console.error('Failed to fetch scenarios:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchScenarios();
  }, [user?.client_id]);

  const visible = useMemo(() => {
    const isProduct = (s: ClientScenario) => s.scenario_type === 'product';
    // client_id is a number on the wire and a string on AuthUser — coerce both sides.
    const isMine = (s: ClientScenario) =>
      !isProduct(s) && String(s.client_id ?? '') === String(user?.client_id ?? '');

    const passesFilter = (s: ClientScenario): boolean => {
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

    const filtered = scenarios.filter(passesFilter);

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
  }, [scenarios, filter, sortBy, user?.client_id]);

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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-slate-600">View and manage your available game scenarios</p>
        {user?.license_type === 'premium' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-sm font-medium">
            <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
            Premium — all scenarios unlocked
          </span>
        )}
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                filter === f.value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <ScenarioListControls
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          groupBy={groupBy}
          onGroupByChange={(v) => setGroupBy(v as GroupBy)}
          groupOptions={GROUP_OPTIONS}
          sortBy={sortBy}
          onSortByChange={(v) => setSortBy(v as SortBy)}
          sortOptions={SORT_OPTIONS}
          extraActions={
            <button
              type="button"
              onClick={() => navigate('/studio/scenarios/new')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500"
            >
              <Plus className="w-4 h-4" />
              New scenario
            </button>
          }
        />
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
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No scenarios match</h3>
          <p className="text-slate-600 mb-6">
            Try a different filter, or create a new scenario.
          </p>
          <button
            type="button"
            onClick={() => navigate('/studio/scenarios/new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500"
          >
            <Plus className="w-4 h-4" />
            Create a scenario
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
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {scenarios.map((scenario) => {
        const visual = getGameVisualUrl(scenario.medias, scenario.uniqid);
        const editable = scenario.scenario_type !== 'product' && !!scenario.uniqid;
        return (
          <button
            key={scenario.id}
            onClick={() => scenario.uniqid && onOpen(scenario.uniqid)}
            className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all text-left w-full group overflow-hidden relative"
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
                title="Edit in Studio"
                className="absolute top-3 right-3 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-600 hover:text-blue-600 shadow opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
              >
                <Pencil className="w-4 h-4" />
              </span>
            )}
            <div className="relative w-full bg-slate-100" style={{ height: '180px' }}>
              {visual ? (
                <img
                  src={visual}
                  alt={scenario.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Film className="w-12 h-12 text-slate-300" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/90 rounded-full text-xs font-medium text-slate-700">
                  <Play className="w-3 h-3" />
                  View
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

              {(scenario.game_type || scenario.scenario_type || scenario.version) && (
                <div className="flex gap-2 flex-wrap items-center">
                  {scenario.game_type && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium capitalize">
                      <Play className="w-2.5 h-2.5" />
                      {scenario.game_type}
                    </span>
                  )}
                  {scenario.version && (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
                      v{scenario.version}
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
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 w-16"></th>
            <th className="px-4 py-2">Title</th>
            <th className="px-4 py-2">Game type</th>
            <th className="px-4 py-2">Type</th>
            <th className="px-4 py-2">Version</th>
            <th className="px-4 py-2 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {scenarios.map((scenario) => {
            const visual = getGameVisualUrl(scenario.medias, scenario.uniqid);
            const editable = scenario.scenario_type !== 'product' && !!scenario.uniqid;
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
                <td className="px-4 py-2 text-slate-600 capitalize">{scenario.game_type || '—'}</td>
                <td className="px-4 py-2 text-slate-600 capitalize">{scenario.scenario_type || '—'}</td>
                <td className="px-4 py-2 text-slate-600">{scenario.version ? `v${scenario.version}` : '—'}</td>
                <td className="px-4 py-2 text-right">
                  {editable && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(scenario.uniqid!);
                      }}
                      title="Edit in Studio"
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
