import { useState, useEffect } from 'react';
import { Film, User, Calendar, Trash2, Eye, Image as ImageIcon, FileJson, Globe } from 'lucide-react';

interface Scenario {
  id: number;
  title: string;
  description: string;
  game_type: string;
  scenario_type: string | null;
  client_id: number | null;
  client_name: string | null;
  client_email: string | null;
  creator_name: string | null;
  media_url: string | null;
  created_at: string;
  uniqid: string | null;
  data: string | null;
  medias: string | null;
  game_data?: string | null;
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
  const [detectedLanguages, setDetectedLanguages] = useState<string[]>([]);
  const [parsedGameData, setParsedGameData] = useState<any>(null);

  useEffect(() => {
    fetchScenarios();
  }, []);

  useEffect(() => {
    if (selectedScenario?.uniqid) {
      findImages(selectedScenario);
      detectLanguages(selectedScenario);
    }
  }, [selectedScenario]);

  const detectLanguages = (scenario: Scenario) => {
    setDetectedLanguages([]);
    setParsedGameData(null);

    const dataSource = scenario.data || scenario.game_data;
    if (!dataSource) {
      return;
    }

    try {
      const dataObj = JSON.parse(dataSource);
      setParsedGameData(dataObj);

      const languages = new Set<string>();

      if (dataObj.available_languages && Array.isArray(dataObj.available_languages)) {
        dataObj.available_languages.forEach((lang: string) => {
          languages.add(lang.toUpperCase());
        });
      }

      if (dataObj.translations && typeof dataObj.translations === 'object') {
        Object.keys(dataObj.translations).forEach(lang => {
          languages.add(lang.toUpperCase());
        });
      }

      if (dataObj.default_language && typeof dataObj.default_language === 'string') {
        languages.add(dataObj.default_language.toUpperCase());
      }

      if (languages.size === 0) {
        const commonLanguageCodes = ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh', 'ar', 'ko'];

        const detectInObject = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;

          Object.keys(obj).forEach(key => {
            const lowerKey = key.toLowerCase();

            commonLanguageCodes.forEach(langCode => {
              if (lowerKey.endsWith(`_${langCode}`) || lowerKey === langCode) {
                languages.add(langCode.toUpperCase());
              }
            });

            if (typeof obj[key] === 'object' && obj[key] !== null) {
              detectInObject(obj[key]);
            }
          });
        };

        detectInObject(dataObj);
      }

      setDetectedLanguages(Array.from(languages).sort());
    } catch (e) {
      console.error('Failed to detect languages in data', e);
    }
  };

  const findImages = (scenario: Scenario) => {
    setImageError(false);
    setFallbackAttempted(false);
    setDisplayImage(null);
    setImageLabel('');

    console.log('Finding images for scenario:', scenario.title);
    console.log('Scenario uniqid:', scenario.uniqid);
    console.log('Scenario medias:', scenario.medias);
    console.log('Scenario data:', scenario.data);

    if (!scenario.uniqid) {
      console.log('No uniqid found');
      return;
    }

    let gameVisualUrl: string | null = null;
    let backgroundUrl: string | null = null;

    if (scenario.medias) {
      try {
        const medias = JSON.parse(scenario.medias);
        console.log('Parsed medias:', medias);

        if (medias.images?.game_visual) {
          gameVisualUrl = medias.images.game_visual.startsWith('http')
            ? medias.images.game_visual
            : `https://admin.taghunter.fr/media/${scenario.uniqid}/${medias.images.game_visual}`;
          console.log('Found game_visual from medias.images.game_visual:', gameVisualUrl);
        }

        if (medias.images?.background_image) {
          backgroundUrl = medias.images.background_image.startsWith('http')
            ? medias.images.background_image
            : `https://admin.taghunter.fr/media/${scenario.uniqid}/${medias.images.background_image}`;
          console.log('Found background_image from medias.images.background_image:', backgroundUrl);
        }
      } catch (e) {
        console.error('Failed to parse medias', e);
      }
    }

    if (!gameVisualUrl && !backgroundUrl && scenario.game_data) {
      try {
        const gameData = JSON.parse(scenario.game_data);
        console.log('Parsed game_data (fallback):', gameData);

        if (gameData.media?.images?.game_visual) {
          gameVisualUrl = gameData.media.images.game_visual.startsWith('http')
            ? gameData.media.images.game_visual
            : `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.media.images.game_visual}`;
          console.log('Found game_visual (new structure):', gameVisualUrl);
        } else if (gameData.data?.game_meta?.game_visual) {
          gameVisualUrl = gameData.data.game_meta.game_visual.startsWith('http')
            ? gameData.data.game_meta.game_visual
            : `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.data.game_meta.game_visual}`;
          console.log('Found game_visual (new data structure):', gameVisualUrl);
        } else if (gameData.game_meta?.game_visual) {
          gameVisualUrl = gameData.game_meta.game_visual.startsWith('http')
            ? gameData.game_meta.game_visual
            : `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.game_meta.game_visual}`;
          console.log('Found game_visual (old structure):', gameVisualUrl);
        } else if (gameData.game_visual) {
          gameVisualUrl = `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.game_visual}`;
          console.log('Found game_visual (legacy):', gameVisualUrl);
        }

        if (gameData.media?.images?.background_image) {
          backgroundUrl = `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.media.images.background_image}`;
          console.log('Found background_image (new structure):', backgroundUrl);
        } else if (gameData.data?.game_meta?.background_image) {
          backgroundUrl = `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.data.game_meta.background_image}`;
          console.log('Found background_image (new data structure):', backgroundUrl);
        } else if (gameData.game_meta?.background_image) {
          backgroundUrl = `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.game_meta.background_image}`;
          console.log('Found background_image (old structure):', backgroundUrl);
        } else if (gameData.backgroundImage) {
          backgroundUrl = `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.backgroundImage}`;
          console.log('Found backgroundImage (legacy):', backgroundUrl);
        }
      } catch (e) {
        console.error('Failed to parse game_data', e);
      }
    }

    if (gameVisualUrl) {
      console.log('Setting display image to game_visual');
      setDisplayImage(gameVisualUrl);
      setImageLabel('Game Visual');
    } else if (backgroundUrl) {
      console.log('Setting display image to backgroundImage');
      setDisplayImage(backgroundUrl);
      setImageLabel('Background Image');
    } else {
      console.log('No images found in game_data');
    }
  };

  const handleImageError = () => {
    console.log('Image failed to load:', displayImage);
    console.log('Current label:', imageLabel);
    console.log('Fallback attempted:', fallbackAttempted);

    if (!fallbackAttempted && selectedScenario?.uniqid) {
      try {
        let backgroundUrl: string | null = null;

        if (selectedScenario.medias) {
          const medias = JSON.parse(selectedScenario.medias);
          if (imageLabel === 'Game Visual' && medias.images?.background_image) {
            backgroundUrl = medias.images.background_image;
          }
        }

        if (!backgroundUrl && selectedScenario.game_data) {
          const gameData = JSON.parse(selectedScenario.game_data);
          if (imageLabel === 'Game Visual') {
            backgroundUrl = gameData.media?.images?.background_image ||
                           gameData.data?.game_meta?.background_image ||
                           gameData.game_meta?.background_image ||
                           gameData.backgroundImage;
          }
        }

        if (backgroundUrl) {
          console.log('Trying fallback to backgroundImage');
          setFallbackAttempted(true);
          const fullUrl = backgroundUrl.startsWith('http')
            ? backgroundUrl
            : `https://admin.taghunter.fr/media/${selectedScenario.uniqid}/${backgroundUrl}`;
          setDisplayImage(fullUrl);
          setImageLabel('Background Image');
          setImageError(false);
          return;
        }
      } catch (e) {
        console.error('Failed to parse data for fallback', e);
      }
    }
    console.log('No fallback available, marking as error');
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
      setDetectedLanguages([]);
      setParsedGameData(null);
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
    let gamePublic = null;
    const dataSource = selectedScenario.data || selectedScenario.game_data;
    if (dataSource) {
      try {
        const dataObj = JSON.parse(dataSource);
        if (dataObj.game_meta?.game_public !== undefined) {
          gamePublic = dataObj.game_meta.game_public;
        } else if (dataObj.data?.game_meta?.game_public !== undefined) {
          gamePublic = dataObj.data.game_meta.game_public;
        }
      } catch (e) {
        console.error('Failed to parse data for game_public', e);
      }
    }

    return (
      <div className="space-y-6">
        <button
          onClick={() => {
            setSelectedScenario(null);
            setDisplayImage(null);
            setImageLabel('');
            setImageError(false);
            setFallbackAttempted(false);
            setDetectedLanguages([]);
            setParsedGameData(null);
          }}
          className="text-slate-600 hover:text-slate-900 font-medium"
        >
          ← Back to scenarios
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">{selectedScenario.title}</h3>

            <div className="flex items-center flex-wrap gap-6 text-sm text-slate-600 mb-4">
              <div className="flex items-center space-x-2">
                <Film className="w-4 h-4" />
                <span className="font-medium">{selectedScenario.game_type}</span>
              </div>
              {selectedScenario.scenario_type && (
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-1 bg-slate-100 rounded text-xs font-semibold text-slate-700">
                    {selectedScenario.scenario_type}
                  </span>
                </div>
              )}
              {selectedScenario.creator_name && (
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4" />
                  <span>Published by {selectedScenario.creator_name}</span>
                </div>
              )}
              {gamePublic !== null && (
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                    {typeof gamePublic === 'string' ? gamePublic.charAt(0).toUpperCase() + gamePublic.slice(1) : gamePublic ? 'Public' : 'Private'}
                  </span>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>{new Date(selectedScenario.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <h4 className="text-sm font-semibold text-slate-700 mb-2">Description</h4>
                <p className="text-slate-600 whitespace-pre-wrap">{selectedScenario.description}</p>
              </div>
              {displayImage && !imageError && (
                <div className="lg:col-span-1">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4" />
                    <span>{imageLabel}</span>
                  </h4>
                  <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    <img
                      src={displayImage}
                      alt={imageLabel}
                      className="w-full h-auto object-contain"
                      onError={handleImageError}
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
            </div>

            {detectedLanguages.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
                  <Globe className="w-4 h-4" />
                  <span>Available Languages</span>
                </h4>
                <div className="flex flex-wrap gap-2">
                  {detectedLanguages.map((lang) => (
                    <span
                      key={lang}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold"
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {parsedGameData && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center space-x-2">
                  <FileJson className="w-4 h-4" />
                  <span>Game Data (JSON)</span>
                </h4>
                <div className="bg-slate-900 text-slate-100 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                    {JSON.stringify(parsedGameData, null, 2)}
                  </pre>
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

  const groupedScenarios = scenarios.reduce((acc, scenario) => {
    const type = scenario.scenario_type || 'Uncategorized';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(scenario);
    return acc;
  }, {} as Record<string, Scenario[]>);

  const scenarioTypes = Object.keys(groupedScenarios).sort();

  const renderScenarioCard = (scenario: Scenario) => (
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
  );

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
        <div className="space-y-8">
          {scenarioTypes.map((type) => (
            <div key={type} className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="h-px flex-1 bg-slate-200"></div>
                <h3 className="text-lg font-bold text-slate-900 px-4 py-2 bg-slate-100 rounded-lg">
                  {type}
                </h3>
                <div className="h-px flex-1 bg-slate-200"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {groupedScenarios[type].map((scenario) => renderScenarioCard(scenario))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
