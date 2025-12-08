import { useState, useEffect } from 'react';
import { Image, Calendar, HardDrive, Film, X, AlertCircle, Grid3x3, List, Layers } from 'lucide-react';
import { mediaApi, MediaFile, Scenario } from '../lib/api';

type ViewMode = 'grid' | 'list';
type GroupMode = 'all' | 'scenario';

export function MediaView() {
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);
  const [relatedScenarios, setRelatedScenarios] = useState<Scenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [groupMode, setGroupMode] = useState<GroupMode>('all');

  useEffect(() => {
    fetchMediaFiles();
  }, []);

  useEffect(() => {
    if (selectedMedia) {
      fetchRelatedScenarios(selectedMedia.scenario_uniqid);
    }
  }, [selectedMedia]);

  const fetchMediaFiles = async () => {
    try {
      const response = await mediaApi.listMedia();

      if (response.error) {
        throw new Error(response.error);
      }

      setMediaFiles(response.data?.media || []);
    } catch (err) {
      console.error('Error fetching media files:', err);
      setError('Failed to load media files');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedScenarios = async (uniqid: string) => {
    setLoadingScenarios(true);
    try {
      const response = await mediaApi.getMediaScenarios(uniqid);

      if (response.error) {
        throw new Error(response.error);
      }

      setRelatedScenarios(response.data?.scenarios || []);
    } catch (err) {
      console.error('Error fetching related scenarios:', err);
      setRelatedScenarios([]);
    } finally {
      setLoadingScenarios(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const isImageFile = (mimeType: string | null): boolean => {
    if (!mimeType) return false;
    return mimeType.startsWith('image/');
  };

  const isVideoFile = (mimeType: string | null): boolean => {
    if (!mimeType) return false;
    return mimeType.startsWith('video/');
  };

  const groupMediaByScenario = () => {
    const grouped: Record<string, MediaFile[]> = {};

    mediaFiles.forEach(media => {
      const key = media.scenario_uniqid || 'Unassigned';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(media);
    });

    return grouped;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
        <AlertCircle className="w-5 h-5 text-red-600" />
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (selectedMedia) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedMedia(null)}
          className="text-slate-600 hover:text-slate-900 font-medium"
        >
          ← Back to media files
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-slate-900 mb-2">{selectedMedia.name}</h3>
                <div className="flex items-center space-x-6 text-sm text-slate-600">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(selectedMedia.created_at).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <HardDrive className="w-4 h-4" />
                    <span>{formatFileSize(selectedMedia.size)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedMedia(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">File Details</h4>
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">File Name:</span>
                  <span className="font-medium text-slate-900">{selectedMedia.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Type:</span>
                  <span className="font-medium text-slate-900">
                    {selectedMedia.mime_type || 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Size:</span>
                  <span className="font-medium text-slate-900">
                    {formatFileSize(selectedMedia.size)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Created:</span>
                  <span className="font-medium text-slate-900">
                    {new Date(selectedMedia.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Last Updated:</span>
                  <span className="font-medium text-slate-900">
                    {new Date(selectedMedia.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Public URL</h4>
              <div className="bg-slate-50 rounded-lg p-3">
                <code className="text-xs text-slate-600 break-all">{selectedMedia.url}</code>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center space-x-2">
                <Film className="w-4 h-4" />
                <span>Used in Scenarios</span>
              </h4>
              {loadingScenarios ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-900"></div>
                </div>
              ) : relatedScenarios.length === 0 ? (
                <div className="bg-slate-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-slate-600">No scenarios are using this media file</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {relatedScenarios.map((scenario) => (
                    <div
                      key={scenario.id}
                      className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-semibold text-slate-900 mb-1">{scenario.title}</h5>
                          <div className="flex items-center space-x-4 text-sm text-slate-600">
                            <span className="font-medium">{scenario.game_type}</span>
                            <span>•</span>
                            <span>{new Date(scenario.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderMediaCard = (media: MediaFile) => {
    const isGrid = viewMode === 'grid';

    return (
      <div
        key={media.id}
        className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all cursor-pointer ${
          isGrid ? '' : 'flex'
        }`}
        onClick={() => setSelectedMedia(media)}
      >
        <div className={`${isGrid ? 'aspect-video' : 'w-48 flex-shrink-0'} bg-slate-100 relative overflow-hidden`}>
          {isImageFile(media.mime_type) ? (
            <img
              src={media.url}
              alt={media.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : isVideoFile(media.mime_type) ? (
            <video
              src={media.url}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
          ) : null}
          <div className="hidden absolute inset-0 flex items-center justify-center bg-slate-100">
            <Film className="w-12 h-12 text-slate-400" />
          </div>
        </div>

        <div className="p-4 flex-1">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-900 truncate">{media.name}</h3>
              <p className="text-xs text-slate-500 truncate">
                {media.mime_type || 'Unknown type'}
              </p>
            </div>
          </div>

          <div className={`${isGrid ? 'space-y-1' : 'flex items-center space-x-4'} text-xs text-slate-600`}>
            <div className="flex items-center space-x-1">
              <HardDrive className="w-3 h-3" />
              <span>{formatFileSize(media.size)}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Calendar className="w-3 h-3" />
              <span>{new Date(media.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMediaList = () => {
    if (groupMode === 'scenario') {
      const grouped = groupMediaByScenario();
      const scenarioIds = Object.keys(grouped).sort();

      return (
        <div className="space-y-6">
          {scenarioIds.map(scenarioId => (
            <div key={scenarioId} className="space-y-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">
                  {scenarioId === 'Unassigned' ? 'Unassigned Media' : `Scenario: ${scenarioId}`}
                </h3>
                <span className="text-sm text-slate-500">({grouped[scenarioId].length})</span>
              </div>
              <div className={viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'space-y-3'
              }>
                {grouped[scenarioId].map(renderMediaCard)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className={viewMode === 'grid'
        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
        : 'space-y-3'
      }>
        {mediaFiles.map(renderMediaCard)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setGroupMode('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              groupMode === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Media
          </button>
          <button
            onClick={() => setGroupMode('scenario')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all inline-flex items-center space-x-2 ${
              groupMode === 'scenario'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>By Scenario</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg transition-all ${
              viewMode === 'grid'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title="Grid view"
          >
            <Grid3x3 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-lg transition-all ${
              viewMode === 'list'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            title="List view"
          >
            <List className="w-5 h-5" />
          </button>
        </div>
      </div>

      {mediaFiles.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-12 text-center">
          <Image className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Media Files</h3>
          <p className="text-slate-600">No media files have been uploaded yet.</p>
        </div>
      ) : (
        renderMediaList()
      )}
    </div>
  );
}
