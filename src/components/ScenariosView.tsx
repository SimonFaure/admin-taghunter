import { useState, useEffect } from 'react';
import { Film, User, Calendar, Trash2, Eye, Image as ImageIcon, FileJson, Globe, Tag, LayoutGrid as Layout, X, Upload, File, Download, ChevronDown } from 'lucide-react';

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
  game_meta?: string | null;
  scenario_layout?: string | null;
  status?: string | null;
}

interface LayoutElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

function getGameVersion(scenario: Scenario): string | null {
  if (scenario.game_meta) {
    try {
      const gameMeta = JSON.parse(scenario.game_meta);
      return gameMeta.game_version || null;
    } catch (e) {
      console.error('Failed to parse game_meta for version', e);
    }
  }
  return null;
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
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [layoutElements, setLayoutElements] = useState<LayoutElement[]>([]);
  const [scenarioFiles, setScenarioFiles] = useState<any[]>([]);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    fetchScenarios();
  }, []);

  useEffect(() => {
    if (selectedScenario?.uniqid) {
      findImages(selectedScenario);
      detectLanguages(selectedScenario);
      fetchScenarioFiles(selectedScenario.id);
    }
  }, [selectedScenario]);

  const handleShowLayout = () => {
    if (!selectedScenario?.scenario_layout) {
      alert('No layout data available for this scenario');
      return;
    }

    try {
      const layout = JSON.parse(selectedScenario.scenario_layout);
      if (Array.isArray(layout)) {
        setLayoutElements(layout);
        setShowLayoutModal(true);
      } else {
        alert('Invalid layout data format');
      }
    } catch (e) {
      console.error('Failed to parse scenario_layout', e);
      alert('Failed to parse layout data');
    }
  };

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

  const fetchScenarioFiles = async (scenarioId: number) => {
    try {
      const response = await fetch(`https://admin.taghunter.fr/backend/api/scenario_files.php?action=list&scenario_id=${scenarioId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }

      const data = await response.json();
      setScenarioFiles(data.files || []);
    } catch (err) {
      console.error('Failed to fetch scenario files:', err);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedScenario || newStatus === selectedScenario.status) return;
    setStatusUpdating(true);
    setStatusError(null);
    try {
      const formData = new FormData();
      formData.append('id', String(selectedScenario.id));
      formData.append('status', newStatus);
      const response = await fetch('https://admin.taghunter.fr/backend/api/scenarios.php?action=update', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to update status');
      }
      const updated = { ...selectedScenario, status: newStatus };
      setSelectedScenario(updated);
      setScenarios(prev => prev.map(s => s.id === selectedScenario.id ? updated : s));
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setUploadFile(files[0]);
      if (!uploadFileName) {
        setUploadFileName(files[0].name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploadFile || !uploadFileName || !selectedScenario) {
      alert('Please fill in all fields');
      return;
    }

    try {
      setUploadLoading(true);

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', uploadFileName);
      formData.append('scenario_id', selectedScenario.id.toString());

      const response = await fetch('https://admin.taghunter.fr/backend/api/scenario_files.php?action=upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const data = await response.json();
      setScenarioFiles([data.file, ...scenarioFiles]);
      setUploadFileName('');
      setUploadFile(null);

      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDeleteFile = async (fileId: number) => {
    if (!confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      const response = await fetch('https://admin.taghunter.fr/backend/api/scenario_files.php?action=delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ id: fileId }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      setScenarioFiles(scenarioFiles.filter(f => f.id !== fileId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete file');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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
      setScenarioFiles([]);
      setUploadFileName('');
      setUploadFile(null);
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
            setScenarioFiles([]);
            setUploadFileName('');
            setUploadFile(null);
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
                <span className="font-medium capitalize">{selectedScenario.game_type}</span>
              </div>
              {getGameVersion(selectedScenario) && (
                <div className="flex items-center space-x-2">
                  <Tag className="w-4 h-4" />
                  <span className="px-2 py-1 bg-emerald-100 rounded text-xs font-semibold text-emerald-700">
                    Version {getGameVersion(selectedScenario)}
                  </span>
                </div>
              )}
              {selectedScenario.scenario_type && (
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-1 bg-slate-100 rounded text-xs font-semibold text-slate-700 capitalize">
                    {selectedScenario.scenario_type}
                  </span>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <select
                    value={selectedScenario.status || 'draft'}
                    onChange={e => handleStatusChange(e.target.value)}
                    disabled={statusUpdating}
                    className={`appearance-none pl-2 pr-6 py-1 rounded text-xs font-semibold capitalize border cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${
                      (selectedScenario.status || 'draft') === 'published'
                        ? 'bg-green-100 text-green-700 border-green-200 focus:ring-green-400'
                        : (selectedScenario.status || 'draft') === 'archived'
                        ? 'bg-slate-200 text-slate-600 border-slate-300 focus:ring-slate-400'
                        : 'bg-amber-100 text-amber-700 border-amber-200 focus:ring-amber-400'
                    }`}
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                    <option value="archived">archived</option>
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                </div>
                {statusUpdating && (
                  <span className="text-xs text-slate-400 animate-pulse">Saving...</span>
                )}
                {statusError && (
                  <span className="text-xs text-red-500">{statusError}</span>
                )}
              </div>
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

            {detectedLanguages.length > 0 && (
              <div className="mt-4 flex items-start space-x-2">
                <Globe className="w-4 h-4 text-slate-600 mt-0.5" />
                <div>
                  <span className="text-sm font-semibold text-slate-700 block mb-2">Available Languages</span>
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
              </div>
            )}
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

            <div className="mb-6 border-t border-slate-200 pt-6">
              <h4 className="text-sm font-semibold text-slate-700 mb-4 flex items-center space-x-2">
                <File className="w-4 h-4" />
                <span>Scenario Files</span>
              </h4>

              <form onSubmit={handleFileUpload} className="mb-6 bg-slate-50 p-4 rounded-lg">
                <div
                  className={`border-2 border-dashed rounded-lg p-6 mb-4 transition-all ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-300 bg-white hover:border-slate-400'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="text-center">
                    <Upload className={`w-12 h-12 mx-auto mb-3 ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
                    <p className="text-sm font-medium text-slate-700 mb-1">
                      {uploadFile ? uploadFile.name : 'Drag and drop your file here'}
                    </p>
                    <p className="text-xs text-slate-500 mb-3">or</p>
                    <label
                      htmlFor="file-upload"
                      className="inline-block px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-all"
                    >
                      Browse Files
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setUploadFile(file);
                        if (file && !uploadFileName) {
                          setUploadFileName(file.name.replace(/\.[^/.]+$/, ''));
                        }
                      }}
                      className="hidden"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    File Display Name
                  </label>
                  <input
                    type="text"
                    value={uploadFileName}
                    onChange={(e) => setUploadFileName(e.target.value)}
                    placeholder="Enter a name for this file"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={uploadLoading || !uploadFile}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all inline-flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="w-4 h-4" />
                  <span>{uploadLoading ? 'Uploading...' : 'Upload File'}</span>
                </button>
              </form>

              {scenarioFiles.length > 0 ? (
                <div className="space-y-2">
                  {scenarioFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center space-x-3 flex-1">
                        <File className="w-5 h-5 text-slate-400" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{file.name}</p>
                          <p className="text-xs text-slate-500">
                            {formatFileSize(file.file_size)} • {new Date(file.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        title="Delete file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">No files uploaded yet</p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              {selectedScenario.scenario_layout && (
                <button
                  onClick={handleShowLayout}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all inline-flex items-center space-x-2"
                >
                  <Layout className="w-4 h-4" />
                  <span>Show Layout</span>
                </button>
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

        {showLayoutModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowLayoutModal(false)}>
            <div className="relative max-w-6xl w-full max-h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                  <Layout className="w-5 h-5" />
                  <span>Scenario Layout - {selectedScenario.title}</span>
                </h3>
                <button
                  onClick={() => setShowLayoutModal(false)}
                  className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>

              <div className="overflow-auto max-h-[calc(90vh-4rem)]">
                <div className="relative inline-block min-w-full">
                  {displayImage && !imageError ? (
                    <>
                      <img
                        src={displayImage}
                        alt="Background"
                        className="w-full h-auto"
                        style={{ display: 'block' }}
                      />
                      {layoutElements.map((element) => (
                        <div
                          key={element.id}
                          className="absolute border-2 border-blue-500 bg-blue-500 bg-opacity-20"
                          style={{
                            left: `${element.x}%`,
                            top: `${element.y}%`,
                            width: `${element.width}%`,
                            height: `${element.height}%`,
                          }}
                          title={element.label || `${element.type} (${element.id})`}
                        >
                          {element.label && (
                            <div className="absolute top-0 left-0 bg-blue-600 text-white text-xs px-2 py-1 rounded-br font-semibold whitespace-nowrap">
                              {element.label}
                            </div>
                          )}
                          <div className="absolute bottom-0 right-0 bg-slate-900 bg-opacity-75 text-white text-xs px-2 py-1 rounded-tl">
                            {element.type}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="p-12 text-center text-slate-600">
                      <ImageIcon className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                      <p>No background image available for this scenario</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span className="font-semibold">{layoutElements.length} layout element(s)</span>
                  <span className="text-xs">Positions and sizes are relative to the background image</span>
                </div>
              </div>
            </div>
          </div>
        )}
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

  const getScenarioThumbnail = (scenario: Scenario): string | null => {
    if (!scenario.uniqid) return null;

    let gameVisualUrl: string | null = null;
    let backgroundUrl: string | null = null;

    if (scenario.medias) {
      try {
        const medias = JSON.parse(scenario.medias);
        if (medias.images?.game_visual) {
          gameVisualUrl = medias.images.game_visual.startsWith('http')
            ? medias.images.game_visual
            : `https://admin.taghunter.fr/media/${scenario.uniqid}/${medias.images.game_visual}`;
        }
        if (medias.images?.background_image) {
          backgroundUrl = medias.images.background_image.startsWith('http')
            ? medias.images.background_image
            : `https://admin.taghunter.fr/media/${scenario.uniqid}/${medias.images.background_image}`;
        }
      } catch (e) {
        console.error('Failed to parse medias', e);
      }
    }

    if (!gameVisualUrl && !backgroundUrl && scenario.data) {
      try {
        const gameData = JSON.parse(scenario.data);
        if (gameData.media?.images?.game_visual) {
          gameVisualUrl = gameData.media.images.game_visual.startsWith('http')
            ? gameData.media.images.game_visual
            : `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.media.images.game_visual}`;
        } else if (gameData.data?.game_meta?.game_visual) {
          gameVisualUrl = gameData.data.game_meta.game_visual.startsWith('http')
            ? gameData.data.game_meta.game_visual
            : `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.data.game_meta.game_visual}`;
        } else if (gameData.game_meta?.game_visual) {
          gameVisualUrl = gameData.game_meta.game_visual.startsWith('http')
            ? gameData.game_meta.game_visual
            : `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.game_meta.game_visual}`;
        } else if (gameData.game_visual) {
          gameVisualUrl = `https://admin.taghunter.fr/media/${scenario.uniqid}/${gameData.game_visual}`;
        }

        if (!backgroundUrl && (gameData.media?.images?.background_image || gameData.data?.game_meta?.background_image || gameData.game_meta?.background_image || gameData.backgroundImage)) {
          backgroundUrl = gameData.media?.images?.background_image ||
                         gameData.data?.game_meta?.background_image ||
                         gameData.game_meta?.background_image ||
                         gameData.backgroundImage;
          if (backgroundUrl && !backgroundUrl.startsWith('http')) {
            backgroundUrl = `https://admin.taghunter.fr/media/${scenario.uniqid}/${backgroundUrl}`;
          }
        }
      } catch (e) {
        console.error('Failed to parse data', e);
      }
    }

    return gameVisualUrl || backgroundUrl;
  };

  const renderScenarioCard = (scenario: Scenario) => {
    const thumbnailUrl = getScenarioThumbnail(scenario);

    return (
      <div
        key={scenario.id}
        className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all"
      >
        {thumbnailUrl && (
          <div className="relative w-full h-48 bg-slate-100">
            <img
              src={thumbnailUrl}
              alt={scenario.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
              loading="lazy"
            />
          </div>
        )}
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900 mb-2">{scenario.title}</h3>
              <p className="text-sm text-slate-600 line-clamp-2">{scenario.description}</p>
            </div>
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-slate-600">
                <Film className="w-4 h-4" />
                <span className="font-medium capitalize">{scenario.game_type}</span>
              </div>
              {getGameVersion(scenario) && (
                <div className="flex items-center space-x-1 text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  <Tag className="w-3 h-3" />
                  <span>v{getGameVersion(scenario)}</span>
                </div>
              )}
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
            {scenario.status && (
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                  scenario.status === 'published'
                    ? 'bg-green-100 text-green-700'
                    : scenario.status === 'archived'
                    ? 'bg-slate-200 text-slate-600'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {scenario.status}
                </span>
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
  };

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
                <h3 className="text-lg font-bold text-slate-900 px-4 py-2 bg-slate-100 rounded-lg capitalize">
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
