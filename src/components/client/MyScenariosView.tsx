import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { secureAuth } from '../../lib/secureAuth';
import { Film, Play, ExternalLink } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Scenario {
  id: string;
  title: string;
  description: string;
  uniqid: string;
  game_type?: string;
  scenario_type?: string;
  granted_at?: string;
  granted_by_email?: string;
}

const API_BASE_URL = '/backend/api';

export function MyScenariosView() {
  const { user } = useSecureAuth();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
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

  const handleScenarioClick = (scenario: Scenario) => {
    window.open(`https://creator.taghunter.fr/download/${scenario.uniqid}`, '_blank');
  };

  return (
    <div>
      <div className="mb-6">
        <p className="text-slate-600">
          View and manage your available game scenarios
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
        </div>
      ) : error ? (
        <div className="bg-red-50 p-6 rounded-xl shadow-sm border border-red-200 text-center">
          <p className="text-red-600">{error}</p>
        </div>
      ) : scenarios.length === 0 ? (
        <div className="bg-white p-12 rounded-xl shadow-sm border border-slate-200 text-center">
          <Film className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Scenarios Available</h3>
          <p className="text-slate-600">
            You don't have any scenarios assigned yet. Contact your administrator for access.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => handleScenarioClick(scenario)}
              className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-lg hover:border-slate-300 transition-all text-left w-full group"
            >
              <div className="mb-4">
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                    {scenario.title}
                  </h3>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors flex-shrink-0 ml-2" />
                </div>
                <p className="text-sm text-slate-600 line-clamp-3">{scenario.description}</p>
              </div>

              {(scenario.game_type || scenario.scenario_type) && (
                <div className="space-y-2 mb-4">
                  {scenario.game_type && (
                    <div className="flex items-center text-sm text-slate-600">
                      <Play className="w-4 h-4 mr-2" />
                      <span className="capitalize">{scenario.game_type}</span>
                    </div>
                  )}
                  {scenario.scenario_type && (
                    <div className="inline-block px-2 py-1 bg-slate-100 rounded text-xs text-slate-700 capitalize">
                      {scenario.scenario_type}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">
                  Click to view scenario details
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
