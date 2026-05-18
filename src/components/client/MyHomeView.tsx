import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Film, Package, LayoutGrid, CreditCard, Smartphone, Loader2 } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { authFetch } from '../../lib/authFetch';
import { getGameVisualUrl } from './MyScenariosView';
import { recencyKey } from './scenarioSort';
import type { ClientScenario } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/backend/api';

interface Counts {
  patterns: number;
  layouts: number;
  cards: number;
  devices: number;
}

export function MyHomeView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const greeting = user?.name || user?.email?.split('@')[0] || '';

  const [recents, setRecents] = useState<ClientScenario[]>([]);
  const [counts, setCounts] = useState<Counts>({ patterns: 0, layouts: 0, cards: 0, devices: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [scenariosRes, patternsRes, layoutsRes, cardsRes, devicesRes] = await Promise.all([
          authFetch(`${API_BASE_URL}/client_scenarios.php?action=list`),
          authFetch(`${API_BASE_URL}/patterns.php?action=list`),
          authFetch(`${API_BASE_URL}/layouts.php?action=list`),
          authFetch(`${API_BASE_URL}/cards.php?action=get_metadata`),
          authFetch(`${API_BASE_URL}/devices.php?action=list`),
        ]);

        const [scenariosBody, patternsBody, layoutsBody, cardsBody, devicesBody] = await Promise.all([
          scenariosRes.json().catch(() => ({})),
          patternsRes.json().catch(() => ({})),
          layoutsRes.json().catch(() => ({})),
          cardsRes.json().catch(() => ({})),
          devicesRes.json().catch(() => ({})),
        ]);

        if (cancelled) return;

        const scenariosList = (scenariosBody?.data as ClientScenario[]) || [];
        const sorted = [...scenariosList].sort((a, b) =>
          recencyKey(b).localeCompare(recencyKey(a))
        );
        setRecents(sorted.slice(0, 5));

        setCounts({
          patterns: Array.isArray(patternsBody?.data) ? patternsBody.data.length : 0,
          layouts: Array.isArray(layoutsBody?.data) ? layoutsBody.data.length : 0,
          cards: cardsBody?.data ? 1 : 0,
          devices: Array.isArray(devicesBody?.data) ? devicesBody.data.length : 0,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load home');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tiles = [
    { label: 'Patterns', value: counts.patterns, icon: Package, to: '/my/patterns' },
    { label: 'Layouts', value: counts.layouts, icon: LayoutGrid, to: '/my/layouts' },
    { label: 'Card sets', value: counts.cards, icon: CreditCard, to: '/my/cards' },
    { label: 'Devices', value: counts.devices, icon: Smartphone, to: '/my/devices' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-900">
          {greeting ? `Welcome back, ${greeting}` : 'Welcome'}
        </h1>
        <button
          type="button"
          onClick={() => navigate('/studio/scenarios/new')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
        >
          <Plus className="w-4 h-4" />
          Create scenario
        </button>
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
              Continue editing
            </h2>
            {recents.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
                <Film className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 mb-4">No scenarios yet. Start by creating your first.</p>
                <button
                  type="button"
                  onClick={() => navigate('/studio/scenarios/new')}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500"
                >
                  <Plus className="w-4 h-4" />
                  Create a scenario
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {recents.map((s) => {
                  const visual = getGameVisualUrl(s.medias, s.uniqid);
                  const when = s.updated_at || s.created_at || s.granted_at;
                  return (
                    <button
                      key={s.id}
                      onClick={() => s.uniqid && navigate(`/studio/scenarios/${s.uniqid}`)}
                      className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all text-left overflow-hidden group"
                    >
                      <div className="relative w-full bg-slate-100" style={{ height: '110px' }}>
                        {visual ? (
                          <img
                            src={visual}
                            alt={s.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-10 h-10 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="text-sm font-semibold text-slate-900 line-clamp-1 group-hover:text-blue-600 transition-colors">
                          {s.title}
                        </h3>
                        {when && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {new Date(when).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
              Your library
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {tiles.map(({ label, value, icon: Icon, to }) => (
                <button
                  key={label}
                  onClick={() => navigate(to)}
                  className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-300 transition-all text-left flex items-center gap-4"
                >
                  <div className="p-2.5 bg-slate-100 rounded-lg">
                    <Icon className="w-5 h-5 text-slate-600" />
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-slate-900">{value}</div>
                    <div className="text-xs text-slate-500">{label}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
