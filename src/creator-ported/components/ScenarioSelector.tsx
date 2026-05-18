import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { db } from '../lib/db';

interface Scenario {
  id: string;
  title: string;
  uniqid: string;
  game_type: string;
}

interface ScenarioSelectorProps {
  gameType: 'tagquest' | 'mystery' | 'tracks';
  onSelect: (scenarioId: string) => void;
  onClose: () => void;
}

export function ScenarioSelector({ gameType, onSelect, onClose }: ScenarioSelectorProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadScenarios();
  }, [gameType]);

  const loadScenarios = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await db
        .from('scenarios')
        .select('id, title, uniqid, game_type')
        .eq('game_type', gameType)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setScenarios(data || []);
    } catch (err) {
      console.error('Error loading scenarios:', err);
      setError('Failed to load scenarios');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full border border-slate-700">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h3 className="text-xl font-bold text-white">
            Select a {gameType.charAt(0).toUpperCase() + gameType.slice(1)} Scenario
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-blue-400" size={32} />
            </div>
          ) : error ? (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/50 rounded-lg">
              <AlertCircle className="text-red-400" size={20} />
              <span className="text-red-400">{error}</span>
            </div>
          ) : scenarios.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400">
                No {gameType} scenarios found. Create a scenario first.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => onSelect(scenario.id)}
                  className="w-full p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600 hover:border-blue-500 text-left"
                >
                  <h4 className="text-white font-semibold mb-1">{scenario.title}</h4>
                  <p className="text-slate-400 text-sm">ID: {scenario.uniqid}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
