import { useState, useEffect } from 'react';
import { Image, Calendar, HardDrive, Film, X, AlertCircle, Grid3x3, List, Layers, Trash2, CheckSquare, Square, Music, Video, PlayCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { mediaApi, MediaFile, Scenario, scenariosApi, ScenarioData } from '../lib/api';

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
  const [scenarios, setScenarios] = useState<ScenarioData[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [collapsedScenarios, setCollapsedScenarios] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchMediaFiles();
    fetchScenarios();
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

  const fetchScenarios = async () => {
    try {
      const response = await scenariosApi.listScenarios();

      if (response.error) {
        throw new Error(response.error);
      }

      setScenarios(response.data?.scenarios || []);
    } catch (err) {
      console.error('Error fetching scenarios:', err);
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

  const handleDeleteMedia = async () => {
    if (!selectedMedia && selectedMediaIds.size === 0) return;

    setDeleting(true);
    try {
      if (bulkDeleteMode) {
        const mediasToDelete = mediaFiles.filter(m => selectedMediaIds.has(m.id));
        const deletePromises = mediasToDelete.map(media =>
          mediaApi.deleteMedia(media.scenario_uniqid, media.name)
        );

        const results = await Promise.allSettled(deletePromises);
        const failures = results.filter(r => r.status === 'rejected');

        if (failures.length > 0) {
          throw new Error(`Failed to delete ${failures.length} file(s)`);
        }

        setMediaFiles(mediaFiles.filter(m => !selectedMediaIds.has(m.id)));
        setSelectedMediaIds(new Set());
        setBulkDeleteMode(false);
      } else if (selectedMedia) {
        const response = await mediaApi.deleteMedia(
          selectedMedia.scenario_uniqid,
          selectedMedia.name
        );

        if (response.error) {
          throw new Error(response.error);
        }

        setMediaFiles(mediaFiles.filter(m => m.id !== selectedMedia.id));
        setSelectedMedia(null);
      }

      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Error deleting media:', err);
      alert('Failed to delete media file(s)');
    } finally {
      setDeleting(false);
    }
  };

  const toggleMediaSelection = (mediaId: string) => {
    const newSelection = new Set(selectedMediaIds);
    if (newSelection.has(mediaId)) {
      newSelection.delete(mediaId);
    } else {
      newSelection.add(mediaId);
    }
    setSelectedMediaIds(newSelection);
  };

  const selectAllMedia = () => {
    if (selectedMediaIds.size === mediaFiles.length) {
      setSelectedMediaIds(new Set());
    } else {
      setSelectedMediaIds(new Set(mediaFiles.map(m => m.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedMediaIds.size === 0) return;
    setBulkDeleteMode(true);
    setShowDeleteConfirm(true);
  };

  const toggleScenarioCollapse = (scenarioId: string) => {
    const newCollapsed = new Set(collapsedScenarios);
    if (newCollapsed.has(scenarioId)) {
      newCollapsed.delete(scenarioId);
    } else {
      newCollapsed.add(scenarioId);
    }
    setCollapsedScenarios(newCollapsed);
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

  const isAudioFile = (mimeType: string | null): boolean => {
    if (!mimeType) return false;
    return mimeType.startsWith('audio/');
  };

  const getScenarioName = (uniqid: string): string => {
    const scenario = scenarios.find(s => s.uniqid === uniqid);
    return scenario ? scenario.title : uniqid;
  };

  const groupMediaByScenario = () => {
    const grouped: Record<string, { name: string; files: MediaFile[] }> = {};

    mediaFiles.forEach(media => {
      const key = media.scenario_uniqid || 'Unassigned';
      if (!grouped[key]) {
        grouped[key] = {
          name: key === 'Unassigned' ? 'Unassigned Media' : getScenarioName(key),
          files: []
        };
      }
      grouped[key].files.push(media);
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
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 hover:bg-red-50 rounded-lg transition-all text-red-600"
                  title="Delete media"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setSelectedMedia(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-6">
            {(isVideoFile(selectedMedia.mime_type) || isAudioFile(selectedMedia.mime_type) || isImageFile(selectedMedia.mime_type)) && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">Preview</h4>
                <div className="bg-slate-900 rounded-lg overflow-hidden">
                  {isVideoFile(selectedMedia.mime_type) && (
                    <video
                      src={selectedMedia.url}
                      controls
                      className="w-full max-h-[500px]"
                      preload="metadata"
                    >
                      Your browser does not support the video tag.
                    </video>
                  )}
                  {isAudioFile(selectedMedia.mime_type) && (
                    <div className="p-8 flex flex-col items-center justify-center space-y-4">
                      <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center">
                        <Music className="w-12 h-12 text-slate-400" />
                      </div>
                      <audio
                        src={selectedMedia.url}
                        controls
                        className="w-full max-w-md"
                        preload="metadata"
                      >
                        Your browser does not support the audio tag.
                      </audio>
                    </div>
                  )}
                  {isImageFile(selectedMedia.mime_type) && (
                    <img
                      src={selectedMedia.url}
                      alt={selectedMedia.name}
                      className="w-full max-h-[500px] object-contain"
                    />
                  )}
                </div>
              </div>
            )}

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

        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-start space-x-4 mb-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-slate-900 mb-2">
                      {bulkDeleteMode ? 'Delete Multiple Media Files' : 'Delete Media File'}
                    </h3>
                    {bulkDeleteMode ? (
                      <p className="text-sm text-slate-600 mb-4">
                        Are you sure you want to delete <span className="font-semibold">{selectedMediaIds.size} media file(s)</span>? This action cannot be undone.
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-slate-600 mb-4">
                          Are you sure you want to delete <span className="font-semibold">{selectedMedia?.name}</span>?
                        </p>

                        {loadingScenarios ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-900"></div>
                          </div>
                        ) : relatedScenarios.length > 0 ? (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                            <p className="text-sm font-semibold text-yellow-800 mb-2">
                              This media is used in the following scenario:
                            </p>
                            <ul className="text-sm text-yellow-700 space-y-1">
                              {relatedScenarios.map(scenario => (
                                <li key={scenario.id} className="font-medium">• {scenario.title}</li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
                            <p className="text-sm text-slate-600">
                              This media is not used in any scenarios.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex items-center justify-end space-x-3 rounded-b-xl">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setBulkDeleteMode(false);
                  }}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMedia}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all disabled:opacity-50 flex items-center space-x-2"
                >
                  {deleting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>{bulkDeleteMode ? `Delete ${selectedMediaIds.size}` : 'Delete'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const renderMediaCard = (media: MediaFile) => {
    const isGrid = viewMode === 'grid';
    const isSelected = selectedMediaIds.has(media.id);

    return (
      <div
        key={media.id}
        className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-all ${
          isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'
        } ${isGrid ? '' : 'flex'}`}
      >
        <div
          className={`${isGrid ? 'aspect-video' : 'w-48 flex-shrink-0'} bg-slate-100 relative overflow-hidden cursor-pointer`}
          onClick={() => setSelectedMedia(media)}
        >
          <div className="absolute top-2 left-2 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleMediaSelection(media.id);
              }}
              className="p-1.5 bg-white rounded-lg shadow-md hover:bg-slate-50 transition-all"
            >
              {isSelected ? (
                <CheckSquare className="w-5 h-5 text-blue-600" />
              ) : (
                <Square className="w-5 h-5 text-slate-400" />
              )}
            </button>
          </div>
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
            <>
              <video
                src={media.url}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 pointer-events-none">
                <div className="bg-white bg-opacity-90 rounded-full p-3">
                  <PlayCircle className="w-10 h-10 text-slate-900" />
                </div>
              </div>
            </>
          ) : isAudioFile(media.mime_type) ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
              <div className="text-center">
                <Music className="w-16 h-16 text-white mx-auto mb-2" />
                <span className="text-white text-xs font-medium">Audio File</span>
              </div>
            </div>
          ) : null}
          <div className="hidden absolute inset-0 flex items-center justify-center bg-slate-100">
            <Film className="w-12 h-12 text-slate-400" />
          </div>

          {(isVideoFile(media.mime_type) || isAudioFile(media.mime_type)) && (
            <div className="absolute bottom-2 right-2">
              <div className="flex items-center space-x-1 bg-black bg-opacity-70 text-white text-xs font-medium px-2 py-1 rounded">
                {isVideoFile(media.mime_type) ? (
                  <>
                    <Video className="w-3 h-3" />
                    <span>Video</span>
                  </>
                ) : (
                  <>
                    <Music className="w-3 h-3" />
                    <span>Audio</span>
                  </>
                )}
              </div>
            </div>
          )}
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
          {scenarioIds.map(scenarioId => {
            const isCollapsed = collapsedScenarios.has(scenarioId);
            return (
              <div key={scenarioId} className="space-y-3">
                <button
                  onClick={() => toggleScenarioCollapse(scenarioId)}
                  className="flex items-center space-x-2 w-full text-left hover:bg-slate-50 rounded-lg p-2 -ml-2 transition-all group"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
                  )}
                  <Layers className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
                  <h3 className="text-lg font-semibold text-slate-900">
                    {grouped[scenarioId].name}
                  </h3>
                  <span className="text-sm text-slate-500">({grouped[scenarioId].files.length})</span>
                </button>
                {!isCollapsed && (
                  <div className={viewMode === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                    : 'space-y-3'
                  }>
                    {grouped[scenarioId].files.map(renderMediaCard)}
                  </div>
                )}
              </div>
            );
          })}
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
            <span>By Type</span>
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

      {mediaFiles.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={selectAllMedia}
                className="flex items-center space-x-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-all"
              >
                {selectedMediaIds.size === mediaFiles.length ? (
                  <CheckSquare className="w-5 h-5 text-blue-600" />
                ) : (
                  <Square className="w-5 h-5 text-slate-400" />
                )}
                <span>
                  {selectedMediaIds.size === 0
                    ? 'Select All'
                    : `${selectedMediaIds.size} selected`}
                </span>
              </button>
              {selectedMediaIds.size > 0 && (
                <button
                  onClick={() => setSelectedMediaIds(new Set())}
                  className="text-sm text-slate-600 hover:text-slate-900 transition-all"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {selectedMediaIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Selected ({selectedMediaIds.size})</span>
              </button>
            )}
          </div>
        </div>
      )}

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
