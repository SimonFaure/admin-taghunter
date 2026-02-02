import { useSecureAuth } from '../../contexts/SecureAuthContext';
import { Film, Clock, Users, Play } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Scenario {
  id: string;
  name: string;
  description: string;
  duration: string;
  players: string;
  status: string;
}

export function MyScenariosView() {
  const { user } = useSecureAuth();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

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
            <div key={scenario.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-900 mb-2">{scenario.name}</h3>
                <p className="text-sm text-slate-600">{scenario.description}</p>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm text-slate-600">
                  <Clock className="w-4 h-4 mr-2" />
                  <span>{scenario.duration}</span>
                </div>
                <div className="flex items-center text-sm text-slate-600">
                  <Users className="w-4 h-4 mr-2" />
                  <span>{scenario.players}</span>
                </div>
              </div>

              <button className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all">
                <Play className="w-4 h-4" />
                <span>Launch Game</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
