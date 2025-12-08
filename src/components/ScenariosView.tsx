import { useState, useEffect } from 'react';
import { Film, User, Calendar, Trash2, Eye, Image as ImageIcon } from 'lucide-react';

interface Scenario {
  id: number;
  title: string;
  description: string;
  game_type: string;
  client_id: number | null;
  client_name: string | null;
  client_email: string | null;
  creator_name: string | null;
  media_url: string | null;
  created_at: string;
  uniqid: string | null;
  game_data: string | null;
}

export function ScenariosView() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [displayImage, setDisplayImage] = useState<string | null>(null);
  const [imageLabel, setImageLabel] = useState<string>('');
  const [imageError, setImageError] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  useEffect(() => {
    fetchScenarios();
  }, []);

  useEffect(() => {
    if (selectedScenario?.uniqid) {
      findImages(selectedScenario);
    }
  }, [selectedScenario]);

  const findImages = (scenario: Scenario) => {
    setImageError(false);
    setFallbackAttempted(false);
    setDisplayImage(null);
    setImageLabel('');

    if (!scenario.uniqid) return;

    let gameVisualUrl: string | null = null;
    let backgroundUrl: string | null = null;

    if (scenario.game_data) {
      try {
        const gameData = JSON.parse(scenario.game_data);
        if (gameData.game_visual) {
          gameVisualUrl = `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.game_visual}`;
        }
        if (gameData.backgroundImage) {
          backgroundUrl = `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.backgroundImage}`;
        }
      } catch (e) {
        console.error('Failed to parse game_data', e);
      }
    }

    if (gameVisualUrl) {
      setDisplayImage(gameVisualUrl);
      setImageLabel('Game Visual');
    } else if (backgroundUrl) {
      setDisplayImage(backgroundUrl);
      setImageLabel('Background Image');
    }
  };

  const handleImageError = () => {
    if (!fallbackAttempted && selectedScenario?.uniqid && selectedScenario.game_data) {
      try {
        const gameData = JSON.parse(selectedScenario.game_data);
        if (imageLabel === 'Game Visual' && gameData.backgroundImage) {
          setFallbackAttempted(true);
          setDisplayImage(`https://admin.taghunter.fr/media/${selectedScenario.uniqid}/${gameData.backgroundImage}`);
          setImageLabel('Background Image');
          setImageError(false);
          return;
        }
      } catch (e) {
        console.error('Failed to parse game_data for fallback', e);
      }
    }
    setImageError(true);
  };

  const fetchScenarios = async () => {
    try {
      setLoading(true);
      const response = await fetch('https://admin.taghunter.fr/backend/api/scenarios.php?action=list', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch scenarios');
      }

      const data = await response.json();
      setScenarios(data.scenarios || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scenarios');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this scenario?')) {
      return;
    }

    try {
      const response = await fetch('https://admin.taghunter.fr/backend/api/scenarios.php?action=delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete scenario');
      }

      setScenarios(scenarios.filter(s => s.id !== id));
      setSelectedScenario(null);
      setDisplayImage(null);
      setImageLabel('');
      setImageError(false);
      setFallbackAttempted(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete scenario');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (selectedScenario) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelectedScenario(null);
            setDisplayImage(null);
            setImageLabel('');
            setImageError(false);
            setFallbackAttempted(false);
          }}
          className="text-slate-600 hover:text-slate-900 font-medium"
        >
          ← Back to scenarios
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">{selectedScenario.title}</h3>
            <div className="flex items-center space-x-6 text-sm text-slate-600">
              <div className="flex items-center space-x-2">
                <Film className="w-4 h-4" />
                <span className="font-medium">{selectedScenario.game_type}</span>
              </div>
              {selectedScenario.creator_name && (
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4" />
                  <span>Published by {selectedScenario.creator_name}</span>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>{new Date(selectedScenario.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Description</h4>
              <p className="text-slate-600 whitespace-pre-wrap">{selectedScenario.description}</p>
            </div>

            {displayImage && !imageError && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
                  <ImageIcon className="w-4 h-4" />
                  <span>{imageLabel}</span>
                </h4>
                <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                  <img
                    src={displayImage}
                    alt={imageLabel}
                    className="w-full h-auto max-h-96 object-contain"
                    onError={handleImageError}
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            {selectedScenario.client_name && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Client</h4>
                <p className="text-slate-600">
                  {selectedScenario.client_name} ({selectedScenario.client_email})
                </p>
              </div>
            )}

            {selectedScenario.media_url && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Media File</h4>
                <a
                  href={`https://admin.taghunter.fr${selectedScenario.media_url}`}
                  download
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all"
                >
                  <Film className="w-4 h-4" />
                  <span>Download Media</span>
                </a>
              </div>
            )}

            <button
              onClick={() => handleDelete(selectedScenario.id)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all inline-flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Scenario</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-600">
            {scenarios.length} {scenarios.length === 1 ? 'scenario' : 'scenarios'} total
          </p>
        </div>
      </div>

      {scenarios.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Film className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No scenarios yet</h3>
          <p className="text-slate-600">Scenarios will appear here once they are created.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarios.map((scenario) => (
            <div
              key={scenario.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{scenario.title}</h3>
                    <p className="text-sm text-slate-600 line-clamp-2">{scenario.description}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center space-x-2 text-sm text-slate-600">
                    <Film className="w-4 h-4" />
                    <span className="font-medium">{scenario.game_type}</span>
                  </div>
                  {scenario.creator_name && (
                    <div className="flex items-center space-x-2 text-sm text-slate-600">
                      <User className="w-4 h-4" />
                      <span className="truncate">{scenario.creator_name}</span>
                    </div>
                  )}
                  <div className="flex items-center space-x-2 text-sm text-slate-600">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(scenario.created_at).toLocaleDateString()}</span>
                  </div>
                  {scenario.client_name && (
                    <div className="flex items-center space-x-2 text-sm text-slate-600">
                      <User className="w-4 h-4" />
                      <span className="truncate">Client: {scenario.client_name}</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedScenario(scenario)}
                  className="w-full px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all inline-flex items-center justify-center space-x-2"
                >
                  <Eye className="w-4 h-4" />
                  <span>View Details</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
