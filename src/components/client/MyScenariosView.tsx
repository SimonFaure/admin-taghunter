import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { secureAuth } from '../../lib/secureAuth';
import { Film, Play, Download, Star, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClientScenario } from './types';

interface MyScenariosViewProps {
  onSelectScenario: (scenario: ClientScenario) => void;
}

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

export function MyScenariosView({ onSelectScenario }: MyScenariosViewProps) {
  const navigate = useNavigate();
  const { user } = useSecureAuth();
  const [scenarios, setScenarios] = useState<ClientScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-slate-600">View and manage your available game scenarios</p>
        <div className="flex items-center gap-3">
          {user?.license_type === 'premium' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-sm font-medium">
              <Star className="w-3.5 h-3.5 fill-amber-400 stroke-amber-400" />
              Premium — all scenarios unlocked
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate('/studio/scenarios/new')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500"
          >
            <Plus className="w-4 h-4" />
            New scenario
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900" />
        </div>
      ) : error ? (
        <div className="bg-red-50 p-6 rounded-xl shadow-sm border border-red-200 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      ) : scenarios.length === 0 ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center">
          <Film className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No scenarios yet</h3>
          <p className="text-slate-600 mb-6">
            Create your first scenario to get started, or contact your administrator if you expected existing ones to be available.
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarios.map((scenario) => {
            const visual = getGameVisualUrl(scenario.medias, scenario.uniqid);
            return (
              <button
                key={scenario.id}
                onClick={() => onSelectScenario(scenario)}
                className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all text-left w-full group overflow-hidden"
              >
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
      )}
    </div>
  );
}
